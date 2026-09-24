import {cartTotal, newOrderId} from './cart.js';
import {STORE} from '../data/store.js';
import {matchZone, rateFor} from './shipping.js';
import {CURRENCY, parseCart, parseConfig, toQuery} from './config.js';
import {monei as client} from './monei.js';

const env = import.meta.env ?? process.env;

// Generated per page load in the browser, so no two shoppers share one.
const SESSION_RE = /^[A-Za-z0-9]{16,64}$/;

/**
 * `HOSTNAME` wins so a tunnel still gets its public URL; without it the request's
 * own origin is used. A tunnel or a deployment serves HTTPS; the local dev server
 * serves plain HTTP.
 */
const origin = (requestUrl) => {
  if (!env.HOSTNAME) return requestUrl ? new URL(requestUrl).origin : 'http://localhost:4321';
  const host = env.HOSTNAME;
  const scheme = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${scheme}://${host}`;
};

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

/**
 * Recomputes the amount rather than trusting the request. Wallet tokens carry no
 * amount, so a posted `finalAmount` is only a claim: prices come from the fixed
 * catalogue, and shipping from the zone of the address the order ships to.
 */
export const resolveAmount = ({cart, address, optionId}) => {
  const items = parseCart(typeof cart === 'string' ? cart : null);
  if (!items) throw new Error('Invalid cart');
  const goods = cartTotal(items);
  if (goods <= 0) throw new Error('The cart is empty');
  if (!address?.country) throw new Error('Missing shipping address');

  const zone = matchZone(address);
  const rate = rateFor(zone.id, optionId);
  return {amount: goods + rate.amount, goods, rate, zone: zone.id};
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
  baseUrl = origin()
}) => {
  const orderId = newOrderId();

  // The payment processor returns the shopper to these URLs directly, so the demo's
  // config survives the redirect only if it travels on them.
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
  async ({request}) => {
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
    // ends up in a redirect URL the payment processor follows, so only whitelisted
    // params may pass.
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
      return respond(payment);
    } catch (error) {
      console.error('payments.create failed', error);
      return json({error: error.message ?? 'Payment could not be created'}, 502);
    }
  };
