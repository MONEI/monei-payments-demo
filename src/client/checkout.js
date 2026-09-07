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
let shippingBox;
let totalOut;
let shippingOut;

let quote = null;
let card = null;
let complete = false;

const readPage = () => {
  config = JSON.parse(el('demo-config').textContent);
  payButton = el('pay');
  payError = el('pay-error');
  shippingBox = el('shipping-options');
  totalOut = el('cart-total');
  shippingOut = el('cart-shipping');
  quote = null;
  complete = false;
};

const money = (cents) =>
  new Intl.NumberFormat('en-IE', {style: 'currency', currency: config.currency}).format(cents / 100);

const setError = (message) => {
  payError.textContent = message ?? '';
  payError.hidden = !message;
};

const setBusy = (busy) => {
  payButton.disabled = busy || !complete || !quote;
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
  if (!address.country) return;

  emit('POST /api/shipping-rates', {seed: config.seed, address});

  const response = await fetch('/api/shipping-rates', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({seed: config.seed, address})
  });
  const data = await response.json();
  emit(`← ${response.status}`, data);

  if (!response.ok) {
    quote = null;
    shippingBox.innerHTML = `<p class="text-xs text-rose-600">${
      data.error === 'unserviceable' ? "We don't ship to this country yet." : 'Could not load shipping rates.'
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
  const body = {
    paymentToken: token,
    optionId,
    ...quote,
    customer: {
      name: document.querySelector('[name="name"]')?.value,
      email: document.querySelector('[name="email"]')?.value
    },
    address: addressFromForm()
  };

  emit('POST /api/payment', {optionId, amount: currentTotal()});

  let data;
  try {
    const response = await fetch('/api/payment', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body)
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
  if (card) {
    try {
      await card.destroy();
    } catch {
      // Already gone with the old document.
    }
    card = null;
  }

  readPage();
  mountCard();
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
