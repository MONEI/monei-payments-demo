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
 * amount, so a posted `finalAmount` is only a claim: goods come from the seed and
 * the fixed catalogue, shipping from the zone inside the signed quote.
 */
export const resolveAmount = ({quote, sig, optionId}) => {
  const verified = verifyQuote(quote, sig);
  const goods = cartTotal(seededCart(verified.seed));
  const rate = rateFor(verified.zone, optionId);
  return {amount: goods + rate.amount, goods, rate, zone: verified.zone, seed: verified.seed};
};

/**
 * Passing `paymentToken` confirms the payment in the same call, so there is no
 * separate confirm step. `completeUrl` is needed even outside the redirect flow —
 * a 3D Secure challenge returns there.
 */
export const createPayment = async ({
  monei,
  amount,
  currency,
  paymentToken,
  customer,
  billingDetails,
  shippingDetails,
  sessionId
}) => {
  const orderId = newOrderId();
  const base = origin();

  return monei.payments.create({
    amount,
    currency,
    orderId,
    sessionId,
    paymentToken,
    description: `${STORE.name} — order ${orderId}`,
    customer,
    billingDetails,
    shippingDetails,
    completeUrl: `${base}/receipt`,
    cancelUrl: `${base}/cancelled`,
    callbackUrl: `${base}/api/callback`
  });
};
