import {describe, expect, it} from 'vitest';
import {cardUiFor, themeFor} from './themes.js';
import {CARD_UIS} from '../lib/config.js';

describe('cardUiFor', () => {
  it("takes the theme's own choice when nothing is set", () => {
    expect(cardUiFor(themeFor('aurora'), null)).toBe('input');
    expect(cardUiFor(themeFor('monoline'), null)).toBe('parts');
  });

  it('lets the setting override either theme, so the two are independent', () => {
    expect(cardUiFor(themeFor('aurora'), 'parts')).toBe('parts');
    expect(cardUiFor(themeFor('monoline'), 'input')).toBe('input');
  });

  it('resolves to a component both the markup and the mount know', () => {
    for (const name of ['aurora', 'monoline']) {
      expect(CARD_UIS).toContain(cardUiFor(themeFor(name), null));
    }
  });
});
