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
let walletQuote = null;
let walletOpen = false;
let walletUnserviceable = false;

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
  payButton.disabled = busy || walletOpen || !complete || !quote;
  payButton.textContent = busy ? 'Processing…' : `Pay ${money(currentTotal())}`;
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

const renderTotals = () => {
  const selected = shippingBox?.querySelector('input[name="shipping"]:checked');
  if (shippingOut) shippingOut.textContent = selected ? money(Number(selected.dataset.amount)) : '—';
  if (totalOut) totalOut.textContent = money(currentTotal());

  card?.updateProps({amount: currentTotal()});
  setBusy(false);
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

  emit('POST /api/shipping-rates', {seed: config.seed, address});

  const response = await fetch('/api/shipping-rates', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({seed: config.seed, cart: config.cart, address})
  });
  const data = await response.json();
  emit(`← ${response.status}`, data);

  if (!response.ok) {
    quote = null;
    shippingBox.innerHTML = `<p class="text-xs text-rose-600">${
      data.error === 'unserviceable' ? "This shop doesn't ship to that country." : 'Could not load shipping rates.'
    }</p>`;
    renderTotals();
    return;
  }

  quote = {quote: data.quote, sig: data.sig};
  shippingBox.innerHTML = data.shippingOptions
    .map(
      (option, index) => `
        <label class="flex items-center gap-2 text-sm">
          <input type="radio" name="shipping" value="${option.id}"
                 data-amount="${option.amount}" ${index === 0 ? 'checked' : ''} />
          <span class="flex-1">${option.label}</span>
          <span class="tabular-nums">${money(option.amount)}</span>
        </label>`
    )
    .join('');

  for (const input of shippingBox.querySelectorAll('input')) input.addEventListener('change', renderTotals);

  renderTotals();
};

const cardProps = () => ({
  accountId: config.accountId,
  amount: currentTotal(),
  currency: config.currency,
  sessionId: config.seed,
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

  if (locked) document.addEventListener('pointerdown', unlockCart, {once: true, capture: true});
  else document.removeEventListener('pointerdown', unlockCart, {capture: true});
};

const unlockCart = () => {
  if (walletOpen) lockCart(false);
};

const walletRates = async (address) => {
  emit('onShippingAddressChange', address);

  const response = await fetch('/api/shipping-rates', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({seed: config.seed, cart: config.cart, address})
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

const mountPaymentRequest = () => {
  const container = el('payment-request');
  if (!container) return;

  const reason = el('express-reason');

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
    style: {borderRadius: config.walletRadius},

    onShippingAddressChange: walletRates,

    onShippingOptionChange: async (option) => {
      emit('onShippingOptionChange', option);
      walletQuote = walletQuote && {...walletQuote, optionId: option.id};
      return {amount: config.goods + option.amount};
    },

    onBeforeOpen: () => {
      setExpressError(null);
      lockCart(true);
      return true;
    },

    onSubmit: async (result) => {
      if (result.error || !result.token) {
        lockCart(false);
        return setExpressError(result.error ?? 'The wallet did not return a card.');
      }

      // Dismissing the sheet fires no callback, so the lock is released here and
      // by the watchdog rather than on a close event that does not exist.
      lockCart(false);

      if (!walletQuote) {
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
        // The sheet's own display total. Under `requestShipping` the token carries
        // no amount, so this is a claim to check against the recomputed amount,
        // never an amount to charge.
        walletAmount: result.finalAmount,
        customer: {name: shipping?.name, email: shipping?.email},
        address: shipping?.address
      });
    },

    onError: (error) => {
      lockCart(false);
      emit('PaymentRequest.onError', {message: error?.message ?? String(error)});
      setExpressError(error?.message ?? 'The wallet could not complete this payment.');
    },

    onLoad: (isSupported) => {
      emit('PaymentRequest.onLoad', {isSupported});
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

const pay = async () => {
  if (!quote) return setError('Choose a shipping option first.');
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

  const next = data.nextAction;
  if (next?.mustRedirect && next.redirectUrl) {
    window.location.assign(next.redirectUrl);
    return;
  }
  if (next?.type === 'CONFIRM') {
    setBusy(false);
    return setError('This payment needs extra confirmation that the demo does not handle yet.');
  }
  window.location.assign(`/receipt?id=${encodeURIComponent(data.id)}`);
};

const start = async () => {
  const button = el('pay');
  if (!button || button.dataset.wired === 'true') return;
  button.dataset.wired = 'true';

  // The previous page's iframes would otherwise linger, and a stale CardGroup
  // keeps its controller frame attached to a document that no longer exists.
  for (const component of [card, paymentRequest]) {
    try {
      await component?.destroy();
    } catch {
      // Already gone with the old document.
    }
  }
  card = null;
  paymentRequest = null;

  readPage();
  mountCard();
  mountPaymentRequest();
  loadRates();

  payButton.addEventListener('click', pay);
  for (const name of ['country', 'zip']) {
    const input = document.querySelector(`[name="${name}"]`);
    input?.addEventListener('change', loadRates);
    input?.addEventListener('blur', loadRates);
  }
};

// Fires on the first load as well as after every client-side navigation.
document.addEventListener('astro:page-load', () => {
  if (window.monei) start();
  else window.addEventListener('load', start, {once: true});
});
