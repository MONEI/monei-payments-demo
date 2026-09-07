import {describe, expect, it, vi} from 'vitest';
import {
  initialShippingOptions,
  isServiceable,
  matchZone,
  rateFor,
  ratesFor,
  zipDecidesZone,
  zoneIds
} from './shipping.js';
import {signQuote, verifyQuote} from './quote.js';
import {parseConfig, toQuery} from './config.js';
import {countryList} from './countries.js';
import {cartTotal, seededCart} from './cart.js';
import {PRODUCTS} from '../data/products.js';
import {resolveAmount} from './payment.js';

describe('matchZone with a redacted address', () => {
  /**
   * Apple Pay and Google Pay hand the shipping callback a redacted address
   * mid-flow: no street, and frequently no postcode. `/^(35|38)/.test(undefined)`
   * coerces to the string "undefined" and returns false, so without an explicit
   * guard a Canary address would quietly price as mainland — the sheet completes,
   * the total looks plausible, and the demo undercharges by €10.
   */
  it('does not price a missing postcode as mainland by accident', () => {
    expect(matchZone({country: 'ES', zip: undefined}).id).toBe('peninsula');
    expect(matchZone({country: 'ES'}).id).toBe('peninsula');
    expect(matchZone({country: 'ES', zip: null}).id).toBe('peninsula');
    expect(matchZone({country: 'ES', zip: ''}).id).toBe('peninsula');
  });

  it('still finds the Canary zone once a postcode arrives', () => {
    expect(matchZone({country: 'ES', zip: '38002'}).id).toBe('canary');
    expect(matchZone({country: 'ES', zip: '35001'}).id).toBe('canary');
  });

  it('ignores a partial postcode rather than half-matching it', () => {
    expect(matchZone({country: 'ES', zip: '38'}).id).toBe('peninsula');
    expect(matchZone({country: 'ES', zip: '380'}).id).toBe('peninsula');
  });
});

describe('matchZone ordering', () => {
  it('prefers the Canary arm over the broader Spanish one', () => {
    expect(matchZone({country: 'ES', zip: '38002'}).id).toBe('canary');
    expect(matchZone({country: 'ES', zip: '28014'}).id).toBe('peninsula');
  });

  it('always returns a zone, so a lookup can never stall a wallet sheet', () => {
    const inputs = [
      {},
      undefined,
      {country: 'US', zip: '90210'},
      {country: 'JP'},
      {country: '', zip: ''},
      {country: 'zz', zip: '!!!'}
    ];
    for (const input of inputs) {
      expect(zoneIds()).toContain(matchZone(input).id);
    }
  });

  it('falls through to the international zone for anything unmatched', () => {
    expect(matchZone({country: 'US', zip: '90210'}).id).toBe('row');
    expect(matchZone({}).id).toBe('row');
  });
});

describe('matchZone input handling', () => {
  it('rejects garbage instead of letting it match a real zone', () => {
    expect(matchZone({country: 'ES', zip: 'banana'}).id).toBe('peninsula');
    expect(matchZone({country: 'ES', zip: '38abc'}).id).toBe('peninsula');
    expect(matchZone({country: 'ES', zip: '3800a'}).id).toBe('peninsula');
  });

  it('caps postcode length so a huge string cannot be matched against', () => {
    expect(matchZone({country: 'ES', zip: '38'.repeat(500)}).id).toBe('peninsula');
  });

  it('normalises case and surrounding whitespace', () => {
    expect(matchZone({country: 'es', zip: ' 38002 '}).id).toBe('canary');
    expect(matchZone({country: ' ES ', zip: '28014'}).id).toBe('peninsula');
  });

  it('matches a country list without falling back to substring matching', () => {
    expect(matchZone({country: 'GB'}).id).toBe('unserviceable');
    expect(matchZone({country: 'G'}).id).toBe('row');
    expect(matchZone({country: 'GBR'}).id).toBe('row');
  });
});

describe('rates', () => {
  it('marks the unserviceable zone by having no rates at all', () => {
    const zone = matchZone({country: 'GB', zip: 'W1F 9QT'});
    expect(zone.id).toBe('unserviceable');
    expect(ratesFor(zone)).toEqual([]);
    expect(isServiceable(zone)).toBe(false);
  });

  it('gives every other zone at least one rate', () => {
    for (const address of [{country: 'ES', zip: '38002'}, {country: 'ES'}, {country: 'US'}]) {
      expect(isServiceable(matchZone(address))).toBe(true);
    }
  });

  it('prices Canary shipping above mainland, which is the point of the zone', () => {
    const canary = ratesFor(matchZone({country: 'ES', zip: '38002'}))[0].amount;
    const mainland = ratesFor(matchZone({country: 'ES', zip: '28014'}))[0].amount;
    expect(canary).toBeGreaterThan(mainland);
  });

  it('throws on an unknown option rather than handing out free shipping', () => {
    expect(() => rateFor('peninsula', 'nope')).toThrow();
    expect(() => rateFor('peninsula', '')).toThrow();
    expect(() => rateFor('peninsula', undefined)).toThrow();
    expect(() => rateFor('unserviceable', 'standard')).toThrow();
    expect(rateFor('peninsula', 'standard').amount).toBe(499);
  });

  it('allows a legitimately free option only when the table says so', () => {
    expect(rateFor('peninsula', 'pickup').amount).toBe(0);
  });
});

/**
 * Both wallets read the option list once, when the sheet is constructed. An empty
 * list opens a sheet with no shipping row, and the first address change cannot add
 * one — so the seed must be non-empty for every country the rail can select,
 * including the ones we refuse to ship to.
 */
describe('initialShippingOptions', () => {
  it('never seeds a wallet sheet with an empty list', () => {
    for (const country of [...countryList().map((c) => c.code), '', undefined, 'ZZ']) {
      expect(initialShippingOptions(country).length).toBeGreaterThan(0);
    }
  });

  it('seeds the real rates when the country is one we serve', () => {
    expect(initialShippingOptions('ES')).toEqual(ratesFor(matchZone({country: 'ES'})));
  });

  it('falls back rather than seeding the unserviceable zone', () => {
    expect(isServiceable(matchZone({country: 'GB'}))).toBe(false);
    expect(initialShippingOptions('GB').length).toBeGreaterThan(0);
  });
});

/**
 * The country select defaults to ES, so before the shopper types anything the page
 * had enough to quote and showed €4.99 — the mainland rate for an address nobody
 * had given, and €10 under the Canary rate it might turn out to be.
 */
describe('zipDecidesZone', () => {
  it('flags the countries a postcode can re-zone', () => {
    expect(zipDecidesZone('ES')).toBe(true);
    expect(zipDecidesZone('es')).toBe(true);
    expect(zipDecidesZone(' ES ')).toBe(true);
  });

  it('leaves countries with a single zone quotable from the country alone', () => {
    for (const country of ['PT', 'US', 'FR', 'GB']) expect(zipDecidesZone(country)).toBe(false);
  });

  it('tolerates a missing country', () => {
    for (const value of ['', null, undefined]) expect(zipDecidesZone(value)).toBe(false);
  });

  it('agrees with the zone table it is derived from', () => {
    const canary = matchZone({country: 'ES', zip: '38001'});
    const mainland = matchZone({country: 'ES', zip: '28014'});
    expect(canary.id).not.toBe(mainland.id);
    expect(zipDecidesZone('ES')).toBe(true);
  });
});

/**
 * Quantities became editable after the quote format was designed, and for a while
 * the signature covered only the seed — so the page priced the edited basket while
 * the server priced the seeded one and silently charged that instead. A €55 gap on
 * the demo cart, in the server's favour, with nothing to show it happened.
 */
describe('resolveAmount prices the basket that was quoted', () => {
  const quoteFor = (cart) => signQuote({seed: 'abc123', cart, zone: 'peninsula', rates: ratesFor({id: 'peninsula'})});

  it('uses the signed cart, not a cart re-derived from the seed', () => {
    const edited = [{productId: PRODUCTS[0].id, quantity: 7}];
    const {quote, sig} = quoteFor(edited);
    const resolved = resolveAmount({quote, sig, optionId: 'standard'});

    expect(resolved.goods).toBe(PRODUCTS[0].price * 7);
    expect(resolved.goods).not.toBe(cartTotal(seededCart('abc123')));
    expect(resolved.amount).toBe(resolved.goods + 499);
  });

  it('still prices the seeded cart when the quote carries none', () => {
    const {quote, sig} = quoteFor(undefined);
    expect(resolveAmount({quote, sig, optionId: 'standard'}).goods).toBe(cartTotal(seededCart('abc123')));
  });

  it('cannot be replayed against a bigger basket, because the cart is signed', () => {
    const {quote, sig} = quoteFor([{productId: PRODUCTS[0].id, quantity: 1}]);
    const tampered = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(quote, 'base64url').toString('utf8')),
        cart: [{productId: PRODUCTS[0].id, quantity: 99}]
      })
    ).toString('base64url');

    expect(() => resolveAmount({quote: tampered, sig, optionId: 'standard'})).toThrow(/Invalid shipping quote/);
  });
});

describe('signed quotes', () => {
  const base = {seed: 'abc123', zone: 'canary', rates: ratesFor({id: 'canary'})};

  it('round-trips a quote it signed', () => {
    const {quote, sig} = signQuote(base);
    const verified = verifyQuote(quote, sig);
    expect(verified.seed).toBe('abc123');
    expect(verified.zone).toBe('canary');
    expect(verified.rates).toEqual(base.rates);
  });

  it('rejects a tampered payload', () => {
    const {quote, sig} = signQuote(base);
    const forged = Buffer.from(JSON.stringify({...base, zone: 'peninsula', exp: 9999999999})).toString('base64url');
    expect(() => verifyQuote(forged, sig)).toThrow(/Invalid/);
    expect(() => verifyQuote(quote, 'not-the-signature')).toThrow(/Invalid/);
  });

  it('rejects a missing quote or signature', () => {
    expect(() => verifyQuote(undefined, undefined)).toThrow(/Missing/);
    expect(() => verifyQuote('something', undefined)).toThrow(/Missing/);
  });

  it('rejects an expired quote even when the signature is genuine', () => {
    const {quote, sig} = signQuote(base);
    const payload = JSON.parse(Buffer.from(quote, 'base64url').toString('utf8'));
    vi.setSystemTime((payload.exp + 1) * 1000);
    expect(() => verifyQuote(quote, sig)).toThrow(/expired/);
    vi.useRealTimers();
  });

  it('binds the seed, so a quote cannot be replayed against another cart', () => {
    const {quote, sig} = signQuote(base);
    expect(verifyQuote(quote, sig).seed).toBe('abc123');
  });
});

describe('parseConfig round-trip', () => {
  const at = (query) => parseConfig(new URL(`https://demo.test/${query}`));

  it('survives a query string it produced', () => {
    const original = at('?seed=abc123&theme=monoline&layout=grid&shipping=0&country=NL');
    const reparsed = at(`?${toQuery(original)}`);
    expect(reparsed.theme).toBe('monoline');
    expect(reparsed.layout).toBe('grid');
    expect(reparsed.shipping).toBe(false);
    expect(reparsed.country).toBe('NL');
    expect(reparsed.seed).toBe('abc123');
  });
});
