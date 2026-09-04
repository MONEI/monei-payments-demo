import {createHmac, timingSafeEqual} from 'node:crypto';

const env = import.meta.env ?? process.env;

const TTL_SECONDS = 15 * 60;

const secret = () => env.QUOTE_SECRET || env.MONEI_API_KEY || '';

const digest = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

/**
 * Shipping costs money, and the zone that decides how much is derived from an
 * address only the browser has. Signing the server's decision means the amount
 * can be recomputed later from data the client cannot alter.
 *
 * `optionId` is intentionally outside the signature: the shopper picks a shipping
 * option after the quote is issued, and the server validates it against the signed
 * `rates` list, so choosing a cheaper listed option is a real choice rather than
 * tampering. `seed` is inside, so a quote cannot be replayed against a bigger cart.
 */
export const signQuote = ({seed, zone, rates}) => {
  const quote = {seed, zone, rates, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS};
  const encoded = Buffer.from(JSON.stringify(quote)).toString('base64url');
  return {quote: encoded, sig: digest(encoded)};
};

export const verifyQuote = (encoded, sig) => {
  if (!encoded || !sig) throw new Error('Missing shipping quote');

  const expected = digest(encoded);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid shipping quote');

  let quote;
  try {
    quote = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed shipping quote');
  }

  if (!quote?.exp || quote.exp < Math.floor(Date.now() / 1000)) throw new Error('Shipping quote expired');
  
  return quote;
};
