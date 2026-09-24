import {formatPrice} from '../lib/cart.js';
import {methodAllowed as allowed} from '../lib/config.js';

const el = (id) => document.getElementById(id);

/**
 * Client-side navigation replaces the whole document body, so nothing here may be
 * captured once at module scope: every element reference belongs to one page render
 * and is rebuilt by `readPage`.
 */
let config;
let payButton;
let payError;
let expressError;
let shippingBox;
let totalOut;
let shippingOut;

let cardComplete = false;
let busy = false;
let pricing = false;
let preferredOption = null;

export const readPage = () => {
  config = JSON.parse(el('demo-config').textContent);
  payButton = el('pay');
  payError = el('pay-error');
  expressError = el('express-error');
  shippingBox = el('shipping-options');
  totalOut = el('cart-total');
  shippingOut = el('cart-shipping');
  cardComplete = false;
  busy = false;
  pricing = false;
  preferredOption = null;
  return config;
};

const money = (cents) => formatPrice(cents, config.currency);

export const methodAllowed = (id) => allowed(config.methods, id);

// The payment components require a non-zero amount and throw on zero rather than
// rendering a disabled state.
export const hasSomethingToBuy = () => config.goods > 0;

// The hosted page runs its own checkout, so the express components have nothing to
// contribute to it.
export const isRedirectFlow = () => config.flow === 'redirect';

export const setError = (message) => {
  payError.textContent = message ?? '';
  payError.hidden = !message;
};

// The wallet button sits in its own section, and the card form's error line is two
// sections below it — far enough that a message there reads as unrelated.
export const setExpressError = (message) => {
  if (!expressError) return;
  expressError.textContent = message ?? '';
  expressError.hidden = !message;
};

const selectedInput = () => shippingBox?.querySelector('input[name="shipping"]:checked');

export const selectedOption = () => selectedInput()?.value ?? null;

export const currentTotal = () => {
  const selected = selectedInput();
  const rate = selected ? Number(selected.dataset.amount) : 0;
  return config.goods + rate;
};

// Many events refresh the button while a payment is in flight, so `busy` is held
// here and only `setBusy` changes it.
const refreshPayButton = () => {
  if (!payButton) return;
  payButton.disabled = busy || pricing || !cardComplete || !selectedOption();
  const idle = isRedirectFlow() ? `Continue to payment · ${money(currentTotal())}` : `Pay ${money(currentTotal())}`;
  payButton.textContent = busy ? 'Processing…' : idle;
};

export const setBusy = (value) => {
  busy = value;
  refreshPayButton();
};

export const setCardComplete = (complete) => {
  cardComplete = complete;
  refreshPayButton();
};

/** Shows the browser's own message on the first invalid address field. */
export const validateForm = () => {
  for (const input of document.querySelectorAll('#address [name]')) {
    if (!input.checkValidity()) {
      input.reportValidity();
      return false;
    }
  }
  return true;
};

/**
 * Every express button pays the amount the shown rates priced, so none of them may
 * be reachable while those rates are being replaced.
 */
export const setPricing = (busy) => {
  pricing = busy;
  el('shipping-spinner')?.classList.toggle('is-pending', busy);

  for (const container of ['payment-request', 'paypal', 'bizum']) {
    const node = el(container);
    if (node) node.classList.toggle('is-busy', busy);
  }
  for (const control of document.querySelectorAll('[data-cart-add], [data-cart-step]')) control.disabled = busy;
  refreshPayButton();
};

/**
 * Where the postcode picks the zone, rates wait for a complete one; the input's
 * `pattern` comes from the same country table the server checks against.
 */
export const postcodeComplete = () => document.querySelector('#address [name="zip"]')?.checkValidity() ?? false;

/** What the shopper typed and picked: everything the server needs to price the order. */
export const order = () => {
  const value = (name) => document.querySelector(`[name="${name}"]`)?.value?.trim() ?? '';
  return {
    optionId: selectedOption(),
    // Left out when blank: MONEI rejects an empty email rather than ignoring it.
    customer: {name: value('name') || undefined, email: value('email') || undefined},
    address: {country: value('country'), zip: value('zip'), city: value('city'), line1: value('line1')}
  };
};

// The test environment supports Bizum only below €5, so the button is out of reach
// from there rather than failing at the payment processor.
const BIZUM_MAX = 500;

/**
 * Bizum and PayPal pay the amount the page priced, so neither is reachable until a
 * rate is selected, and the test environment supports Bizum only below €5. They live in
 * cross-origin frames and cannot be disabled from here, so the mount box is taken out
 * of reach instead.
 */
export const syncRateGate = () => {
  el('paypal')?.classList.toggle('is-locked', !selectedOption());
  el('bizum')?.classList.toggle('is-locked', !selectedOption() || currentTotal() >= BIZUM_MAX);
};

export const renderTotals = () => {
  const selected = selectedInput();
  if (shippingOut) shippingOut.textContent = selected ? money(Number(selected.dataset.amount)) : '—';
  if (totalOut) totalOut.textContent = money(currentTotal());
  refreshPayButton();
  syncRateGate();
};

export const showRatesNote = (message, {error = false} = {}) => {
  shippingBox.innerHTML = `<p class="text-xs ${error ? 'text-rose-600' : config.mutedClass}">${message}</p>`;
};

export const renderRates = (options, onChange) => {
  // Whatever is selected survives the re-render if the new rates still offer it, so an
  // address edit does not silently move the shopper onto a different one. A preset's
  // request outranks that, and has to outlive the several lookups its own click starts.
  if (preferredOption && !options.some((o) => o.id === preferredOption)) preferredOption = null;
  const chosen = preferredOption ?? selectedOption();
  const preferred = options.find((o) => o.id === chosen) ?? options[0];
  shippingBox.innerHTML = options
    .map(
      (option) => `
        <label class="flex items-center gap-2 text-sm">
          <input type="radio" name="shipping" value="${option.id}"
                 data-amount="${option.amount}" ${option.id === preferred.id ? 'checked' : ''} />
          <span class="flex-1">${option.label}</span>
          <span class="tabular-nums">${money(option.amount)}</span>
        </label>`
    )
    .join('');

  for (const input of shippingBox.querySelectorAll('input')) {
    input.addEventListener('change', () => {
      // A choice of their own outranks the preset's.
      preferredOption = null;
      onChange();
    });
  }
};

/**
 * Everything in this panel is charged for the rate the picker selects, so the
 * picker belongs to the panel rather than to the card. Only the wallets price
 * shipping elsewhere — inside their own sheet — which is why an empty panel is
 * possible at all.
 */
export const syncCheckoutPanel = () => {
  const visible = (id) => Boolean(el(id) && !el(id).hidden);

  const bizum = visible('bizum-row');
  const payPal = visible('paypal-row');
  const payButtonRow = visible('card-fields') || isRedirectFlow();

  // In panel order, each method paired with the divider that precedes it. A divider
  // belongs between two shown methods, so it follows the count rather than its
  // neighbours: any method can be switched off, and asking only "is something on the
  // other side" leaves two rules stacked where one method was removed from between.
  const blocks = [
    {shown: bizum, divider: null},
    {shown: payButtonRow, divider: 'card-divider'},
    {shown: payPal, divider: 'paypal-divider'}
  ];

  let seen = 0;
  for (const block of blocks) {
    const node = block.divider && el(block.divider);
    if (node) node.hidden = !(block.shown && seen > 0);
    if (block.shown) seen++;
  }

  // Bizum and PayPal are charged for this same rate, so the picker outlives the
  // card form and goes only when nothing here is left to price.
  const shipping = el('shipping-section');
  if (shipping) shipping.hidden = seen === 0;

  const panel = el('checkout-panel');
  if (panel) panel.hidden = seen === 0;
};

export const showExpress = (shown) => {
  const section = el('express');
  if (section) section.hidden = !shown;
};

// A cart edit remounts without a fresh render, so a hide from last time stands.
export const showCard = (shown) => {
  const fields = el('card-fields');
  if (fields) fields.hidden = !shown;
  if (payButton) payButton.hidden = !shown;
};

const setMethodSupported = (id, isSupported) => {
  const input = document.querySelector(`[data-method="${id}"]`);
  if (!input) return;

  input.disabled = !isSupported;
  if (!isSupported) input.checked = false;
  input.classList.toggle('cursor-pointer', isSupported);
  const label = input.closest('label');
  label?.classList.toggle('cursor-pointer', isSupported);
  label?.classList.toggle('opacity-50', !isSupported);
  document.querySelector(`[data-reason="${id}"]`)?.classList.toggle('hidden', isSupported);
};

const METHOD_ROWS = {
  wallet: ['payment-request'],
  bizum: ['bizum-row', 'bizum-preset'],
  paypal: ['paypal-row']
};

/** A method that is not mounted — an empty cart, a switched-off method — leaves no empty row behind. */
export const showMethodRows = (id, shown) => {
  for (const row of METHOD_ROWS[id]) {
    const node = el(row);
    if (node) node.hidden = !shown;
  }
};

/** Shows or hides everything on the page that belongs to one method, once its `onLoad` has answered. */
export const methodLoaded = (id, isSupported) => {
  setMethodSupported(id, isSupported);
  showMethodRows(id, isSupported);

  const reason = el('express-reason');
  if (id === 'wallet' && !isSupported && reason) {
    reason.textContent =
      'No wallet is available in this browser. Apple Pay needs Safari on Apple hardware; Google Pay needs a signed-in Chrome profile with a saved card.';
    reason.hidden = false;
  }

  syncCheckoutPanel();
};

// The demo's Bizum preset needs a specific rate, and the address it fills triggers
// more than one lookup, so the choice is held rather than applied to one render.
document.addEventListener('monei:prefer-option', (event) => {
  preferredOption = event.detail;
});
