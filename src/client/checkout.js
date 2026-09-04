import {emit} from './events.js';

const config = JSON.parse(document.getElementById('demo-config').textContent);

const el = (id) => document.getElementById(id);
const payButton = el('pay');
const payError = el('pay-error');
const shippingBox = el('shipping-options');
const totalOut = el('cart-total');
const shippingOut = el('cart-shipping');

let quote = null;
let group = null;
let complete = false;

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

  // The token is stamped with the group's amount, and the payment is refused if
  // the two disagree — so the group has to follow the shipping selection.
  group?.updateProps({amount: currentTotal()});
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

const mountCard = () => {
  const monei = window.monei;
  group = monei.CardGroup({
    accountId: config.accountId,
    amount: currentTotal(),
    currency: config.currency,
    language: config.lang,
    sessionId: config.seed,
    style: config.cardStyle,
    fonts: config.cardFonts,
    onChange: (event) => {
      complete = event.complete;
      setError(event.error);
      setBusy(false);
    },
    onError: (error) => setError(error?.message ?? String(error))
  });

  monei.CardNumber({group, placeholder: '1234 1234 1234 1234'}).render('#card-number');
  monei.CardExpiry({group, placeholder: 'MM/YY'}).render('#card-expiry');
  monei.CardCvc({group, placeholder: 'CVC'}).render('#card-cvc');
};

const pay = async () => {
  if (!quote) return setError('Choose a shipping option first.');
  setBusy(true);
  setError(null);

  let token;
  try {
    const result = await group.submit();
    if (result.error) throw new Error(result.error);
    token = result.token;
    emit('group.submit()', {paymentMethod: result.paymentMethod, token: `${token.slice(0, 12)}…`});
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

const start = () => {
  mountCard();
  loadRates();
  payButton.addEventListener('click', pay);
  for (const name of ['country', 'zip']) {
    const input = document.querySelector(`[name="${name}"]`);
    input?.addEventListener('change', loadRates);
    input?.addEventListener('blur', loadRates);
  }
};

if (window.monei) start();
else window.addEventListener('load', start, {once: true});
