import {describe, expect, it} from 'vitest';
import {
  initialShippingOptions,
  matchZone,
  rateFor,
  ratesFor,
  shippableRatesFor,
  zipDecidesZone,
  zoneIds
} from './shipping.js';
import {parseConfig, toQuery} from './config.js';
import {countryList} from './countries.js';

describe('matchZone with a redacted address', () => {
  /**
   * Apple Pay and Google Pay hand the shipping callback a redacted address
   * mid-flow: no street, and frequently no postcode. That can only price as
   * mainland; /api/payment reprices from the final address, so a Canary order is
   * refused rather than undercharged.
   */
  it('prices a Spanish address with no postcode as mainland', () => {
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

  it('matches a country exactly rather than by substring', () => {
    expect(matchZone({country: 'ES', zip: '28014'}).id).toBe('peninsula');
    expect(matchZone({country: 'E'}).id).toBe('row');
    expect(matchZone({country: 'ESP'}).id).toBe('row');
  });
});

describe('rates', () => {
  /** The guard the API relies on, kept honest even though no zone is empty today. */
  it('treats a zone with no rates as one the shop cannot serve', () => {
    expect(ratesFor({id: 'nowhere'})).toEqual([]);
    expect(ratesFor(matchZone({country: 'GB', zip: 'W1F 9QT'})).length).toBeGreaterThan(0);
  });

  it('gives every other zone at least one rate', () => {
    for (const address of [{country: 'ES', zip: '38002'}, {country: 'ES'}, {country: 'US'}]) {
      expect(ratesFor(matchZone(address)).length).toBeGreaterThan(0);
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
    expect(initialShippingOptions('ES')).toEqual(shippableRatesFor(matchZone({country: 'ES'})));
  });

  it('seeds a rate for every country the form offers', () => {
    for (const {code} of countryList()) {
      expect(initialShippingOptions(code).length).toBeGreaterThan(0);
    }
  });
});

/** A wallet sheet is choosing where to ship, so "collect in store" does not belong in its list. */
describe('shippableRatesFor', () => {
  it('drops pickup from the zone that offers it', () => {
    const zone = matchZone({country: 'ES', zip: '28014'});
    expect(ratesFor(zone).some((r) => r.type === 'PICKUP')).toBe(true);
    expect(shippableRatesFor(zone).some((r) => r.type === 'PICKUP')).toBe(false);
  });

  it('leaves the shipping options untouched', () => {
    for (const address of [{country: 'ES', zip: '28014'}, {country: 'ES', zip: '38001'}, {country: 'US'}]) {
      const zone = matchZone(address);
      expect(shippableRatesFor(zone)).toEqual(ratesFor(zone).filter((r) => r.type !== 'PICKUP'));
      expect(shippableRatesFor(zone).length).toBeGreaterThan(0);
    }
  });

  it('keeps pickup available to the card form, which is not choosing an address', () => {
    expect(rateFor('peninsula', 'pickup').amount).toBe(0);
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

describe('parseConfig round-trip', () => {
  const at = (query) => parseConfig(new URL(`https://demo.test/${query}`));

  it('survives a query string it produced', () => {
    const original = at('?seed=abc123&theme=monoline&country=NL');
    const reparsed = at(`?${toQuery(original)}`);
    expect(reparsed.theme).toBe('monoline');
    expect(reparsed.country).toBe('NL');
    expect(reparsed.seed).toBe('abc123');
  });
});
