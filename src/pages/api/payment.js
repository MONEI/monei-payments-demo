import {json, paymentRoute} from '../../lib/payment.js';

export const prerender = false;

/**
 * Prices the order and opens a payment for it. The browser confirms that payment
 * with the token it holds, so no card data reaches this server. The settled status
 * arrives separately at /api/callback, which fires even if the tab closes mid-3DS.
 */
export const POST = paymentRoute((payment) =>
  json({id: payment.id, status: payment.status, nextAction: payment.nextAction ?? null})
);
