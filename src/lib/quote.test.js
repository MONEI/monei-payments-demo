import {beforeAll, describe, expect, it, vi} from 'vitest';
import {createHmac} from 'node:crypto';
import {signQuote, verifyQuote} from './quote.js';

beforeAll(() => {
  process.env.QUOTE_SECRET = 'test-secret';
});

const CART = [{productId: 'coffee-beans', quantity: 2}];
const RATES = [{id: 'standard', amount: 499}];

const sign = () => signQuote({seed: 'abc123', cart: CART, zone: 'eu', rates: RATES});

describe('signQuote', () => {
  it('round-trips the fields the amount is recomputed from', () => {
    const {quote, sig} = sign();
    const verified = verifyQuote(quote, sig);

    expect(verified.seed).toBe('abc123');
    expect(verified.cart).toEqual(CART);
    expect(verified.zone).toBe('eu');
    expect(verified.rates).toEqual(RATES);
  });

  it('expires, so a quote cannot be replayed after prices or zones change', () => {
    const {quote, sig} = sign();

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    expect(() => verifyQuote(quote, sig)).toThrow(/expired/i);
    vi.useRealTimers();
  });
});

describe('verifyQuote', () => {
  it('rejects an edited cart, which is how a shopper would pay less than the goods cost', () => {
    const {sig} = sign();
    const tampered = Buffer.from(
      JSON.stringify({
        seed: 'abc123',
        cart: [{productId: 'coffee-beans', quantity: 99}],
        zone: 'eu',
        rates: RATES,
        exp: Math.floor(Date.now() / 1000) + 900
      })
    ).toString('base64url');

    expect(() => verifyQuote(tampered, sig)).toThrow(/invalid/i);
  });

  it('rejects an edited zone, which is how a shopper would pay domestic rates from abroad', () => {
    const {sig} = sign();
    const tampered = Buffer.from(
      JSON.stringify({seed: 'abc123', cart: CART, zone: 'es', rates: RATES, exp: Math.floor(Date.now() / 1000) + 900})
    ).toString('base64url');

    expect(() => verifyQuote(tampered, sig)).toThrow(/invalid/i);
  });

  it('rejects a signature from a different secret, so quotes do not transfer between deployments', () => {
    const {quote} = sign();
    process.env.QUOTE_SECRET = 'other-secret';
    const {sig: foreign} = sign();
    process.env.QUOTE_SECRET = 'test-secret';

    expect(() => verifyQuote(quote, foreign)).toThrow(/invalid/i);
  });

  it('rejects a missing quote or signature rather than treating absence as valid', () => {
    const {quote, sig} = sign();
    expect(() => verifyQuote(undefined, sig)).toThrow(/missing/i);
    expect(() => verifyQuote(quote, undefined)).toThrow(/missing/i);
  });

  it('rejects a signature of the wrong length without throwing from timingSafeEqual', () => {
    const {quote} = sign();
    expect(() => verifyQuote(quote, 'short')).toThrow(/invalid/i);
  });

  it('reports a correctly signed but unreadable payload as malformed, not as tampering', () => {
    const notJson = Buffer.from('not json').toString('base64url');
    const sig = createHmac('sha256', 'test-secret').update(notJson).digest('base64url');

    expect(() => verifyQuote(notJson, sig)).toThrow(/malformed/i);
  });
});
