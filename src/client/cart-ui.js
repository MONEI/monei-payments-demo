import {emit} from './events.js';

/**
 * Cart edits stay in the URL rather than a store, so the address bar always holds
 * a link that reproduces the basket. `replaceState` keeps it out of history —
 * stepping a quantity four times should not need four Back presses.
 */
const readCart = () => {
  const raw = new URLSearchParams(location.search).get('cart');
  if (!raw) return null;
  return raw
    .split(',')
    .map((entry) => {
      const [productId, quantity] = entry.split(':');
      return {productId, quantity: Number.parseInt(quantity, 10)};
    })
    .filter((line) => line.productId && line.quantity > 0);
};

const writeCart = (lines) => {
  const url = new URL(location.href);
  if (lines.length) {
    url.searchParams.set('cart', lines.map((l) => `${l.productId}:${l.quantity}`).join(','));
  } else {
    url.searchParams.delete('cart');
  }
  emit('cart', lines);
  // Totals, shipping zone and the pay amount are all rendered server-side, so the
  // page is re-fetched. `replace` keeps stepping a quantity out of history.
  location.replace(url);
};

export const initCartUi = (initialLines) => {
  let lines = readCart() ?? initialLines;

  const change = (productId, delta) => {
    const existing = lines.find((l) => l.productId === productId);
    if (existing) {
      const quantity = existing.quantity + delta;
      lines =
        quantity > 0
          ? lines.map((l) => (l.productId === productId ? {...l, quantity} : l))
          : lines.filter((l) => l.productId !== productId);
    } else if (delta > 0) {
      lines = [...lines, {productId, quantity: 1}];
    }
    writeCart(lines);
  };

  for (const button of document.querySelectorAll('[data-cart-add]')) {
    button.addEventListener('click', () => change(button.dataset.cartAdd, 1));
  }
  for (const button of document.querySelectorAll('[data-cart-step]')) {
    button.addEventListener('click', () => change(button.dataset.cartStep, Number(button.dataset.delta)));
  }
};
