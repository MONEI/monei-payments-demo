import {cartTotal, seededCart} from '../../lib/cart.js';
import {isServiceable, matchZone, ratesFor, shippableRatesFor} from '../../lib/shipping.js';
import {signQuote} from '../../lib/quote.js';
import {parseCart} from '../../lib/config.js';

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

  const {seed, cart, address, wallet} = body ?? {};
  if (typeof seed !== 'string' || !/^[a-z0-9]{1,16}$/.test(seed)) {
    return json({error: 'Invalid seed'}, 400);
  }

  const zone = matchZone(address ?? {});
  const rates = wallet ? shippableRatesFor(zone) : ratesFor(zone);

  if (!isServiceable(zone)) {
    return json({error: 'unserviceable', zone: zone.id, label: zone.label}, 422);
  }

  // Quantities are the shopper's, so they go through the same whitelist as the URL
  // param before being signed into the quote.
  const items = parseCart(typeof cart === 'string' ? cart : null) ?? seededCart(seed);
  const goods = cartTotal(items);
  if (goods <= 0) return json({error: 'empty'}, 422);

  const {quote, sig} = signQuote({seed, cart: items, zone: zone.id, rates});

  return json({
    zone: zone.id,
    label: zone.label,
    shippingOptions: rates,
    amount: goods + rates[0].amount,
    quote,
    sig
  });
};
