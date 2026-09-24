import {describe, expect, it} from 'vitest';
import {DEFAULTS, METHODS, parseConfig, toQuery} from './config.js';

const at = (query) => parseConfig(new URL(`https://demo.test/${query}`));

describe('parseConfig', () => {
  it('falls back to defaults on a bare URL', () => {
    const c = at('');
    expect(c.theme).toBe(DEFAULTS.theme);
    expect(c.flow).toBe(DEFAULTS.flow);
    expect(c.currency).toBe('EUR');
  });

  it('generates a seed when absent and flags that it did', () => {
    const c = at('');
    expect(c.seed).toMatch(/^[a-z0-9]{1,16}$/);
    expect(c.seedGenerated).toBe(true);
  });

  it('keeps a valid seed and does not flag it', () => {
    const c = at('?seed=abc123');
    expect(c.seed).toBe('abc123');
    expect(c.seedGenerated).toBe(false);
  });

  it('replaces an invalid seed without redirecting or throwing', () => {
    for (const bad of ['../../etc/passwd', 'ABC123', 'toolongtobevalidseed', '', 'a b']) {
      const c = at(`?seed=${encodeURIComponent(bad)}`);
      expect(c.seed).toMatch(/^[a-z0-9]{1,16}$/);
      expect(c.seedGenerated).toBe(true);
    }
  });

  it('ignores unknown values for every enum param', () => {
    const c = at('?theme=nonsense&flow=whatever');
    expect(c.theme).toBe(DEFAULTS.theme);
    expect(c.flow).toBe(DEFAULTS.flow);
  });

  it('accepts known enum values', () => {
    const c = at('?theme=monoline&flow=redirect');
    expect(c.theme).toBe('monoline');
    expect(c.flow).toBe('redirect');
  });

  it('drops unknown payment methods but keeps known ones', () => {
    expect(at('?methods=card,hack,bizum').methods).toEqual(['card', 'bizum']);
    expect(at('?methods=hack').methods).toEqual([]);
  });

  /** Read back as the absent param, an empty one would turn every method on again. */
  it('tells no methods apart from every method', () => {
    expect(at('?seed=abc123').methods).toBeNull();
    expect(at('?seed=abc123&methods=').methods).toEqual([]);

    const none = at('?seed=abc123&methods=');
    expect(toQuery(none)).toContain('methods=');
    expect(parseConfig(`https://x/?${toQuery(none)}`).methods).toEqual([]);

    const all = at('?seed=abc123');
    expect(toQuery(all)).not.toContain('methods');
    expect(parseConfig(`https://x/?${toQuery(all)}`).methods).toBeNull();
  });

  /**
   * Absent means the theme decides, so the setting has to stay absent until it is
   * chosen — writing a default would pin one card component onto both themes.
   */
  it('leaves the card component to the theme until it is set', () => {
    expect(at('?seed=abc123').cardUi).toBeNull();
    expect(toQuery(at('?seed=abc123'))).not.toContain('cardUi');

    const parts = at('?seed=abc123&cardUi=parts');
    expect(parts.cardUi).toBe('parts');
    expect(parseConfig(`https://x/?${toQuery(parts)}`).cardUi).toBe('parts');
  });

  it('ignores an unknown card component rather than rendering nothing', () => {
    expect(at('?cardUi=nonsense').cardUi).toBeNull();
  });

  /**
   * `PaymentRequest` renders one button and picks Apple Pay or Google Pay from the
   * browser, with no prop to constrain it — so the two wallets cannot be selected
   * apart, and the individual ids are not accepted.
   */
  it('exposes the wallets as one selectable method', () => {
    expect(METHODS).toContain('wallet');
    expect(METHODS).not.toContain('applePay');
    expect(METHODS).not.toContain('googlePay');
    expect(at('?methods=applePay').methods).toEqual([]);
    expect(at('?methods=card,wallet').methods).toEqual(['card', 'wallet']);
  });

  it('keeps the rail closed unless panel=1, and never puts it in a shared link', () => {
    expect(at('').panel).toBe(false);
    expect(at('?panel=1').panel).toBe(true);
    expect(at('?panel=0').panel).toBe(false);
    // UI state, not configuration — a sales link should not force it open.
    expect(toQuery(at('?seed=abc123&panel=1'))).toBe('seed=abc123');
  });

  it('tracks the two rails independently, and shares neither', () => {
    expect(at('?code=1').code).toBe(true);
    expect(at('?code=1').panel).toBe(false);
    expect(at('?panel=1').code).toBe(false);
    expect(at('?panel=1&code=1')).toMatchObject({panel: true, code: true});
    expect(toQuery(at('?seed=abc123&code=1'))).toBe('seed=abc123');
  });

  it('reads booleans as off only for explicit falsey spellings', () => {
    expect(at('?panel=0').panel).toBe(false);
    expect(at('?panel=false').panel).toBe(false);
    expect(at('?panel=off').panel).toBe(false);
    expect(at('?panel=1').panel).toBe(true);
    expect(at('?panel=yes').panel).toBe(true);
  });

  it('uses the seeded cart when no cart param is present', () => {
    const c = at('?seed=abc123');
    expect(c.cartEdited).toBe(false);
    expect(c.cart.length).toBeGreaterThan(0);
    // Same seed, same cart — the property a shared link depends on.
    expect(at('?seed=abc123').cart).toEqual(c.cart);
  });

  it('lets an explicit cart override the seeded one', () => {
    const c = at('?seed=abc123&cart=filter-papers:1');
    expect(c.cartEdited).toBe(true);
    expect(c.cart).toEqual([{productId: 'filter-papers', quantity: 1}]);
  });

  it('rejects bad cart entries and falls back to the seed if none survive', () => {
    expect(at('?cart=nope:2').cartEdited).toBe(false);
    expect(at('?cart=filter-papers:0').cartEdited).toBe(false);
    expect(at('?cart=filter-papers:abc').cartEdited).toBe(false);
    expect(at('?cart=filter-papers:1000').cartEdited).toBe(false);
  });

  it('keeps only the first entry for a repeated product', () => {
    const c = at('?cart=filter-papers:2,filter-papers:5');
    expect(c.cart).toEqual([{productId: 'filter-papers', quantity: 2}]);
  });

  it('never throws on hostile input', () => {
    const nasty = [
      '?theme=<script>alert(1)</script>',
      '?cart=' + 'a:1,'.repeat(500),
      '?methods=' + 'x'.repeat(5000),
      '?seed=%00%01%02',
      '?panel=&code=&cart=&seed='
    ];
    for (const q of nasty) expect(() => at(q)).not.toThrow();
  });
});

describe('toQuery', () => {
  it('omits values that are still at their default', () => {
    const q = toQuery(at('?seed=abc123'));
    expect(q).toBe('seed=abc123');
  });

  it('round-trips a non-default config', () => {
    const original = at('?seed=abc123&theme=monoline&flow=redirect&methods=card,bizum');
    const reparsed = at(`?${toQuery(original)}`);
    expect(reparsed.theme).toBe('monoline');
    expect(reparsed.flow).toBe('redirect');
    expect(reparsed.methods).toEqual(['card', 'bizum']);
    expect(reparsed.seed).toBe('abc123');
  });

  it('round-trips an edited cart', () => {
    const original = at('?seed=abc123&cart=filter-papers:3,stoneware-cup:1');
    const reparsed = at(`?${toQuery(original)}`);
    expect(reparsed.cart).toEqual(original.cart);
    expect(reparsed.cartEdited).toBe(true);
  });
});
