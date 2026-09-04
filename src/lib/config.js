import {PRODUCTS} from '../data/products.js';
import {newSeed, seededCart} from './cart.js';

/**
 * The demo's whole state lives in the query string. That is what lets sales send
 * a link that reproduces an exact configuration — same theme, same toggles, same
 * cart — with no cookies and no server-side session.
 *
 * Because the URL is public and hand-editable, every value here is whitelisted:
 * anything unrecognised falls back to its default rather than throwing, so a
 * mangled link still renders a working store.
 */

// EUR everywhere, deliberately not configurable: Bizum is EUR-only, the shipping
// rates are quoted in EUR, and a currency toggle would silently break both.
export const CURRENCY = 'EUR';

export const THEMES = ['aurora', 'monoline'];
export const LAYOUTS = ['stacked', 'grid'];
export const FLOWS = ['components', 'redirect'];
export const METHODS = ['card', 'applePay', 'googlePay', 'paypal', 'bizum'];
export const LANGUAGES = ['en', 'es', 'ca', 'pt', 'de', 'it', 'fr', 'nl'];

export const DEFAULTS = {
  theme: 'aurora',
  seed: null, // generated when absent, then written back with replaceState
  layout: 'stacked',
  methods: [], // empty means "every method the account has enabled"
  shipping: true, // requestShipping
  billing: true, // requestBilling — PaymentRequest only, never PayPal
  country: 'ES',
  lang: 'en', // passed through as each component's `language`
  flow: 'components'
};

const SEED_RE = /^[a-z0-9]{1,16}$/;
const PRODUCT_IDS = new Set(PRODUCTS.map((p) => p.id));

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/** Absent → default. Anything else is read as a boolean, so `?shipping=0` works. */
const bool = (value, fallback) => {
  if (value === null) return fallback;
  return !['0', 'false', 'no', 'off', ''].includes(value.toLowerCase());
};

/** Comma-separated, unknown entries dropped, order and duplicates normalised. */
const subset = (value, allowed) => {
  if (!value) return [];
  const picked = value.split(',').map((s) => s.trim());
  return allowed.filter((a) => picked.includes(a));
};

/**
 * `cart=ethiopia-guji:2,stoneware-cup:1`
 *
 * Present only once a shopper edits quantities — the seeded cart is the starting
 * point, and this overrides it so an edited basket survives a reload and can be
 * shared. That matters for Bizum: its under-€5 test-mode limit is reached by
 * lowering quantities, and without this the resulting state could not be sent to
 * anyone.
 *
 * Returns null when absent or unusable, which means "fall back to the seed".
 */
const parseCart = (value) => {
  if (!value) return null;
  const items = [];
  for (const entry of value.split(',')) {
    const [id, rawQty] = entry.split(':');
    if (!PRODUCT_IDS.has(id)) continue; // unknown product — drop the line
    const quantity = Number.parseInt(rawQty, 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) continue;
    if (items.some((i) => i.productId === id)) continue; // ignore repeats
    items.push({productId: id, quantity});
  }
  return items.length ? items : null;
};

export const serializeCart = (items) => items.map(({productId, quantity}) => `${productId}:${quantity}`).join(',');

/**
 * Reads a validated config out of a URL. Never throws — every branch has a
 * fallback, because this runs on a request whose query string anyone can edit.
 *
 * `seedGenerated` tells the page whether it invented the seed, so it can write
 * the canonical URL back with replaceState (not a redirect: a 302 would risk a
 * loop if a generated seed ever failed its own validation, and would make a
 * plain `curl /` return an empty body).
 */
export const parseConfig = (url) => {
  const q = url instanceof URL ? url.searchParams : new URL(url).searchParams;

  const rawSeed = q.get('seed');
  const validSeed = rawSeed && SEED_RE.test(rawSeed) ? rawSeed : null;
  const seed = validSeed ?? newSeed();

  const cart = parseCart(q.get('cart')) ?? seededCart(seed);

  return {
    theme: oneOf(q.get('theme'), THEMES, DEFAULTS.theme),
    layout: oneOf(q.get('layout'), LAYOUTS, DEFAULTS.layout),
    flow: oneOf(q.get('flow'), FLOWS, DEFAULTS.flow),
    lang: oneOf(q.get('lang'), LANGUAGES, DEFAULTS.lang),
    methods: subset(q.get('methods'), METHODS),
    shipping: bool(q.get('shipping'), DEFAULTS.shipping),
    billing: bool(q.get('billing'), DEFAULTS.billing),
    country: q.get('country'), // validated in task 5 against the country list
    seed,
    seedGenerated: !validSeed,
    cart,
    cartEdited: Boolean(parseCart(q.get('cart'))),
    currency: CURRENCY
  };
};

/**
 * Config → query string, omitting anything still at its default so a shared link
 * stays readable. `cart` is included only once edited; otherwise the seed alone
 * reproduces it.
 */
export const toQuery = (config) => {
  const q = new URLSearchParams();
  if (config.seed) q.set('seed', config.seed);
  if (config.theme !== DEFAULTS.theme) q.set('theme', config.theme);
  if (config.layout !== DEFAULTS.layout) q.set('layout', config.layout);
  if (config.flow !== DEFAULTS.flow) q.set('flow', config.flow);
  if (config.lang !== DEFAULTS.lang) q.set('lang', config.lang);
  if (config.methods?.length) q.set('methods', config.methods.join(','));
  if (config.shipping !== DEFAULTS.shipping) q.set('shipping', '0');
  if (config.billing !== DEFAULTS.billing) q.set('billing', '0');
  if (config.country && config.country !== DEFAULTS.country) q.set('country', config.country);
  if (config.cartEdited) q.set('cart', serializeCart(config.cart));
  return q.toString();
};
