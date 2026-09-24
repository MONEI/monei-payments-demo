import {ZONE_TABLE} from './shipping.js';

const cardBlock = (cardUi) =>
  cardUi === 'parts'
    ? `const group = monei.CardGroup({
  accountId, amount, currency, sessionId,
  onChange: ({complete, error}) => setPayable(complete && !error)
});

monei.CardNumber({group, placeholder: '1234 1234 1234 1234'}).render('#card-number');
monei.CardExpiry({group, placeholder: 'MM/YY'}).render('#card-expiry');
monei.CardCvc({group, placeholder: 'CVC'}).render('#card-cvc');

document.querySelector('#pay').addEventListener('click', async () => {
  const {token, error} = await group.submit();
  if (error) return showError(error);
  await pay(orderForm(), token);
});`
    : `const card = monei.CardInput({
  accountId, amount, currency, sessionId,
  onChange: ({isTouched, error}) => showError(isTouched ? error : null)
});

card.render('#card-input');

document.querySelector('#pay').addEventListener('click', async () => {
  const {token, error} = await card.submit();
  if (error) return showError(error);
  await pay(orderForm(), token);
});`;

export const clientSnippet = ({
  accountId,
  currency,
  goods,
  cart,
  cardUi,
  initialShippingOptions
}) => `<script src="https://js.monei.com/v3/monei.js"></script>
<script type="module">

// orderForm, setPayable, showError and hideExpressCheckout are your page's own UI;
// orderForm() returns {address, optionId, customer} from the checkout form.
const accountId = '${accountId ?? 'YOUR_ACCOUNT_ID'}';
const currency = '${currency}';
const sessionId = crypto.randomUUID().replaceAll('-', ''); // one per customer
const cart = '${cart}'; // productId:quantity pairs
const amount = ${goods}; // goods only, in cents; shipping is added later

// Card and wallet both end here: the server prices the order and opens the
// payment, and confirming in the browser keeps 3D Secure in a popup.
const pay = async (order, paymentToken) => {
  const response = await fetch('/api/payment', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({sessionId, cart, ...order})
  });
  const data = await response.json();
  if (!response.ok) return showError(data.error);

  const result = await monei.confirmPayment({paymentId: data.id, paymentToken});
  if (result.nextAction?.mustRedirect) return location.assign(result.nextAction.redirectUrl);
  location.assign(\`/receipt?id=\${data.id}\`);
};

${cardBlock(cardUi)}

// The wallet collects the address, so shipping is priced in its callbacks.
// Throwing marks the address as unserviceable.
let walletOption = null;

monei.PaymentRequest({
  accountId, amount, currency, sessionId,
  requestShipping: true,
  requestBilling: true,
  // The options the sheet opens with, before it knows the address.
  shippingOptions: ${JSON.stringify(initialShippingOptions ?? [])},

  onShippingAddressChange: async (address) => {
    walletOption = null;
    const response = await fetch('/api/shipping-rates', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({cart, address, wallet: true})
    });
    if (!response.ok) throw new Error('unserviceable');

    const rates = await response.json();
    walletOption = rates.shippingOptions[0].id;
    return {shippingOptions: rates.shippingOptions, amount: rates.amount};
  },

  onShippingOptionChange: async (option) => {
    walletOption = option.id;
    return {amount: amount + option.amount};
  },

  onSubmit: async ({error, token, shippingDetails, billingDetails, shippingOption, finalAmount}) => {
    if (error || !token) return showError(error ?? 'The wallet returned no payment method.');
    await pay(
      {
        address: shippingDetails?.address,
        billing: billingDetails,
        optionId: shippingOption?.id ?? walletOption,
        walletAmount: finalAmount // checked against the server's total, never charged
      },
      token
    );
  },

  onLoad: (isSupported) => {
    if (!isSupported) hideExpressCheckout();
  }
}).render('#payment-request');

</script>
`;

export const serverSnippet = ({currency}) => `import express from 'express';
import {Monei} from '@monei-js/node-sdk';

const app = express();
const monei = new Monei(process.env.MONEI_API_KEY);
const origin = process.env.PUBLIC_URL; // e.g. https://shop.example

// cartTotal, zoneFor, isValidPostcode and newOrderId are your store's own.
// cartTotal must refuse a cart with any line it does not recognise.
// Rates per zone. No rates means the address cannot be shipped to.
const RATES = ${JSON.stringify(ZONE_TABLE(), null, 2)};

// Lists the options for an address. The total is for display only.
app.post('/api/shipping-rates', express.json(), (req, res) => {
  const {cart, address, wallet} = req.body;
  // A wallet sheet is choosing where to ship, so collect-in-store is left out.
  const options = (RATES[zoneFor(address)] ?? []).filter((r) => !wallet || r.type !== 'PICKUP');
  if (!options.length) return res.status(422).json({error: 'unserviceable'});
  res.json({shippingOptions: options, amount: cartTotal(cart) + options[0].amount});
});

app.post('/api/payment', express.json(), async (req, res) => {
  const {sessionId, cart, address, billing, optionId, walletAmount} = req.body;
  if (!address?.country) return res.status(400).json({error: 'Missing shipping address'});
  if (!isValidPostcode(address)) return res.status(400).json({error: 'Invalid postcode'});

  // Never trust an amount from the client. Price the goods from your catalogue
  // and shipping from the zone of the address the order ships to.
  const rate = (RATES[zoneFor(address)] ?? []).find((r) => r.id === optionId);
  if (!rate) return res.status(400).json({error: 'Unknown shipping option'});

  const amount = cartTotal(cart) + rate.amount;

  // A wallet sheet shows its own total. Refuse a payment it priced differently.
  if (walletAmount !== undefined && walletAmount !== amount) {
    return res.status(422).json({error: 'Amount mismatch'});
  }

  let payment;
  try {
    // No paymentToken: the browser confirms this payment with monei.confirmPayment.
    payment = await monei.payments.create({
      amount,
      currency: '${currency}',
      orderId: newOrderId(),
      sessionId,
      shippingDetails: {address},
      billingDetails: billing?.address ? {name: billing.name, address: billing.address} : {address},
      completeUrl: \`\${origin}/receipt\`,
      cancelUrl: \`\${origin}/cancelled\`,
      callbackUrl: \`\${origin}/api/callback\`
    });
  } catch (error) {
    return res.status(502).json({error: error.message});
  }

  const {id, status, nextAction} = payment;
  res.json({id, status, nextAction});
});

// The signature covers the raw bytes, so this route must not parse the body first.
app.post('/api/callback', express.raw({type: 'application/json'}), (req, res) => {
  let payment;
  try {
    payment = monei.verifySignature(req.body.toString(), req.get('MONEI-Signature'));
  } catch {
    return res.sendStatus(401);
  }
  // Fulfil the order here on SUCCEEDED, once per payment id: callbacks can repeat.
  res.sendStatus(200);
});

app.listen(3000);
`;
