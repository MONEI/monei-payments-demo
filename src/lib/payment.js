import {cartTotal, newOrderId, seededCart} from './cart.js';
import {STORE} from '../data/store.js';
import {rateFor} from './shipping.js';
import {verifyQuote} from './quote.js';

const env = import.meta.env ?? process.env;

// MONEI requires HTTPS for these URLs, so a plain-HTTP dev server can only be
// reached over a tunnel. Localhost is allowed http so the redirect back works.
const origin = () => {
  const host = env.HOSTNAME || 'localhost:4321';
  const scheme = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${scheme}://${host}`;
};

/**
 * Recomputes the amount rather than trusting the request. Wallet tokens carry no
 * amount, so a posted `finalAmount` is only a claim: quantities come from the signed
 * quote and prices from the fixed catalogue, shipping from the signed zone.
 */
export const resolveAmount = ({quote, sig, optionId}) => {
  const verified = verifyQuote(quote, sig);
  const goods = cartTotal(verified.cart ?? seededCart(verified.seed));
  const rate = rateFor(verified.zone, optionId);
  return {amount: goods + rate.amount, goods, rate, zone: verified.zone, seed: verified.seed};
};

/**
 * Creates the payment unconfirmed. `monei.confirmPayment` confirms it in the
 * browser, where a 3D Secure challenge opens in a popup over the checkout rather
 * than as a redirect. `completeUrl` is still reached when that popup is blocked.
 */
export const createPayment = async ({
  monei,
  amount,
  currency,
  customer,
  billingDetails,
  shippingDetails,
  sessionId,
  config
}) => {
  const orderId = newOrderId();
  const base = origin();

  // The provider returns the shopper to these URLs directly, so the demo's config
  // survives the redirect only if it travels on them.
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
    completeUrl: `${base}/receipt?from=payment${state}`,
    cancelUrl: `${base}/cancelled?from=payment${state}`,
    callbackUrl: `${base}/api/callback`
  });
};
