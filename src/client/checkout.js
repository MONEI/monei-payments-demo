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
let cardParts = [];
let paymentRequest = null;
let payPal = null;
let bizum = null;
let walletOrder = null;
let ratesRequest = 0;
let formOrderAtOpen = null;

// One per page load: the components tokenize under it and /api/payment opens the
// payment with it, and MONEI expects a different one for each customer.
const newSessionId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

// Every server call here is a JSON POST, and both sides of it go to the event log.
const postJson = async (path, body) => {
  emit(`POST ${path}`, body);
  let response = null;
  let data;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body)
    });
    data = await response.json();
  } catch {
    // A network error or a body that is not JSON; either way there is nothing to use.
  }
  emit(`← ${response?.status ?? 'network error'}`, data);
  return {ok: Boolean(response?.ok && data), data: data ?? {}};
};

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
  if (!address.country || (config.zipZones.includes(address.country) && !page.postcodeComplete())) {
    // Clears a lookup this one supersedes, whose own reply is now ignored.
    page.setPricing(false);
    page.showRatesNote('Enter an address to see rates.');
    reprice();
    return;
  }

  page.setPricing(true);
  const {ok, data} = await postJson('/api/shipping-rates', {cart: config.cart, address});
  if (request !== ratesRequest) return;
  page.setPricing(false);

  if (!ok) {
    const message = {
      unserviceable: "This shop doesn't ship to that country.",
      empty: 'Add something to the cart first.'
    };
    page.showRatesNote(message[data.error] ?? 'Could not load shipping rates.', {error: true});
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
    // Destroying the group leaves its parts mounted, so each is kept to destroy on its own.
    cardParts = [
      monei.CardNumber({group: card, placeholder: '1234 1234 1234 1234'}),
      monei.CardExpiry({group: card, placeholder: 'MM/YY'}),
      monei.CardCvc({group: card, placeholder: 'CVC'})
    ];
    cardParts[0].render('#card-number');
    cardParts[1].render('#card-expiry');
    cardParts[2].render('#card-cvc');
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

/**
 * The sheet prices the cart as it stood when this ran, and the page stays editable
 * behind it, so that cart is pinned here and paid for on submit: the order is always
 * the basket the sheet showed. Both wallets call this as the sheet opens.
 */
const walletRates = async (address) => {
  emit('onShippingAddressChange', address);
  page.setExpressError(null);
  const {cart, goods} = config;

  // Cleared first, so a failed lookup of any kind leaves nothing to pay with: the
  // sheet stays open and submittable after the error.
  walletOrder = null;

  const {ok, data} = await postJson('/api/shipping-rates', {cart, address, wallet: true});

  // The sheet shows an address as unserviceable when this callback throws.
  if (!ok) throw new Error(data.error ?? 'No rates for this address');

  walletOrder = {cart, goods, optionId: data.shippingOptions[0].id};

  return {shippingOptions: data.shippingOptions, amount: data.amount};
};

const walletSubmit = async (result) => {
  if (result.error || !result.token) {
    return page.setExpressError(result.error ?? 'The wallet did not return a payment method.');
  }

  if (!walletOrder) {
    emit('approved, not created', {reason: 'no shipping option', paymentMethod: result.paymentMethod});
    return page.setExpressError(
      'The wallet reported no address this shop can price, so the order was not placed. Nothing was charged.'
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
      cart: walletOrder.cart,
      optionId: result.shippingOption?.id ?? walletOrder.optionId,
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

  const shown = !page.isRedirectFlow() && page.hasSomethingToBuy() && page.methodAllowed('wallet');
  container.hidden = !shown;
  page.showExpress(shown);
  if (!shown) return;

  paymentRequest = window.monei.PaymentRequest({
    accountId: config.accountId,
    amount: config.goods,
    currency: config.currency,
    sessionId,
    requestShipping: true,
    requestBilling: true,
    // The options the sheet opens with, before it knows the address.
    shippingOptions: config.initialShippingOptions,
    style: {height: 47, borderRadius: config.walletRadius},

    onShippingAddressChange: walletRates,

    onShippingOptionChange: async (option) => {
      emit('onShippingOptionChange', option);
      if (walletOrder) walletOrder = {...walletOrder, optionId: option.id};
      return {amount: (walletOrder?.goods ?? config.goods) + option.amount};
    },

    onSubmit: walletSubmit,

    onError: (error) => {
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
  if (page.orderHeld()) return false;
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
    // Top-level rather than in `style`: the component converts this one to the number
    // PayPal's buttons need, and passes a `style.borderRadius` string through as is.
    borderRadius: config.walletRadius,
    style: {height: 47},

    onBeforeOpen: openFormOrder,
    onSubmit: submitFormOrder('PayPal'),
    onError: componentError('PayPal'),

    // `true` means PayPal is available, not that its buttons rendered.
    onLoad: (isSupported) => {
      emit('PayPal.onLoad', {isSupported});
      page.methodLoaded('paypal', isSupported);
    }
  });

  payPal.render('#paypal');
};

const payByRedirect = async () => {
  page.setBusy(true);

  const {ok, data} = await postJson('/api/redirect-payment', {
    sessionId,
    cart: config.cart,
    ...page.order(),
    search: window.location.search
  });
  if (ok) return window.location.assign(data.redirectUrl);

  page.setBusy(false);
  page.setError(`${data.error ?? 'Payment could not be created'}. Nothing was charged — you can try again.`);
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
const submitPayment = async ({paymentToken, ...order}, showError = page.setError) => {
  // The token stays in the browser: the server only prices the order and opens the payment.
  const {ok, data} = await postJson('/api/payment', {
    sessionId,
    cart: config.cart,
    ...order,
    search: window.location.search
  });
  if (!ok) {
    page.setBusy(false);
    // A token exists but no payment does, so nothing was charged and a retry is safe.
    return showError(`${data.error ?? 'Payment failed'}. Nothing was charged — you can try again.`);
  }

  const receipt = receiptUrl(data.id);
  emit('monei.confirmPayment()', {paymentId: data.id});

  let result;
  try {
    result = await window.monei.confirmPayment({paymentId: data.id, paymentToken});
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
  // keeps its controller frame attached to a document that no longer exists. A
  // component already gone with the old document rejects, which is fine.
  await Promise.allSettled([card, ...cardParts, paymentRequest, payPal, bizum].map((c) => c?.destroy()));
  card = null;
  cardParts = [];
  paymentRequest = null;
  payPal = null;
  bizum = null;
  walletOrder = null;

  mountCard();
  mountPaymentRequest();
  mountBizum();
  mountPayPal();
  page.syncCheckoutPanel();
  page.syncRateGate();
  loadRates();
};

// Queued: a cart edit can start a remount while the last one is still destroying
// components, and two running at once mount everything twice. A failed mount is
// reported and the queue carries on, so the next remount can still run.
let mounting = Promise.resolve();
const remount = () =>
  (mounting = mounting.then(mountAll).catch((error) => {
    emit('mount failed', {message: error?.message ?? String(error)});
    page.setError('The payment form could not load. Reload the page to try again.');
  }));

const start = async () => {
  const button = document.getElementById('pay');
  if (!button || button.dataset.wired === 'true') return;
  button.dataset.wired = 'true';

  config = page.readPage();
  sessionId = newSessionId();

  button.addEventListener('click', pay);
  for (const name of ['country', 'zip']) {
    document.querySelector(`[name="${name}"]`)?.addEventListener('change', loadRates);
  }
  await remount();
};

// Fires on the first load as well as after every client-side navigation.
document.addEventListener('astro:page-load', () => {
  if (window.monei) start();
  else window.addEventListener('load', start, {once: true});
});
