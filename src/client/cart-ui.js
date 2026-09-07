import {navigate} from 'astro:transitions/client';
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

const CHANGED = 'monei-demo-cart-changed';

const writeCart = (lines, changedId) => {
  const url = new URL(location.href);
  if (lines.length) {
    url.searchParams.set('cart', lines.map((l) => `${l.productId}:${l.quantity}`).join(','));
  } else {
    url.searchParams.delete('cart');
  }
  emit('cart', lines);
  // The server render cannot know which line the shopper touched, so it is handed
  // across the navigation. Empty when the line is gone: only the total can react.
  sessionStorage.setItem(CHANGED, changedId ?? '');
  // Totals, shipping zone and the pay amount are all rendered server-side, so the
  // page is re-fetched. `history: 'replace'` keeps stepping a quantity from
  // filling the back stack.
  navigate(url.toString(), {history: 'replace'});
};

/** Marks whatever changed so CSS can animate it, then forgets it. */
const flashChange = () => {
  const changed = sessionStorage.getItem(CHANGED);
  if (changed === null) return;
  sessionStorage.removeItem(CHANGED);

  document.getElementById('cart-total')?.classList.add('just-changed');
  if (changed) {
    document.querySelector(`[data-cart-line="${changed}"]`)?.classList.add('just-changed');
  }
};

export const initCartUi = (initialLines) => {
  let lines = readCart() ?? initialLines;
  let pending = false;
  flashChange();

  const change = (productId, delta) => {
    const existing = lines.find((l) => l.productId === productId);
    let stillPresent = true;
    if (existing) {
      const quantity = existing.quantity + delta;
      stillPresent = quantity > 0;
      lines = stillPresent
        ? lines.map((l) => (l.productId === productId ? {...l, quantity} : l))
        : lines.filter((l) => l.productId !== productId);
    } else if (delta > 0) {
      lines = [...lines, {productId, quantity: 1}];
    }
    writeCart(lines, stillPresent ? productId : null);
  };

  const buttons = [...document.querySelectorAll('[data-cart-add], [data-cart-step]')];

  for (const button of buttons) {
    if (button.dataset.wired === 'true') continue;
    button.dataset.wired = 'true';
    const id = button.dataset.cartAdd ?? button.dataset.cartStep;
    const delta = button.dataset.cartAdd ? 1 : Number(button.dataset.delta);

    button.addEventListener('click', () => {
      // A second click would compute its next state from a `lines` the server has
      // not caught up with yet, silently dropping the first change.
      if (pending) return;
      pending = true;
      for (const other of buttons) other.disabled = true;

      // The cart row for a stepper, the button's wrapper for a product card —
      // whichever also contains the spinner.
      const scope = button.closest('[data-cart-line]') ?? button.parentElement;
      scope?.classList.add('is-pending');
      change(id, delta);
    });
  }
};
