import {PRODUCTS} from '../data/products.js';
import {newSeed, seededCart} from './cart.js';
import {normalizeCountry} from './countries.js';

// The demo's whole state lives in the query string, so a link reproduces an exact
// configuration. The URL is hand-editable, so every value is whitelisted and
// anything unrecognised falls back to its default rather than throwing.

// Not configurable: Bizum is EUR-only and the shipping rates are quoted in EUR.
export const CURRENCY = 'EUR';

export const THEMES = ['aurora', 'monoline'];
export const LAYOUTS = ['stacked', 'grid'];
export const FLOWS = ['components', 'redirect'];
export const TABS = ['client', 'server', 'events'];
// One entry for both wallets: `PaymentRequest` renders a single button and picks
// Apple Pay or Google Pay from the browser, with no prop to constrain the choice.
export const METHODS = ['card', 'wallet', 'paypal', 'bizum'];

export const DEFAULTS = {
  theme: 'aurora',
  seed: null, // generated when absent, then written back with replaceState
  layout: 'stacked',
  methods: [], // empty means "every method the account has enabled"
  shipping: true, // requestShipping
  billing: true, // requestBilling — PaymentRequest only, never PayPal
  country: 'ES',
  flow: 'components',
  panel: false, // settings rail open; server-rendered so it cannot flash closed
  code: false, // code rail open, same reason
  tab: 'client' // selected code-rail tab; a cart change is a server render
};

const SEED_RE = /^[a-z0-9]{1,16}$/;
const PRODUCT_IDS = new Set(PRODUCTS.map((p) => p.id));

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

const bool = (value, fallback) => {
  if (value === null) return fallback;
  return !['0', 'false', 'no', 'off', ''].includes(value.toLowerCase());
};

const subset = (value, allowed) => {
  if (!value) return [];
  const picked = value.split(',').map((s) => s.trim());
  return allowed.filter((a) => picked.includes(a));
};

/**
 * `cart=ethiopia-guji:2,stoneware-cup:1` — present only once quantities are
 * edited, so an edited basket survives a reload and can be shared. Null means
 * fall back to the seeded cart; `cart=` with no value is an emptied basket, which
 * is not the same thing.
 */
export const parseCart = (value) => {
  if (value === null || value === undefined) return null;
  if (value === '') return [];
  const items = [];
  for (const entry of value.split(',')) {
    const [id, rawQty] = entry.split(':');
    if (!PRODUCT_IDS.has(id)) continue; // unknown product — drop the line
    const quantity = Number.parseInt(rawQty, 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) continue;
    if (items.some((i) => i.productId === id)) continue; // ignore repeats
    items.push({productId: id, quantity});
  }
  // Nothing survived validation, so the param was garbage rather than an emptied
  // basket: fall back to the seed instead of showing an empty shop.
  return items.length ? items : null;
};

export const serializeCart = (items) => items.map(({productId, quantity}) => `${productId}:${quantity}`).join(',');

/**
 * Never throws: every branch has a fallback. `seedGenerated` tells the page it
 * invented the seed, so it can replaceState the canonical URL — a redirect would
 * risk a loop and would leave `curl /` with an empty body.
 */
export const parseConfig = (url) => {
  const q = url instanceof URL ? url.searchParams : new URL(url).searchParams;

  const rawSeed = q.get('seed');
  const validSeed = rawSeed && SEED_RE.test(rawSeed) ? rawSeed : null;
  const seed = validSeed ?? newSeed();

  const parsedCart = parseCart(q.get('cart'));
  const cart = parsedCart ?? seededCart(seed);

  return {
    theme: oneOf(q.get('theme'), THEMES, DEFAULTS.theme),
    layout: oneOf(q.get('layout'), LAYOUTS, DEFAULTS.layout),
    flow: oneOf(q.get('flow'), FLOWS, DEFAULTS.flow),
    methods: subset(q.get('methods'), METHODS),
    shipping: bool(q.get('shipping'), DEFAULTS.shipping),
    billing: bool(q.get('billing'), DEFAULTS.billing),
    panel: bool(q.get('panel'), DEFAULTS.panel),
    code: bool(q.get('code'), DEFAULTS.code),
    tab: oneOf(q.get('tab'), TABS, DEFAULTS.tab),
    country: normalizeCountry(q.get('country')),
    seed,
    seedGenerated: !validSeed,
    cart,
    cartEdited: parsedCart !== null,
    currency: CURRENCY
  };
};

/** Omits anything still at its default, so shared links stay short. */
export const toQuery = (config) => {
  const q = new URLSearchParams();
  if (config.seed) q.set('seed', config.seed);
  if (config.theme !== DEFAULTS.theme) q.set('theme', config.theme);
  if (config.layout !== DEFAULTS.layout) q.set('layout', config.layout);
  if (config.flow !== DEFAULTS.flow) q.set('flow', config.flow);
  if (config.methods?.length) q.set('methods', config.methods.join(','));
  if (config.shipping !== DEFAULTS.shipping) q.set('shipping', '0');
  if (config.billing !== DEFAULTS.billing) q.set('billing', '0');
  if (config.country && config.country !== DEFAULTS.country) q.set('country', config.country);
  if (config.cartEdited) q.set('cart', serializeCart(config.cart));
  return q.toString();
};
