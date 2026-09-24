import {cartTotal, newOrderId} from './cart.js';
import {STORE} from '../data/store.js';
import {matchZone, rateFor, zipDecidesZone} from './shipping.js';
import {CURRENCY, parseCart, parseConfig, toQuery} from './config.js';
import {isValidPostcode} from './countries.js';
import {monei as client, env} from './monei.js';

// Generated per page load in the browser, so no two shoppers share one.
const SESSION_RE = /^[A-Za-z0-9]{16,64}$/;

// `PUBLIC_URL` wins so a tunnel still gets its public URL.
const origin = (requestUrl) => (env.PUBLIC_URL || new URL(requestUrl).origin).replace(/\/$/, '');

const invalid = (message, code = message) => Object.assign(new Error(message), {code});

/**
 * The posted cart priced from the catalogue. A cart with any line the whitelist
 * drops is refused whole, since pricing what is left would charge a different
 * basket from the one on the page.
 */
export const goodsFor = (cart) => {
  const items = typeof cart === 'string' ? parseCart(cart) : null;
  const entries = cart === '' ? 0 : String(cart).split(',').length;
  if (!items || items.length !== entries) throw invalid('Invalid cart');
  const goods = cartTotal(items);
  if (goods <= 0) throw invalid('The cart is empty', 'empty');
  return goods;
};

// Names the payment this browser opened, so only it sees the shopper's details on the receipt.
export const RECEIPT_COOKIE = 'monei-receipt';

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

/**
 * Recomputes the amount rather than trusting the request. Wallet tokens carry no
 * amount, so a posted `walletAmount` is only a claim: prices come from the fixed
 * catalogue, and shipping from the zone of the address the order ships to.
 */
export const resolveAmount = ({cart, address, optionId}) => {
  const goods = goodsFor(cart);
  if (!address?.country) throw invalid('Missing shipping address');
  // Where the postcode picks the zone, a malformed one would fall through to a cheaper one.
  const country = String(address.country).trim().toUpperCase();
  if (zipDecidesZone(country) && !isValidPostcode(country, address.zip)) throw invalid('Invalid postcode');

  const zone = matchZone(address);
  return {amount: goods + rateFor(zone.id, optionId).amount, goods, zone: zone.id};
};

/**
 * Creates the payment unconfirmed. `monei.confirmPayment` confirms it in the
 * browser, where a 3D Secure challenge opens in a popup over the checkout rather
 * than as a redirect.
 */
export const createPayment = async ({
  monei,
  amount,
  currency,
  customer,
  billingDetails,
  shippingDetails,
  sessionId,
  config,
  baseUrl
}) => {
  const orderId = newOrderId();

  // MONEI returns the shopper to these URLs directly, so the demo's config survives
  // the redirect only if it travels on them.
  const state = config ? `&${config}` : '';

  return monei.payments.create({
    amount,
    currency,
    orderId,
    sessionId,
    description: `${STORE.name} — order ${orderId}`,
    customer,
    billingDetails,
    shippingDetails,
    completeUrl: `${baseUrl}/receipt?from=payment${state}`,
    cancelUrl: `${baseUrl}/cancelled?from=payment${state}`,
    callbackUrl: `${baseUrl}/api/callback`
  });
};

/**
 * Both payment routes: price the order, open the payment, and hand it to `respond`
 * for the flow's own reply. The browser supplies what was ordered, never the amount.
 */
export const paymentRoute =
  (respond) =>
  async ({request, cookies}) => {
    if (!client) return json({error: 'MONEI_API_KEY is not configured'}, 500);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({error: 'Invalid JSON'}, 400);
    }

    const {sessionId, cart, optionId, walletAmount, customer, address, billing, search} = body ?? {};
    if (typeof sessionId !== 'string' || !SESSION_RE.test(sessionId)) return json({error: 'Invalid session'}, 400);

    // Reparsed rather than forwarded: `search` is the client's query string, and it
    // ends up in a redirect URL MONEI follows, so only whitelisted params may pass.
    const config = toQuery(parseConfig(new URL(`http://x/?${String(search ?? '').replace(/^\?/, '')}`)));

    let resolved;
    try {
      resolved = resolveAmount({cart, address, optionId});
    } catch (error) {
      return json({error: error.message}, 400);
    }

    // A wallet-reported total that disagrees with the recomputed one means the sheet
    // and the server priced the order differently; refusing is the only safe answer.
    if (walletAmount != null && Number(walletAmount) !== resolved.amount) {
      console.warn(`Amount mismatch: wallet reported ${walletAmount}, server computed ${resolved.amount}`);
      return json({error: 'Amount mismatch', expected: resolved.amount}, 422);
    }

    const shippingDetails = {name: customer?.name, address};
    const billingDetails = billing?.address
      ? {name: billing.name ?? customer?.name, address: billing.address}
      : shippingDetails;

    try {
      const payment = await createPayment({
        monei: client,
        amount: resolved.amount,
        currency: CURRENCY,
        sessionId,
        customer,
        billingDetails,
        shippingDetails,
        config,
        baseUrl: origin(request.url)
      });
      cookies?.set(RECEIPT_COOKIE, payment.id, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: new URL(request.url).protocol === 'https:',
        maxAge: 60 * 60 * 24
      });
      return respond(payment);
    } catch (error) {
      console.error('payments.create failed', error);
      return json({error: error.message ?? 'Payment could not be created'}, 502);
    }
  };
