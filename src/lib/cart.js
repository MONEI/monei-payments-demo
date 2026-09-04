import {PRODUCTS, productById} from '../data/products.js';

const MIN_ITEMS = 2;
const MAX_ITEMS = 3;

// Per price band, not uniform: people buy several bags of coffee but one grinder.
const quantityWeights = (price) => {
  if (price >= 4000) return [1];
  if (price >= 1500) return [1, 1, 2];
  return [1, 2, 2, 3];
};

// xmur3 + mulberry32. A seeded PRNG rather than Math.random() so the same seed
// gives the same cart on every machine — a shared link has to show the recipient
// what the sender saw.
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

export const newSeed = () => Math.random().toString(36).slice(2, 12);

/** The cart's starting state. Quantities are editable from there. */
export const seededCart = (seed) => {
  const next = rng(seed);
  const pool = [...PRODUCTS];

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

export const cartLines = (items) =>
  items
    .map(({productId, quantity}) => {
      const product = productById(productId);
      if (!product) return null;
      return {...product, quantity, lineTotal: product.price * quantity};
    })
    .filter(Boolean);

/** Goods only, in cents. Shipping is added from a signed quote. */
export const cartTotal = (items) => cartLines(items).reduce((sum, line) => sum + line.lineTotal, 0);

export const formatPrice = (cents, currency = 'EUR', locale = 'en-IE') =>
  new Intl.NumberFormat(locale, {style: 'currency', currency}).format(cents / 100);

/**
 * Alphanumeric, as the API requires, and random per attempt rather than derived
 * from the seed — MONEI uses orderId as a duplicate-payment guard, so a stable
 * one would let a shared link be paid only once.
 */
export const newOrderId = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
};
