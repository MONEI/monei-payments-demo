import {emit} from './events.js';

const el = (id) => document.getElementById(id);

/**
 * Client-side navigation replaces the whole document body, so nothing here may be
 * captured once at module scope: every element reference and the card component
 * itself belong to one page render and are rebuilt on the next.
 */
let config;
let payButton;
let payError;
let expressError;
let shippingBox;
let totalOut;
let shippingOut;

let quote = null;
let card = null;
let complete = false;
let paymentRequest = null;
let payPal = null;
let bizum = null;
let walletQuote = null;
let walletOpen = false;
let walletUnserviceable = false;
let pricing = false;
let preferredOption = null;

const readPage = () => {
  config = JSON.parse(el('demo-config').textContent);
  payButton = el('pay');
  payError = el('pay-error');
  expressError = el('express-error');
  shippingBox = el('shipping-options');
  totalOut = el('cart-total');
  shippingOut = el('cart-shipping');
  quote = null;
  complete = false;
  walletQuote = null;
  walletOpen = false;
  walletUnserviceable = false;
  pricing = false;
};

const money = (cents) =>
  new Intl.NumberFormat('en-IE', {style: 'currency', currency: config.currency}).format(cents / 100);

const setError = (message) => {
  payError.textContent = message ?? '';
  payError.hidden = !message;
};

// The wallet button sits in its own section, and the card form's error line is two
// sections below it — far enough that a message there reads as unrelated.
const setExpressError = (message) => {
  if (!expressError) return;
  expressError.textContent = message ?? '';
  expressError.hidden = !message;
};

const setBusy = (busy) => {
  payButton.disabled = busy || pricing || walletOpen || !complete || !quote;
  const idle = isRedirectFlow() ? `Continue to payment · ${money(currentTotal())}` : `Pay ${money(currentTotal())}`;
  payButton.textContent = busy ? 'Processing…' : idle;
};

/**
 * Every express button pays the amount the last quote priced, so none of them may
 * be reachable while that quote is being replaced.
 */
const setPricing = (busy) => {
  pricing = busy;
  el('shipping-spinner')?.classList.toggle('is-pending', busy);

  for (const container of ['payment-request', 'paypal', 'bizum']) {
    const node = el(container);
    if (node) node.classList.toggle('is-busy', busy);
  }
  for (const control of document.querySelectorAll('[data-cart-add], [data-cart-step]')) {
    control.disabled = busy || walletOpen;
  }
  if (payButton) setBusy(false);
};

const currentTotal = () => {
  const selected = shippingBox?.querySelector('input[name="shipping"]:checked');
  const rate = selected ? Number(selected.dataset.amount) : 0;
  return config.goods + rate;
};

const addressFromForm = () => {
  const value = (name) => document.querySelector(`[name="${name}"]`)?.value?.trim() ?? '';
  return {
    country: value('country'),
    zip: value('zip'),
    city: value('city'),
    line1: value('line1')
  };
};

const updateAmount = (component) => {
  // Rejects asynchronously once the component's frame is gone, so the promise has
  // to be caught rather than the call wrapped.
  Promise.resolve(component?.updateProps({amount: currentTotal()})).catch(() => {});
};

// Bizum's test mode approves nothing from €5 up, so the button is out of reach above
// that rather than failing at the provider.
const BIZUM_MAX = 500;

// The sandbox accepts this one number, and the modal opens with it already filled in.
const BIZUM_TEST_PHONE = '+34500000000';

/**
 * Everything in this panel is charged against the quote the rate picker issues, so
 * the picker belongs to the panel rather than to the card. Only the wallets price
 * shipping elsewhere — inside their own sheet — which is why an empty panel is
 * possible at all.
 */
const syncCheckoutPanel = () => {
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

  // Bizum and PayPal are charged against this same quote, so the picker outlives the
  // card form and goes only when nothing here is left to price.
  const shipping = el('shipping-section');
  if (shipping) shipping.hidden = seen === 0;

  const panel = el('checkout-panel');
  if (panel) panel.hidden = seen === 0;
};

const renderTotals = () => {
  const selected = shippingBox?.querySelector('input[name="shipping"]:checked');
  if (shippingOut) shippingOut.textContent = selected ? money(Number(selected.dataset.amount)) : '—';
  if (totalOut) totalOut.textContent = money(currentTotal());

  // A navigation can destroy these between the listener firing and this running.
  updateAmount(card);
  updateAmount(bizum);
  updateAmount(payPal);
  setBusy(false);
  syncQuoteGate();
};

/**
 * Bizum and PayPal pay the amount the page priced, so neither is reachable until a
 * quote exists, and Bizum's test mode refuses anything from €5 up. They live in
 * cross-origin frames and cannot be disabled from here, so the mount box is taken out
 * of reach instead.
 */
const syncQuoteGate = () => {
  el('paypal')?.classList.toggle('is-locked', !quote);
  el('bizum')?.classList.toggle('is-locked', !quote || currentTotal() >= BIZUM_MAX);
};

const loadRates = async () => {
  const address = addressFromForm();

  // A country alone is not enough to price Spain, where the postcode decides
  // between mainland and the Canaries. Quoting the cheaper zone on a guess shows a
  // total that moves once the shopper finishes typing.
  if (!address.country || (config.zipZones.includes(address.country) && !/^\d{5}$/.test(address.zip))) {
    quote = null;
    shippingBox.innerHTML = `<p class="text-xs ${config.mutedClass}">Enter an address to see rates.</p>`;
    renderTotals();
    return;
  }

  emit('POST /api/shipping-rates', {seed: config.seed, cart: config.cart, address});
  setPricing(true);

  let response;
  let data;
  try {
    response = await fetch('/api/shipping-rates', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({seed: config.seed, cart: config.cart, address})
    });
    data = await response.json();
  } finally {
    setPricing(false);
  }
  emit(`← ${response.status}`, data);

  if (!response.ok) {
    quote = null;
    const message = {
      unserviceable: "This shop doesn't ship to that country.",
      empty: 'Add something to the cart first.'
    };
    shippingBox.innerHTML = `<p class="text-xs text-rose-600">${
      message[data.error] ?? 'Could not load shipping rates.'
    }</p>`;
    renderTotals();
    return;
  }

  quote = {quote: data.quote, sig: data.sig};
  // Whatever is selected survives the re-render if the new rates still offer it, so a
  // cart edit does not silently move the shopper onto a different one. A preset's
  // request outranks that, and has to outlive the several lookups its own click starts.
  const chosen = preferredOption ?? shippingBox.querySelector('input[name="shipping"]:checked')?.value;
  const preferred = data.shippingOptions.find((o) => o.id === chosen) ?? data.shippingOptions[0];
  shippingBox.innerHTML = data.shippingOptions
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
      renderTotals();
    });
  }

  renderTotals();
};

/**
 * A cart edit changes the goods total without a re-render, so the amount every
 * mounted component quotes has to follow it. Rates are re-fetched because a signed
 * quote only covers the cart it was issued for.
 */
export const setGoods = (goods, cart) => {
  if (!config) return;
  const wasEmpty = !hasSomethingToBuy();
  config.goods = goods;
  config.cart = cart;

  // Emptying the cart unmounts every component, and the SDK rejects an amount of
  // zero, so crossing that line either way has to rebuild rather than reprice.
  if (wasEmpty !== !hasSomethingToBuy()) {
    remount();
    return;
  }

  renderTotals();
  loadRates();
};

const cardProps = () => ({
  accountId: config.accountId,
  amount: currentTotal(),
  currency: config.currency,
  sessionId: config.seed,
  language: 'en',
  style: config.cardStyle,
  fonts: config.cardFonts,
  onError: (error) => setError(error?.message ?? String(error))
});

/**
 * Both components tokenize through `submit()`, so only the mount differs — and
 * how readiness is reported. `CardGroup.onChange` gives an aggregate `complete`
 * across its three frames; `CardInput.onChange` has no equivalent, so the button
 * stays enabled and an incomplete card surfaces as a submit error instead.
 */
const mountCard = () => {
  const monei = window.monei;

  // The hosted page collects the card itself, so there is nothing to mount and the
  // button is ready the moment a quote exists.
  if (isRedirectFlow()) {
    complete = true;
    return;
  }

  const fields = el('card-fields');
  if (!hasSomethingToBuy() || !methodAllowed('card')) {
    if (fields) fields.hidden = true;
    if (payButton) payButton.hidden = true;
    syncCheckoutPanel();
    return;
  }

  // A cart edit remounts without a fresh render, so a hide from last time stands.
  if (fields) fields.hidden = false;
  if (payButton) payButton.hidden = false;

  if (config.cardUi === 'parts') {
    card = monei.CardGroup({
      ...cardProps(),
      onChange: (event) => {
        complete = event.complete;
        setError(event.error);
        setBusy(false);
      }
    });
    monei.CardNumber({group: card, placeholder: '1234 1234 1234 1234'}).render('#card-number');
    monei.CardExpiry({group: card, placeholder: 'MM/YY'}).render('#card-expiry');
    monei.CardCvc({group: card, placeholder: 'CVC'}).render('#card-cvc');
    return;
  }

  complete = true;
  card = monei.CardInput({
    ...cardProps(),
    onChange: (event) => {
      setError(event.isTouched ? event.error : null);
      setBusy(false);
    }
  });
  card.render('#card-input');
};

/**
 * The open sheet holds a total the server priced from the cart it saw. A cart
 * change while it is open would make the sheet quote a price /api/payment then
 * refuses, so the quantity controls go read-only for as long as it is open.
 *
 * Neither wallet reports a dismissal — Apple Pay wires no `oncancel`, and Google
 * Pay swallows the `loadPaymentData` rejection under `requestShipping` — so this
 * cannot be released on a close event. `pointerdown` anywhere in the document is
 * the recovery: reaching the page at all means the sheet is no longer over it.
 */
const lockCart = (locked) => {
  walletOpen = locked;
  for (const control of document.querySelectorAll('[data-cart-add], [data-cart-step]')) control.disabled = locked;
  if (payButton) payButton.disabled = locked || !complete || !quote;

  // Armed a tick late: the tap that opens the sheet is itself a `pointerdown`, and on
  // a touch screen it fires before the sheet appears — arming synchronously unlocks
  // on the very gesture that locked.
  if (locked) setTimeout(() => document.addEventListener('pointerdown', unlockCart, {once: true, capture: true}), 0);
  else document.removeEventListener('pointerdown', unlockCart, {capture: true});
};

const unlockCart = () => {
  if (walletOpen) lockCart(false);
};

/**
 * The rail is rendered on the server, but `/client-payment-methods` answers per
 * caller — so a method the server could not see may still work here, and vice
 * versa. The component's own `onLoad` is the only authority.
 */
const methodAllowed = (id) => config.methods === null || config.methods.includes(id);

// `validateComponentProps` tests `accountId && amount && currency` for truthiness, so
// every component throws on a zero amount rather than rendering a disabled state.
const hasSomethingToBuy = () => config.goods > 0;

// The hosted page runs its own checkout, so the express components have nothing to
// contribute to it.
const isRedirectFlow = () => config.flow === 'redirect';

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

const walletRates = async (address) => {
  emit('onShippingAddressChange', address);

  const response = await fetch('/api/shipping-rates', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({seed: config.seed, cart: config.cart, address, wallet: true})
  });
  const data = await response.json();
  emit(`← ${response.status}`, data);

  // The sheet has no error channel: `ShippingAddressChangeResult` is
  // `{shippingOptions?, amount?}`. Throwing is what produces Apple Pay's
  // `addressUnserviceable` and Google Pay's `SHIPPING_ADDRESS_UNSERVICEABLE`.
  //
  // Clearing the quote first is what actually blocks the payment: the sheet stays
  // open and submittable after the error, and a kept quote would let `onSubmit`
  // pay for the last serviceable address instead.
  if (!response.ok) {
    walletQuote = null;
    walletUnserviceable = data.error === 'unserviceable';
    throw new Error(data.error ?? 'No rates for this address');
  }

  walletUnserviceable = false;
  walletQuote = {quote: data.quote, sig: data.sig, optionId: data.shippingOptions[0].id};

  return {shippingOptions: data.shippingOptions, amount: data.amount};
};

/**
 * Shared by both express components: PaymentRequest and PayPal hand `onSubmit` the
 * same shape, and the quote they must be charged against is the one the last
 * shipping callback signed.
 */
const walletSubmit = async (result) => {
  emit('wallet.onSubmit', {
    method: result?.paymentMethod,
    token: result?.token ? `${result.token.slice(0, 10)}…` : null,
    error: result?.error ?? null
  });

  if (result.error || !result.token) {
    lockCart(false);
    return setExpressError(result.error ?? 'The wallet did not return a payment method.');
  }

  // Dismissing the sheet fires no callback, so the lock is released here and by the
  // watchdog rather than on a close event that does not exist.
  lockCart(false);

  if (!walletQuote) {
    emit('approved, not created', {
      reason: walletUnserviceable ? 'unserviceable address' : 'no shipping quote',
      paymentMethod: result.paymentMethod
    });
    return setExpressError(
      walletUnserviceable
        ? "This shop doesn't ship to that address, so the order was not placed. Nothing was charged."
        : 'The wallet did not report a shipping address, so the order could not be priced.'
    );
  }

  emit(`${result.paymentMethod}.onSubmit`, {
    finalAmount: result.finalAmount,
    shippingOption: result.shippingOption?.id,
    token: `${result.token.slice(0, 12)}…`
  });

  const shipping = result.shippingDetails;
  await submitPayment({
    paymentToken: result.token,
    optionId: result.shippingOption?.id ?? walletQuote.optionId,
    quote: walletQuote.quote,
    sig: walletQuote.sig,
    // The wallet's own display total. A claim to check against the recomputed
    // amount, never an amount to charge.
    walletAmount: result.finalAmount,
    customer: {name: shipping?.name, email: shipping?.email},
    address: shipping?.address
  });
};

const mountPaymentRequest = () => {
  const container = el('payment-request');
  if (!container) return;

  if (isRedirectFlow() || !hasSomethingToBuy() || !methodAllowed('wallet')) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const reason = el('express-reason');

  emit('PaymentRequest.mount', {
    amount: config.goods,
    currency: config.currency,
    requestShipping: true,
    requestBilling: true,
    shippingOptions: config.initialShippingOptions.length,
    host: location.hostname,
    https: location.protocol === 'https:'
  });

  paymentRequest = window.monei.PaymentRequest({
    accountId: config.accountId,
    amount: config.goods,
    currency: config.currency,
    sessionId: config.seed,
    requestShipping: true,
    requestBilling: true,
    // Apple Pay reads `shippingMethods` when the sheet is constructed and Google
    // Pay reads `shippingOptionParameters` at the same point, so an empty list
    // here means the first sheet opens with no shipping at all.
    shippingOptions: config.initialShippingOptions,
    style: {height: 47, borderRadius: config.walletRadius},

    onShippingAddressChange: walletRates,

    onShippingOptionChange: async (option) => {
      emit('onShippingOptionChange', option);
      walletQuote = walletQuote && {...walletQuote, optionId: option.id};
      return {amount: config.goods + option.amount};
    },

    onBeforeOpen: () => {
      emit('PaymentRequest.onBeforeOpen', {returning: true});
      setExpressError(null);
      lockCart(true);
      // The frame's permission policy decides whether Apple Pay may open at all, and
      // a refusal is silent, so it is recorded at the moment of the attempt.
      const frame = container.querySelector('iframe');
      emit('PaymentRequest.frame', {
        allow: frame?.getAttribute('allow') ?? '(absent)',
        sandbox: frame?.getAttribute('sandbox') ?? '(none)',
        applePay: typeof window.ApplePaySession,
        canMakePayments: window.ApplePaySession?.canMakePayments?.() ?? null
      });
      return true;
    },

    onBeforeSubmit: (result) => {
      emit('PaymentRequest.onBeforeSubmit', {method: result?.paymentMethod});
      return true;
    },

    onSubmit: walletSubmit,

    onError: (error) => {
      lockCart(false);
      emit('PaymentRequest.onError', {message: error?.message ?? String(error)});
      setExpressError(error?.message ?? 'The wallet could not complete this payment.');
    },

    onLoad: (isSupported) => {
      emit('PaymentRequest.onLoad', {isSupported});
      setMethodSupported('wallet', isSupported);
      if (isSupported) return;

      container.hidden = true;
      if (reason) {
        reason.textContent =
          'No wallet is available in this browser. Apple Pay needs Safari on Apple hardware; Google Pay needs a signed-in Chrome profile with a saved card.';
        reason.hidden = false;
      }
    }
  });

  paymentRequest.render('#payment-request');
};

/**
 * Bizum collects no address of its own, so it pays for whatever the page's form and
 * shipping selection already priced — the card path's quote, not a wallet one. In
 * test mode the provider rejects anything at or above €5.
 */
const mountBizum = () => {
  const container = el('bizum');
  if (!container || isRedirectFlow() || !hasSomethingToBuy() || !methodAllowed('bizum')) return;

  bizum = window.monei.Bizum({
    accountId: config.accountId,
    amount: currentTotal(),
    currency: config.currency,
    sessionId: config.seed,
    // The one number the sandbox accepts, so the modal opens ready to pay.
    phoneNumber: BIZUM_TEST_PHONE,
    // Documented, but the prop never appears in the live bundle and Bizum does not
    // render outside Spain, so whether the modal picks the font up is unverified.
    style: {height: 47, borderRadius: config.walletRadius, fontFamily: config.pageFont},
    fonts: config.cardFonts,

    onBeforeOpen: () => {
      setError(null);
      if (!quote) {
        setError('Enter a shipping address first, so the order can be priced.');
        return false;
      }
      return true;
    },

    onSubmit: async (result) => {
      if (result.error || !result.token) {
        return setError(result.error ?? 'Bizum did not return a payment.');
      }

      emit('Bizum.onSubmit', {amount: currentTotal(), token: `${result.token.slice(0, 12)}…`});

      await submitPayment({
        paymentToken: result.token,
        optionId: shippingBox.querySelector('input[name="shipping"]:checked')?.value,
        ...quote,
        customer: {
          name: document.querySelector('[name="name"]')?.value,
          email: document.querySelector('[name="email"]')?.value
        },
        address: addressFromForm()
      });
    },

    onError: (error) => {
      emit('Bizum.onError', {message: error?.message ?? String(error)});
      setError(error?.message ?? 'Bizum could not complete this payment.');
    },

    onLoad: (isSupported) => {
      emit('Bizum.onLoad', {isSupported});
      setMethodSupported('bizum', isSupported);
      for (const id of ['bizum-row', 'bizum-preset']) {
        const node = el(id);
        if (node) node.hidden = !isSupported;
      }
      syncCheckoutPanel();
    }
  });

  bizum.render('#bizum');
};

/**
 * Mounted without `requestShipping`, so the buyer cannot change the address inside
 * PayPal and the amount is settled before the popup opens. Asking PayPal to collect
 * it instead requires repricing the open order through `order.patch`, which never
 * fires; the payment then fails with E206 when the buyer picks a different option.
 * Like Bizum, this pays for whatever the page's form and shipping selection priced.
 */
const mountPayPal = () => {
  const container = el('paypal');
  if (!container || isRedirectFlow() || !hasSomethingToBuy() || !methodAllowed('paypal')) return;

  payPal = window.monei.PayPal({
    accountId: config.accountId,
    amount: currentTotal(),
    currency: config.currency,
    sessionId: config.seed,
    // PayPal's own `Buttons()` validates this and rejects a CSS string, unlike the
    // other components which parse it.
    style: {height: 47, borderRadius: Number.parseInt(config.walletRadius, 10) || 0},

    onBeforeOpen: () => {
      setError(null);
      if (!quote) {
        setError('Enter a shipping address first, so the order can be priced.');
        return false;
      }
      return true;
    },

    onSubmit: async (result) => {
      if (result.error || !result.token) {
        return setError(result.error ?? 'PayPal did not return a payment.');
      }

      emit('PayPal.onSubmit', {amount: currentTotal(), token: `${result.token.slice(0, 12)}…`});

      await submitPayment({
        paymentToken: result.token,
        optionId: shippingBox.querySelector('input[name="shipping"]:checked')?.value,
        ...quote,
        customer: {
          name: document.querySelector('[name="name"]')?.value,
          email: document.querySelector('[name="email"]')?.value
        },
        address: addressFromForm()
      });
    },

    onError: (error) => {
      emit('PayPal.onError', {message: error?.message ?? String(error)});
      setError(error?.message ?? 'PayPal could not complete this payment.');
    },

    // Reports `false` reliably but `true` optimistically — it fires before
    // `Buttons().render()` is attempted, so a later failure surfaces via onError.
    onLoad: (isSupported) => {
      emit('PayPal.onLoad', {isSupported});
      setMethodSupported('paypal', isSupported);
      const row = el('paypal-row');
      if (row) row.hidden = !isSupported;
      syncCheckoutPanel();
    }
  });

  payPal.render('#paypal');
};

const payByRedirect = async () => {
  setBusy(true);
  setError(null);

  const optionId = shippingBox.querySelector('input[name="shipping"]:checked')?.value;
  emit('POST /api/redirect-payment', {optionId, amount: currentTotal()});

  try {
    const response = await fetch('/api/redirect-payment', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        optionId,
        ...quote,
        customer: {
          name: document.querySelector('[name="name"]')?.value,
          email: document.querySelector('[name="email"]')?.value
        },
        address: addressFromForm(),
        search: window.location.search
      })
    });
    const data = await response.json();
    emit(`← ${response.status}`, data);
    if (!response.ok) throw new Error(data.error ?? 'Payment could not be created');
    window.location.assign(data.redirectUrl);
  } catch (error) {
    setBusy(false);
    setError(`${error.message}. Nothing was charged — you can try again.`);
  }
};

const pay = async () => {
  if (!quote) return setError('Choose a shipping option first.');
  if (isRedirectFlow()) return payByRedirect();

  setBusy(true);
  setError(null);

  let token;
  try {
    const result = await card.submit();
    if (result.error) throw new Error(result.error);
    token = result.token;
    emit(`${config.cardUi === 'parts' ? 'CardGroup' : 'CardInput'}.submit()`, {
      paymentMethod: result.paymentMethod,
      token: `${token.slice(0, 12)}…`
    });
  } catch (error) {
    setBusy(false);
    return setError(error.message ?? 'Could not read the card.');
  }

  const optionId = shippingBox.querySelector('input[name="shipping"]:checked')?.value;

  await submitPayment({
    paymentToken: token,
    optionId,
    ...quote,
    customer: {
      name: document.querySelector('[name="name"]')?.value,
      email: document.querySelector('[name="email"]')?.value
    },
    address: addressFromForm()
  });
};

/**
 * Shared by the card form and the wallet sheet: both hold a token and a signed
 * quote by this point, and both need the same `nextAction` branch.
 */
const submitPayment = async (body) => {
  emit('POST /api/payment', {optionId: body.optionId, walletAmount: body.walletAmount});

  let data;
  try {
    const response = await fetch('/api/payment', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({...body, search: window.location.search})
    });
    data = await response.json();
    emit(`← ${response.status}`, data);
    if (!response.ok) throw new Error(data.error ?? 'Payment failed');
  } catch (error) {
    setBusy(false);
    // The card was tokenised but no payment exists. Saying so beats a generic
    // failure, because the shopper's card was never charged and a retry is safe.
    return setError(`${error.message}. Your card was not charged — you can try again.`);
  }

  const receipt = `/receipt?id=${encodeURIComponent(data.id)}`;
  emit('monei.confirmPayment()', {paymentId: data.id});

  let result;
  try {
    result = await window.monei.confirmPayment({paymentId: data.id, paymentToken: body.paymentToken});
    emit('← confirmPayment', {status: result?.status, statusCode: result?.statusCode});
  } catch (error) {
    // The payment exists either way, so its own status decides the outcome.
    emit('confirmPayment threw', {message: error?.message ?? String(error)});
    window.location.assign(receipt);
    return;
  }

  // A popup blocker leaves the challenge nowhere to open, and the redirect is the
  // only way through it.
  const next = result?.nextAction;
  if (next?.mustRedirect && next.redirectUrl) {
    window.location.assign(next.redirectUrl);
    return;
  }

  window.location.assign(receipt);
};

const remount = async () => {
  // The previous page's iframes would otherwise linger, and a stale CardGroup
  // keeps its controller frame attached to a document that no longer exists.
  for (const component of [card, paymentRequest, payPal, bizum]) {
    try {
      await component?.destroy();
    } catch {
      // Already gone with the old document.
    }
  }
  card = null;
  paymentRequest = null;
  payPal = null;
  bizum = null;

  mountCard();
  mountPaymentRequest();
  mountBizum();
  mountPayPal();
  syncCheckoutPanel();
  syncQuoteGate();
  loadRates();
};

const start = async () => {
  const button = el('pay');
  if (!button || button.dataset.wired === 'true') return;
  button.dataset.wired = 'true';

  readPage();
  await remount();

  payButton.addEventListener('click', pay);
  for (const name of ['country', 'zip']) {
    const input = document.querySelector(`[name="${name}"]`);
    input?.addEventListener('change', loadRates);
    input?.addEventListener('blur', loadRates);
  }
};

// The demo's Bizum preset needs a specific rate, and the address it fills triggers
// more than one lookup, so the choice is held rather than applied to one render.
document.addEventListener('monei:prefer-option', (event) => {
  preferredOption = event.detail;
});

// Fires on the first load as well as after every client-side navigation.
document.addEventListener('astro:page-load', () => {
  if (window.monei) start();
  else window.addEventListener('load', start, {once: true});
});
