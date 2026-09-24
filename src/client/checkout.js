import {emit} from './events.js';
import * as page from './checkout-page.js';

// The Bizum sandbox accepts this one number, and the modal opens with it already filled in.
const BIZUM_TEST_PHONE = '+34500000000';

/**
 * Client-side navigation replaces the whole document body, so every component
 * belongs to one page render and is destroyed and rebuilt by `remount`.
 */
let config;
let sessionId;
let card = null;
let paymentRequest = null;
let payPal = null;
let bizum = null;
let walletOption = null;
let walletUnserviceable = false;
let ratesRequest = 0;
let formOrderAtOpen = null;

// One per page load: the components tokenize under it and /api/payment opens the
// payment with it, and MONEI expects a different one for each customer.
const newSessionId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

const updateAmount = (component, amount = page.currentTotal()) => {
  // Rejects asynchronously once the component's frame is gone, so the promise has
  // to be caught rather than the call wrapped.
  Promise.resolve(component?.updateProps({amount})).catch(() => {});
};

const reprice = () => {
  page.renderTotals();
  // A navigation can destroy these between the listener firing and this running.
  updateAmount(card);
  updateAmount(bizum);
  updateAmount(payPal);
  // The sheet adds shipping itself, once it has an address.
  updateAmount(paymentRequest, config.goods);
};

const loadRates = async () => {
  const {address} = page.order();
  // Lookups overlap when an address and a cart change land together; only the
  // latest may write the rates.
  const request = ++ratesRequest;

  // A country alone is not enough to price Spain, where the postcode decides
  // between mainland and the Canaries. Quoting the cheaper zone on a guess shows a
  // total that moves once the shopper finishes typing.
  if (!address.country || (config.zipZones.includes(address.country) && !/^\d{5}$/.test(address.zip))) {
    page.showRatesNote('Enter an address to see rates.');
    reprice();
    return;
  }

  emit('POST /api/shipping-rates', {cart: config.cart, address});
  page.setPricing(true);

  let response;
  let data;
  try {
    response = await fetch('/api/shipping-rates', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({cart: config.cart, address})
    });
    data = await response.json();
  } catch {
    response = null;
  }
  if (request !== ratesRequest) return;
  page.setPricing(false);
  emit(`← ${response?.status ?? 'network error'}`, data);

  if (!response?.ok) {
    const message = {
      unserviceable: "This shop doesn't ship to that country.",
      empty: 'Add something to the cart first.'
    };
    page.showRatesNote(message[data?.error] ?? 'Could not load shipping rates.', {error: true});
    reprice();
    return;
  }

  page.renderRates(data.shippingOptions, reprice);
  reprice();
};

/**
 * A cart edit changes the goods total without a re-render, so the amount every
 * mounted component quotes has to follow it.
 */
export const setGoods = (goods, cart) => {
  if (!config) return;
  const wasEmpty = !page.hasSomethingToBuy();
  config.goods = goods;
  config.cart = cart;

  // Emptying the cart unmounts every component, and the SDK rejects an amount of
  // zero, so crossing that line either way has to rebuild rather than reprice.
  if (wasEmpty !== !page.hasSomethingToBuy()) {
    remount();
    return;
  }

  reprice();
};

const cardProps = () => ({
  accountId: config.accountId,
  amount: page.currentTotal(),
  currency: config.currency,
  sessionId,
  language: 'en',
  style: config.cardStyle,
  fonts: config.cardFonts,
  onError: (error) => page.setError(error?.message ?? String(error))
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
  // button is ready the moment a rate is selected.
  if (page.isRedirectFlow()) {
    page.setCardComplete(true);
    return;
  }

  const shown = page.hasSomethingToBuy() && page.methodAllowed('card');
  page.showCard(shown);
  if (!shown) return;

  if (config.cardUi === 'parts') {
    // Three empty fields, until `onChange` reports otherwise.
    page.setCardComplete(false);
    card = monei.CardGroup({
      ...cardProps(),
      onChange: (event) => {
        page.setError(event.error);
        page.setCardComplete(event.complete);
      }
    });
    monei.CardNumber({group: card, placeholder: '1234 1234 1234 1234'}).render('#card-number');
    monei.CardExpiry({group: card, placeholder: 'MM/YY'}).render('#card-expiry');
    monei.CardCvc({group: card, placeholder: 'CVC'}).render('#card-cvc');
    return;
  }

  page.setCardComplete(true);
  card = monei.CardInput({
    ...cardProps(),
    onChange: (event) => {
      page.setError(event.isTouched ? event.error : null);
    }
  });
  card.render('#card-input');
};

const walletRates = async (address) => {
  emit('onShippingAddressChange', address);

  // Cleared first, so a failed lookup of any kind leaves nothing to pay with: the
  // sheet stays open and submittable after the error.
  walletOption = null;

  let response;
  let data;
  try {
    response = await fetch('/api/shipping-rates', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({cart: config.cart, address, wallet: true})
    });
    data = await response.json();
  } catch {
    response = null;
  }
  emit(`← ${response?.status ?? 'network error'}`, data);

  // The sheet shows an address as unserviceable when this callback throws.
  if (!response?.ok) {
    walletUnserviceable = data?.error === 'unserviceable';
    throw new Error(data?.error ?? 'No rates for this address');
  }

  walletUnserviceable = false;
  walletOption = data.shippingOptions[0].id;

  return {shippingOptions: data.shippingOptions, amount: data.amount};
};

const walletSubmit = async (result) => {
  // Dismissing the sheet fires no callback, so the lock is released here and by the
  // `pointerdown` listener rather than on a close event that does not exist.
  page.lockCart(false);

  if (result.error || !result.token) {
    return page.setExpressError(result.error ?? 'The wallet did not return a payment method.');
  }

  if (!walletOption) {
    emit('approved, not created', {
      reason: walletUnserviceable ? 'unserviceable address' : 'no shipping option',
      paymentMethod: result.paymentMethod
    });
    return page.setExpressError(
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
  const billing = result.billingDetails;
  await submitPayment(
    {
      paymentToken: result.token,
      optionId: result.shippingOption?.id ?? walletOption,
      // The wallet's own display total. A claim to check against the recomputed
      // amount, never an amount to charge.
      walletAmount: result.finalAmount,
      customer: {name: shipping?.name ?? billing?.name, email: billing?.email ?? shipping?.email},
      address: shipping?.address,
      billing: billing && {name: billing.name, address: billing.address}
    },
    page.setExpressError
  );
};

const mountPaymentRequest = () => {
  const container = document.getElementById('payment-request');
  if (!container) return;

  container.hidden = page.isRedirectFlow() || !page.hasSomethingToBuy() || !page.methodAllowed('wallet');
  if (container.hidden) return;

  // Locked from our own listener rather than `onBeforeOpen`: Safari opens the Apple
  // Pay sheet only from inside the tap's own task. The container outlives a remount,
  // so the listener is added once.
  if (container.dataset.wired !== 'true') {
    container.dataset.wired = 'true';
    container.addEventListener('pointerdown', () => {
      page.setExpressError(null);
      page.lockCart(true);
    });
  }

  paymentRequest = window.monei.PaymentRequest({
    accountId: config.accountId,
    amount: config.goods,
    currency: config.currency,
    sessionId,
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
      walletOption = walletOption && option.id;
      return {amount: config.goods + option.amount};
    },

    onSubmit: walletSubmit,

    onError: (error) => {
      page.lockCart(false);
      emit('PaymentRequest.onError', {message: error?.message ?? String(error)});
      page.setExpressError(error?.message ?? 'The wallet could not complete this payment.');
    },

    onLoad: (isSupported) => {
      emit('PaymentRequest.onLoad', {isSupported});
      page.methodLoaded('wallet', isSupported);
    }
  });

  paymentRequest.render('#payment-request');
};

/**
 * Bizum and PayPal collect no address of their own, so they pay for whatever the
 * page's form and shipping selection already priced — the same order the card pays.
 * The page stays editable behind their popup, so the order is taken when it opens:
 * that is the amount the popup charges.
 */
const openFormOrder = () => {
  page.setError(null);
  if (!page.validateForm()) return false;
  if (!page.selectedOption()) {
    page.setError('Enter a shipping address first, so the order can be priced.');
    return false;
  }
  formOrderAtOpen = {...page.order(), cart: config.cart};
  return true;
};

const submitFormOrder = (name) => async (result) => {
  if (result.error || !result.token) {
    return page.setError(result.error ?? `${name} did not return a payment.`);
  }

  emit(`${name}.onSubmit`, {amount: page.currentTotal(), token: `${result.token.slice(0, 12)}…`});
  await submitPayment({paymentToken: result.token, ...formOrderAtOpen});
};

const componentError = (name) => (error) => {
  emit(`${name}.onError`, {message: error?.message ?? String(error)});
  page.setError(error?.message ?? `${name} could not complete this payment.`);
};

// The test environment supports Bizum only below €5.
const mountBizum = () => {
  const container = document.getElementById('bizum');
  if (!container || page.isRedirectFlow() || !page.hasSomethingToBuy() || !page.methodAllowed('bizum')) {
    page.showMethodRows('bizum', false);
    return;
  }

  bizum = window.monei.Bizum({
    accountId: config.accountId,
    amount: page.currentTotal(),
    currency: config.currency,
    sessionId,
    phoneNumber: BIZUM_TEST_PHONE,
    style: {height: 47, borderRadius: config.walletRadius, fontFamily: config.pageFont},
    fonts: config.cardFonts,

    onBeforeOpen: openFormOrder,
    onSubmit: submitFormOrder('Bizum'),
    onError: componentError('Bizum'),

    onLoad: (isSupported) => {
      emit('Bizum.onLoad', {isSupported});
      page.methodLoaded('bizum', isSupported);
    }
  });

  bizum.render('#bizum');
};

/**
 * Mounted without `requestShipping`, so the buyer cannot change the address inside
 * PayPal and the amount is settled before the popup opens.
 */
const mountPayPal = () => {
  const container = document.getElementById('paypal');
  if (!container || page.isRedirectFlow() || !page.hasSomethingToBuy() || !page.methodAllowed('paypal')) {
    page.showMethodRows('paypal', false);
    return;
  }

  payPal = window.monei.PayPal({
    accountId: config.accountId,
    amount: page.currentTotal(),
    currency: config.currency,
    sessionId,
    // A number: PayPal's buttons take `borderRadius` in pixels.
    style: {height: 47, borderRadius: Number.parseInt(config.walletRadius, 10) || 0},

    onBeforeOpen: openFormOrder,
    onSubmit: submitFormOrder('PayPal'),
    onError: componentError('PayPal'),

    // `true` means PayPal is available, not that its buttons rendered; a render
    // failure arrives through `onError`.
    onLoad: (isSupported) => {
      emit('PayPal.onLoad', {isSupported});
      page.methodLoaded('paypal', isSupported);
    }
  });

  payPal.render('#paypal');
};

const payByRedirect = async () => {
  page.setBusy(true);

  const formOrder = page.order();
  emit('POST /api/redirect-payment', {cart: config.cart, optionId: formOrder.optionId, amount: page.currentTotal()});

  try {
    const response = await fetch('/api/redirect-payment', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({sessionId, cart: config.cart, ...formOrder, search: window.location.search})
    });
    const data = await response.json();
    emit(`← ${response.status}`, data);
    if (!response.ok) throw new Error(data.error ?? 'Payment could not be created');
    window.location.assign(data.redirectUrl);
  } catch (error) {
    page.setBusy(false);
    page.setError(`${error.message}. Nothing was charged — you can try again.`);
  }
};

const pay = async () => {
  page.setError(null);
  if (!page.validateForm()) return;
  if (!page.selectedOption()) return page.setError('Choose a shipping option first.');
  if (page.isRedirectFlow()) return payByRedirect();

  page.setBusy(true);

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
    page.setBusy(false);
    return page.setError(error.message ?? 'Could not read the card.');
  }

  await submitPayment({paymentToken: token, ...page.order()});
};

// The demo's settings travel on the receipt link, so a retry keeps the theme and cart.
const receiptUrl = (paymentId) => {
  const params = new URLSearchParams(window.location.search);
  params.delete('error');
  params.set('id', paymentId);
  return `/receipt?${params}`;
};

/**
 * Shared by every Components method: each holds a token and a shipping option by
 * this point, and each needs the same `nextAction` branch. `showError` is the error
 * line next to the button the shopper used.
 */
const submitPayment = async (body, showError = page.setError) => {
  emit('POST /api/payment', {cart: body.cart ?? config.cart, optionId: body.optionId, walletAmount: body.walletAmount});

  let data;
  try {
    const response = await fetch('/api/payment', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({sessionId, cart: config.cart, ...body, search: window.location.search})
    });
    data = await response.json();
    emit(`← ${response.status}`, data);
    if (!response.ok) throw new Error(data.error ?? 'Payment failed');
  } catch (error) {
    page.setBusy(false);
    // A token exists but no payment does, so nothing was charged and a retry is safe.
    return showError(`${error.message}. Nothing was charged — you can try again.`);
  }

  const receipt = receiptUrl(data.id);
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

const mountAll = async () => {
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
  walletOption = null;
  walletUnserviceable = false;

  mountCard();
  mountPaymentRequest();
  mountBizum();
  mountPayPal();
  page.syncCheckoutPanel();
  page.syncRateGate();
  loadRates();
};

// Queued: a cart edit can start a remount while the last one is still destroying
// components, and two running at once mount everything twice.
let mounting = Promise.resolve();
const remount = () => (mounting = mounting.then(mountAll));

const start = async () => {
  const button = document.getElementById('pay');
  if (!button || button.dataset.wired === 'true') return;
  button.dataset.wired = 'true';

  config = page.readPage();
  sessionId = newSessionId();
  await remount();

  button.addEventListener('click', pay);
  for (const name of ['country', 'zip']) {
    document.querySelector(`[name="${name}"]`)?.addEventListener('change', loadRates);
  }
};

// Fires on the first load as well as after every client-side navigation.
document.addEventListener('astro:page-load', () => {
  if (window.monei) start();
  else window.addEventListener('load', start, {once: true});
});
