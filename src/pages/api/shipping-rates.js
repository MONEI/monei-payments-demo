import {matchZone, ratesFor, shippableRatesFor} from '../../lib/shipping.js';
import {goodsFor, json} from '../../lib/payment.js';

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

  let goods;
  try {
    goods = goodsFor(cart);
  } catch (error) {
    return json({error: error.code}, error.code === 'empty' ? 422 : 400);
  }

  return json({
    zone: zone.id,
    label: zone.label,
    shippingOptions: rates,
    amount: goods + rates[0].amount
  });
};
