import {describe, expect, it} from 'vitest';
import {countryList, isValidPostcode, normalizeCountry, DEFAULT_COUNTRY} from './countries.js';

describe('countryList', () => {
  it('defaults to Spain, not the US', () => {
    expect(DEFAULT_COUNTRY).toBe('ES');
    expect(countryList()[0].code).toBe('ES');
  });

  it('derives a text keyboard for alphanumeric postcodes', () => {
    const by = Object.fromEntries(countryList().map((c) => [c.code, c.inputmode]));
    expect(by.NL).toBe('text');
    expect(by.GB).toBe('text');
    expect(by.ES).toBe('numeric');
    expect(by.PT).toBe('numeric');
  });

  it('marks exactly one country unserviceable so the error path stays reachable', () => {
    expect(countryList().filter((c) => c.unserviceable)).toHaveLength(1);
  });
});

describe('sample addresses', () => {
  it('pass their own country validation, so the fill button cannot produce an error', () => {
    for (const country of countryList()) {
      for (const sample of country.samples) {
        expect(isValidPostcode(country.code, sample.zip)).toBe(true);
        expect(new RegExp(`^(?:${country.pattern})$`).test(sample.zip)).toBe(true);
      }
    }
  });

  it('include a Canary postcode, which is the only ES sample in its own zone', () => {
    const es = countryList().find((c) => c.code === 'ES');
    expect(es.samples.filter((s) => /^(35|38)/.test(s.zip))).toHaveLength(1);
  });

  it('give every country at least two options', () => {
    for (const country of countryList()) {
      expect(country.samples.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('browser pattern', () => {
  const SAMPLES = {
    ES: ['28001', '2800', 'banana'],
    PT: ['1000-001', '1000', '12'],
    FR: ['75001', '7500'],
    DE: ['10115', '1011'],
    IT: ['00100', '001'],
    BE: ['1000', '100'],
    NL: ['1011 AB', '1011ab', '1011', '1011 A'],
    GB: ['SW1A 1AA', 'M1 1AE', '12345']
  };

  it('agrees with server validation, so the two cannot drift apart', () => {
    for (const country of countryList()) {
      const browser = new RegExp(`^(?:${country.pattern})$`);
      for (const sample of SAMPLES[country.code]) {
        expect(browser.test(sample)).toBe(isValidPostcode(country.code, sample));
      }
    }
  });

  it('is case-insensitive, which the pattern attribute cannot express with a flag', () => {
    const nl = countryList().find((c) => c.code === 'NL');
    expect(new RegExp(`^(?:${nl.pattern})$`).test('1011ab')).toBe(true);
    expect(new RegExp(`^(?:${nl.pattern})$`).test('1011AB')).toBe(true);
  });
});

describe('isValidPostcode', () => {
  it('accepts real formats', () => {
    expect(isValidPostcode('ES', '28001')).toBe(true);
    expect(isValidPostcode('ES', '38001')).toBe(true);
    expect(isValidPostcode('PT', '1000-001')).toBe(true);
    expect(isValidPostcode('PT', '1000')).toBe(true);
    expect(isValidPostcode('BE', '1000')).toBe(true);
    expect(isValidPostcode('NL', '1011 AB')).toBe(true);
    expect(isValidPostcode('NL', '1011ab')).toBe(true);
    expect(isValidPostcode('GB', 'SW1A 1AA')).toBe(true);
    expect(isValidPostcode('GB', 'M1 1AE')).toBe(true);
  });

  it('rejects the wrong shape', () => {
    expect(isValidPostcode('ES', '2800')).toBe(false);
    expect(isValidPostcode('ES', '280011')).toBe(false);
    expect(isValidPostcode('ES', 'banana')).toBe(false);
    expect(isValidPostcode('NL', '1011')).toBe(false);
    expect(isValidPostcode('GB', '12345')).toBe(false);
  });

  it('rejects empty input for every country', () => {
    for (const {code} of countryList()) {
      expect(isValidPostcode(code, '')).toBe(false);
      expect(isValidPostcode(code, '   ')).toBe(false);
      expect(isValidPostcode(code, null)).toBe(false);
      expect(isValidPostcode(code, undefined)).toBe(false);
    }
  });

  it('accepts anything non-empty for an unlisted country', () => {
    expect(isValidPostcode('JP', '100-0001')).toBe(true);
    expect(isValidPostcode('US', '90210')).toBe(true);
    expect(isValidPostcode('US', '')).toBe(false);
  });
});

describe('normalizeCountry', () => {
  it('falls back to the default for anything unknown', () => {
    expect(normalizeCountry('ES')).toBe('ES');
    expect(normalizeCountry('es')).toBe('ES');
    expect(normalizeCountry('ZZ')).toBe('ES');
    expect(normalizeCountry(null)).toBe('ES');
    expect(normalizeCountry('<script>')).toBe('ES');
  });
});
