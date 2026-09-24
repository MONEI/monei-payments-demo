import {beforeEach, describe, expect, it, vi} from 'vitest';

const create = vi.fn();
vi.mock('./monei.js', () => ({monei: {payments: {create: (...args) => create(...args)}}, env: {}}));

const {createPayment, paymentRoute, resolveAmount} = await import('./payment.js');
const {cartTotal} = await import('./cart.js');

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

  it('refuses the whole cart when one line fails, rather than charging for the rest', () => {
    expect(() => resolve({cart: 'ethiopia-guji:100,stoneware-cup:1'})).toThrow(/invalid cart/i);
    expect(() => resolve({cart: 'stoneware-cup:1,stoneware-cup:2'})).toThrow(/invalid cart/i);
  });

  /** `38 002` is a Canary postcode typed with a space; matched loosely it would price as mainland. */
  it('refuses a malformed postcode where the postcode decides the zone', () => {
    for (const zip of ['38 002', '38-002', '3800', '']) {
      expect(() => resolve({address: {country: 'ES', zip}, optionId: 'standard'})).toThrow(/invalid postcode/i);
    }
  });

  it('does not ask for a postcode format where one zone covers the whole country', () => {
    expect(resolve({address: {country: 'US', zip: 'anything'}, optionId: 'international'}).zone).toBe('row');
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
      baseUrl: 'https://shop.test',
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

describe('paymentRoute', () => {
  const SESSION = '0123456789abcdef0123456789abcdef';
  const ORDER = {
    sessionId: SESSION,
    cart: 'ethiopia-guji:2,stoneware-cup:1',
    address: {country: 'ES', zip: '28014', line1: 'Calle 1', city: 'Madrid'},
    optionId: 'standard'
  };
  const post = (body) =>
    paymentRoute((payment) => Response.json({id: payment.id}))({
      request: new Request('https://shop.test/api/payment', {method: 'POST', body: JSON.stringify(body)})
    });

  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({id: 'pay_1', status: 'PENDING'});
  });

  it('charges the amount it computed, not one the client could supply', async () => {
    const response = await post({...ORDER, amount: 1});

    expect(response.status).toBe(200);
    expect(create.mock.calls[0][0].amount).toBe(cartTotal(CART) + 499);
  });

  it('refuses a wallet total that disagrees with its own, before opening a payment', async () => {
    const response = await post({...ORDER, walletAmount: 100});

    expect(response.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a missing or malformed sessionId, since the components tokenized under it', async () => {
    expect((await post({...ORDER, sessionId: undefined})).status).toBe(400);
    expect((await post({...ORDER, sessionId: '../x'})).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('lets only whitelisted params onto the URLs MONEI redirects the shopper to', async () => {
    await post({...ORDER, search: '?theme=monoline&next=https://evil.test'});
    const {completeUrl, callbackUrl} = create.mock.calls[0][0];

    expect(completeUrl).toContain('theme=monoline');
    expect(completeUrl).not.toContain('evil');
    expect(callbackUrl).toBe('https://shop.test/api/callback');
  });

  /** A receipt link can be shared; the cookie is what tells the paying browser apart. */
  it('marks the paying browser as the owner of the payment it opened', async () => {
    const set = vi.fn();
    await paymentRoute((payment) => Response.json({id: payment.id}))({
      request: new Request('https://shop.test/api/payment', {method: 'POST', body: JSON.stringify(ORDER)}),
      cookies: {set}
    });

    expect(set).toHaveBeenCalledWith('monei-receipt', 'pay_1', expect.objectContaining({httpOnly: true, secure: true}));
  });

  it('sets no owner cookie when the payment could not be opened', async () => {
    const set = vi.fn();
    create.mockRejectedValueOnce(new Error('MONEI down'));
    const response = await paymentRoute(() => Response.json({}))({
      request: new Request('https://shop.test/api/payment', {method: 'POST', body: JSON.stringify(ORDER)}),
      cookies: {set}
    });

    expect(response.status).toBe(502);
    expect(set).not.toHaveBeenCalled();
  });

  it('keeps a separate wallet billing address instead of copying the shipping one', async () => {
    const billing = {name: 'Ana', address: {country: 'ES', zip: '08001', city: 'Barcelona', line1: 'Rambla 1'}};
    await post({...ORDER, billing});
    const sent = create.mock.calls[0][0];

    expect(sent.billingDetails.address).toEqual(billing.address);
    expect(sent.shippingDetails.address).toEqual(ORDER.address);
  });
});
