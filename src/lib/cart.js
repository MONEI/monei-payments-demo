import {PRODUCTS, productById} from '../data/products.js';

const MIN_ITEMS = 2;
const MAX_ITEMS = 3;

// People buy several bags of coffee but one grinder, so quantity is drawn per
// price band rather than uniformly. A flat draw produced baskets like 3 × a €68
// grinder — arithmetically fine, but nobody shops like that, and an implausible
// cart undercuts a demo people judge on looks.
const quantityWeights = (price) => {
  if (price >= 4000) return [1]; // grinder, brewer, 1 kg sack
  if (price >= 1500) return [1, 1, 2]; // 250 g / 500 g bags
  return [1, 2, 2, 3]; // cups, filter papers
};

/**
 * xmur3 + mulberry32. Hand-rolled because the cart has to come out identical
 * for a given seed on every machine and Node version — `Math.random()` cannot
 * be seeded, and anything platform-dependent would make a shared link show the
 * recipient a different order than the sender saw.
 */
const seedToInt = (seed) => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
};

const rng = (seed) => {
  let a = seedToInt(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A URL-safe seed. Matches the `^[a-z0-9]{1,16}$` shape config.js validates. */
export const newSeed = () => Math.random().toString(36).slice(2, 12);

/**
 * The same seed always yields the same products and quantities.
 *
 * Note this is only the cart's STARTING state. Quantities are then editable in
 * the store, which is how a shopper reaches the under-€5 total Bizum needs in
 * test mode.
 */
export const seededCart = (seed) => {
  const next = rng(seed);
  const pool = [...PRODUCTS];

  // Fisher-Yates, drawing from the seeded stream so the order is reproducible.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const count = MIN_ITEMS + Math.floor(next() * (MAX_ITEMS - MIN_ITEMS + 1));

  return pool.slice(0, count).map((product) => {
    const weights = quantityWeights(product.price);
    return {
      productId: product.id,
      quantity: weights[Math.floor(next() * weights.length)]
    };
  });
};

/** Cart lines joined to the catalogue, with per-line totals. */
export const cartLines = (items) =>
  items
    .map(({productId, quantity}) => {
      const product = productById(productId);
      if (!product) return null; // Unknown id (edited URL) — drop the line.
      return {...product, quantity, lineTotal: product.price * quantity};
    })
    .filter(Boolean);

/** Goods total in cents. Shipping is added separately, from a signed quote. */
export const cartTotal = (items) => cartLines(items).reduce((sum, line) => sum + line.lineTotal, 0);

export const formatPrice = (cents, currency = 'EUR', locale = 'en-IE') =>
  new Intl.NumberFormat(locale, {style: 'currency', currency}).format(cents / 100);

/**
 * Order reference for a single payment attempt.
 *
 * Random per attempt, NOT derived from the seed: MONEI treats orderId as a
 * duplicate-payment guard, so a seed-derived one would let a shared link be
 * paid exactly once and reject every attempt after. Alphanumeric only, which
 * the API requires.
 */
export const newOrderId = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
};
