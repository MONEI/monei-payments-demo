import {describe, expect, it, vi} from 'vitest';
import {isServiceable, matchZone, rateFor, ratesFor, zoneIds} from './shipping.js';
import {signQuote, verifyQuote} from './quote.js';
import {parseConfig, toQuery} from './config.js';

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
