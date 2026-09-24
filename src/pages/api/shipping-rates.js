import {cartTotal} from '../../lib/cart.js';
import {matchZone, ratesFor, shippableRatesFor} from '../../lib/shipping.js';
import {parseCart} from '../../lib/config.js';
import {json} from '../../lib/payment.js';

export const prerender = false;

/**
 * Takes `{cart, address, wallet}` and never an amount. The total it returns is only
 * for display: /api/payment prices the order again from the same inputs. `wallet`
 * leaves out the options a wallet sheet cannot show.
 */
export const POST = async ({request}) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({error: 'Invalid JSON'}, 400);
  }

  const {cart, address, wallet} = body ?? {};

  const zone = matchZone(address ?? {});
  const rates = wallet ? shippableRatesFor(zone) : ratesFor(zone);
  if (rates.length === 0) return json({error: 'unserviceable', zone: zone.id, label: zone.label}, 422);

  // Quantities are the shopper's, so they go through the same whitelist as the URL param.
  const items = parseCart(typeof cart === 'string' ? cart : null);
  if (!items) return json({error: 'Invalid cart'}, 400);
  const goods = cartTotal(items);
  if (goods <= 0) return json({error: 'empty'}, 422);

  return json({
    zone: zone.id,
    label: zone.label,
    shippingOptions: rates,
    amount: goods + rates[0].amount
  });
};
