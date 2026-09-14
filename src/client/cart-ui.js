import {emit} from './events.js';
import {setGoods} from './checkout.js';
import {cartLines, cartTotal, formatPrice} from '../lib/cart.js';

/**
 * The cart is client state rendered in place. It stays mirrored into the URL so the
 * address bar always holds a link that reproduces the basket, but writing it with
 * `replaceState` rather than navigating keeps the typed address, the scroll
 * position and the mounted payment components alive across an edit.
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

const serialize = (lines) => lines.map((l) => `${l.productId}:${l.quantity}`).join(',');

/**
 * Every product already has a row in the markup; a cart edit shows or hides one and
 * rewrites its two numbers. Nothing is built here, so the rows keep the server's
 * classes and their inline SVG artwork.
 */
const renderCart = (lines) => {
  const priced = new Map(cartLines(lines).map((line) => [line.id, line]));

  for (const row of document.querySelectorAll('[data-cart-line]')) {
    const line = priced.get(row.dataset.cartLine);
    row.hidden = !line;
    if (!line) continue;
    row.querySelector('[data-cart-qty]').textContent = line.quantity;
    row.querySelector('[data-cart-line-total]').textContent = formatPrice(line.lineTotal);
  }

  const subtotal = document.getElementById('cart-subtotal');
  if (subtotal) subtotal.textContent = formatPrice(cartTotal(lines));
};

/** The shop's buttons read "Add" until the product is in the basket. */
const renderShopButtons = (lines) => {
  const inCart = new Set(lines.map((l) => l.productId));
  for (const button of document.querySelectorAll('[data-cart-add]')) {
    button.textContent = inCart.has(button.dataset.cartAdd) ? 'Add another' : 'Add';
  }
};

const flash = (productId) => {
  document.getElementById('cart-total')?.classList.add('just-changed');
  const row = productId && document.querySelector(`[data-cart-line="${productId}"]`);
  if (row) row.classList.add('just-changed');
};

export const initCartUi = (initialLines) => {
  let lines = readCart() ?? initialLines;

  const apply = (changedId) => {
    const url = new URL(location.href);
    // An empty value, not a deleted param: an absent `cart` means "seed a new basket".
    url.searchParams.set('cart', serialize(lines));
    // `:` and `,` are legal in a query value, and the cart is the part of the link
    // people read, so the encoding searchParams applies is undone.
    history.replaceState(history.state, '', url.toString().replace(/%3A/g, ':').replace(/%2C/g, ','));

    renderCart(lines);
    renderShopButtons(lines);
    setGoods(cartTotal(lines), serialize(lines));
    emit('cart', lines);

    for (const node of document.querySelectorAll('.just-changed')) node.classList.remove('just-changed');
    // The class has to land after the removal paints or the animation never restarts.
    requestAnimationFrame(() => flash(changedId));
  };

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
    apply(stillPresent ? productId : null);
  };

  const root = document.getElementById('cart-root') ?? document.body;
  if (root.dataset.cartWired === 'true') return;
  root.dataset.cartWired = 'true';

  // Delegated: the stepper buttons are replaced on every edit, so per-button
  // listeners would be lost with the markup they were attached to.
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cart-add], [data-cart-step]');
    if (!button) return;
    const id = button.dataset.cartAdd ?? button.dataset.cartStep;
    change(id, button.dataset.cartAdd ? 1 : Number(button.dataset.delta));
  });
};
