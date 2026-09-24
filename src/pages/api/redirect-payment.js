import {json, paymentRoute} from '../../lib/payment.js';

export const prerender = false;

/**
 * Prices the order the same way the Components flow does, then hands back the
 * hosted page's URL from `nextAction` rather than leaving the payment for the
 * browser to confirm.
 */
export const POST = paymentRoute((payment) => {
  const redirectUrl = payment.nextAction?.redirectUrl;
  if (!redirectUrl) return json({error: 'No redirect URL was returned', id: payment.id}, 502);
  return json({id: payment.id, redirectUrl});
});
