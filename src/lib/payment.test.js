import {describe, expect, it, vi} from 'vitest';
import {createPayment, resolveAmount} from './payment.js';
import {cartTotal} from './cart.js';

const CART = [
  {productId: 'ethiopia-guji', quantity: 2},
  {productId: 'stoneware-cup', quantity: 1}
];
const MAINLAND = {country: 'ES', zip: '28014'};

const resolve = (overrides = {}) =>
  resolveAmount({
    cart: 'ethiopia-guji:2,stoneware-cup:1',
    address: MAINLAND,
    optionId: 'standard',
    ...overrides
  });

describe('resolveAmount', () => {
  it('prices the posted cart from the catalogue, since the client never sends an amount', () => {
    const resolved = resolve();

    expect(resolved.goods).toBe(cartTotal(CART));
    expect(resolved.amount).toBe(cartTotal(CART) + 499);
    expect(resolved.zone).toBe('peninsula');
  });

  it('takes the zone from the address the order ships to', () => {
    const resolved = resolve({address: {country: 'ES', zip: '38002'}, optionId: 'canary-standard'});

    expect(resolved.amount).toBe(cartTotal(CART) + 1499);
  });

  /**
   * A wallet sheet sees a redacted address with no postcode, which prices as
   * mainland. The final address carries the Canary postcode, and the mainland
   * option picked in the sheet must not survive it.
   */
  it('refuses a mainland option for a Canary address', () => {
    expect(() => resolve({address: {country: 'ES', zip: '38002'}, optionId: 'standard'})).toThrow(
      /unknown shipping option/i
    );
  });

  it('refuses an option from another zone, so an international order cannot buy mainland postage', () => {
    expect(() => resolve({address: {country: 'US', zip: '90210'}})).toThrow(/unknown shipping option/i);
  });

  it('refuses an unknown option rather than shipping free', () => {
    expect(() => resolve({optionId: 'no-such-rate'})).toThrow(/unknown shipping option/i);
  });

  /** A missing address matches the catch-all zone, whose option would otherwise be accepted. */
  it('refuses a missing address even with an option the catch-all zone offers', () => {
    expect(() => resolve({address: undefined, optionId: 'international'})).toThrow(/missing shipping address/i);
    expect(() => resolve({address: {zip: '28014'}, optionId: 'international'})).toThrow(/missing shipping address/i);
  });

  /**
   * The page shows the cart it holds. Substituting another basket for one that fails
   * validation would charge for goods the shopper never saw.
   */
  it('refuses a cart that fails validation instead of pricing a different basket', () => {
    expect(() => resolve({cart: 'ethiopia-guji:100'})).toThrow(/invalid cart/i);
    expect(() => resolve({cart: 'no-such-product:1'})).toThrow(/invalid cart/i);
    expect(() => resolve({cart: undefined})).toThrow(/invalid cart/i);
  });

  it('refuses an emptied cart rather than charging for shipping alone', () => {
    expect(() => resolve({cart: ''})).toThrow(/empty/i);
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
    const sent = await call({config: 'theme=monoline&flow=redirect'});

    expect(sent.completeUrl).toContain('theme=monoline&flow=redirect');
    expect(sent.cancelUrl).toContain('theme=monoline&flow=redirect');
  });

  it('gives every attempt a fresh orderId, because MONEI treats it as a duplicate guard', async () => {
    const first = await call();
    const second = await call();

    expect(first.orderId).toMatch(/^[A-Z0-9]{12}$/);
    expect(first.orderId).not.toBe(second.orderId);
  });
});
