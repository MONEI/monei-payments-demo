import {beforeAll, describe, expect, it, vi} from 'vitest';
import {createPayment, resolveAmount} from './payment.js';
import {signQuote} from './quote.js';
import {cartTotal} from './cart.js';

beforeAll(() => {
  process.env.QUOTE_SECRET = 'test-secret';
});

const CART = [
  {productId: 'ethiopia-guji', quantity: 2},
  {productId: 'stoneware-cup', quantity: 1}
];

const signed = (overrides = {}) => signQuote({seed: 'abc123', cart: CART, zone: 'peninsula', rates: [], ...overrides});

describe('resolveAmount', () => {
  it('prices from the signed cart rather than anything the client sends', () => {
    const {quote, sig} = signed();
    const resolved = resolveAmount({quote, sig, optionId: 'standard'});

    expect(resolved.goods).toBe(cartTotal(CART));
    expect(resolved.amount).toBe(cartTotal(CART) + 499);
    expect(resolved.zone).toBe('peninsula');
    expect(resolved.seed).toBe('abc123');
  });

  it('adds the rate belonging to the signed zone, not the cheapest one that exists', () => {
    const {quote, sig} = signed({zone: 'canary'});
    const resolved = resolveAmount({quote, sig, optionId: 'canary-standard'});

    expect(resolved.amount).toBe(cartTotal(CART) + 1499);
  });

  it('refuses an option from another zone, so an international order cannot buy mainland postage', () => {
    const {quote, sig} = signed({zone: 'row'});

    expect(() => resolveAmount({quote, sig, optionId: 'standard'})).toThrow(/unknown shipping option/i);
  });

  it('refuses an unknown option rather than shipping free', () => {
    const {quote, sig} = signed();

    expect(() => resolveAmount({quote, sig, optionId: 'no-such-rate'})).toThrow(/unknown shipping option/i);
  });

  it('refuses a forged signature, which is the only thing standing between a client and its own price', () => {
    const {quote} = signed();

    expect(() => resolveAmount({quote, sig: 'forged', optionId: 'standard'})).toThrow(/invalid/i);
  });

  it('falls back to the seeded cart when the quote carries none, so an older quote still prices', () => {
    const {quote, sig} = signQuote({seed: 'abc123', zone: 'peninsula', rates: []});
    const resolved = resolveAmount({quote, sig, optionId: 'standard'});

    expect(resolved.goods).toBeGreaterThan(0);
    expect(resolved.amount).toBe(resolved.goods + 499);
  });
});

describe('createPayment', () => {
  const call = async (overrides = {}) => {
    const create = vi.fn().mockResolvedValue({id: 'pay_1', status: 'PENDING'});
    await createPayment({
      monei: {payments: {create}},
      amount: 2599,
      currency: 'EUR',
      sessionId: 'abc123',
      ...overrides
    });
    return create.mock.calls[0][0];
  };

  it('omits paymentToken, leaving the payment for the browser to confirm', async () => {
    const sent = await call();

    expect(sent).not.toHaveProperty('paymentToken');
    expect(sent.amount).toBe(2599);
    expect(sent.currency).toBe('EUR');
    expect(sent.sessionId).toBe('abc123');
  });

  it('sends the three URLs, since a blocked 3DS popup and a closed tab both need them', async () => {
    const sent = await call();

    expect(sent.completeUrl).toMatch(/\/receipt\?from=payment/);
    expect(sent.cancelUrl).toMatch(/\/cancelled\?from=payment/);
    expect(sent.callbackUrl).toMatch(/\/api\/callback$/);
  });

  it('carries the demo config on the return URLs, which is all that survives a redirect', async () => {
    const sent = await call({config: 'theme=monoline&layout=grid'});

    expect(sent.completeUrl).toContain('theme=monoline&layout=grid');
    expect(sent.cancelUrl).toContain('theme=monoline&layout=grid');
  });

  it('gives every attempt a fresh orderId, because MONEI treats it as a duplicate guard', async () => {
    const first = await call();
    const second = await call();

    expect(first.orderId).toMatch(/^[A-Z0-9]{12}$/);
    expect(first.orderId).not.toBe(second.orderId);
  });
});
