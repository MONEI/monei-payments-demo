import {cartTotal, seededCart} from '../../lib/cart.js';
import {isServiceable, matchZone, ratesFor} from '../../lib/shipping.js';
import {signQuote} from '../../lib/quote.js';

export const prerender = false;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'}
  });

/**
 * Takes `{seed, address}` and never an amount: the goods total is recomputed from
 * the seed and the shipping rate from the zone this endpoint picks, so the only
 * number the client can influence is which of the returned options it selects.
 *
 * Mirrors what a merchant's own rate endpoint does, which is why the returned
 * quote is signed — /api/payment verifies it before creating a payment.
 */
export const POST = async ({request}) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({error: 'Invalid JSON'}, 400);
  }

  const {seed, address} = body ?? {};
  if (typeof seed !== 'string' || !/^[a-z0-9]{1,16}$/.test(seed)) {
    return json({error: 'Invalid seed'}, 400);
  }

  const zone = matchZone(address ?? {});
  const rates = ratesFor(zone);

  if (!isServiceable(zone)) {
    return json({error: 'unserviceable', zone: zone.id, label: zone.label}, 422);
  }

  const goods = cartTotal(seededCart(seed));
  const {quote, sig} = signQuote({seed, zone: zone.id, rates});

  return json({
    zone: zone.id,
    label: zone.label,
    shippingOptions: rates,
    amount: goods + rates[0].amount,
    quote,
    sig
  });
};
