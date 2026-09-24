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

const {token} = await group.submit();`
    : `const card = monei.CardInput({
  accountId, amount, currency, sessionId,
  onChange: ({isTouched, error}) => showError(isTouched ? error : null)
});

card.render('#card-input');

const {token} = await card.submit();`;

export const clientSnippet = ({
  accountId,
  currency,
  goods,
  cart,
  cardUi,
  initialShippingOptions
}) => `<script src="https://js.monei.com/v3/monei.js"></script>
<script type="module">

// setPayable, showError and hideExpressCheckout are your page's own UI.
const accountId = '${accountId ?? 'YOUR_ACCOUNT_ID'}';
const currency = '${currency}';
const sessionId = crypto.randomUUID().replaceAll('-', ''); // one per customer
const cart = '${cart}'; // productId:quantity pairs
const amount = ${goods}; // goods only, in cents; shipping is added later

${cardBlock(cardUi)}

// The wallet collects the address, so shipping is priced in the callback.
// Throwing marks the address as unserviceable.
monei.PaymentRequest({
  accountId, amount, currency, sessionId,
  requestShipping: true,
  requestBilling: true,
  // Never empty: the sheet reads the list once, when it is built.
  shippingOptions: ${JSON.stringify(initialShippingOptions ?? [])},

  onShippingAddressChange: async (address) => {
    const response = await fetch('/api/shipping-rates', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({cart, address})
    });
    if (!response.ok) throw new Error('unserviceable');

    const rates = await response.json();
    return {shippingOptions: rates.shippingOptions, amount: rates.amount};
  },

  onShippingOptionChange: async (option) => ({amount: amount + option.amount}),

  onSubmit: async ({error, token, shippingDetails, billingDetails, shippingOption, finalAmount}) => {
    if (error || !token) return showError(error ?? 'The wallet returned no payment method.');

    // The server prices the order again and opens the payment; confirming here
    // keeps a 3D Secure challenge in a popup instead of navigating away.
    const response = await fetch('/api/payment', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        sessionId,
        cart,
        address: shippingDetails?.address,
        billing: billingDetails,
        optionId: shippingOption?.id,
        walletAmount: finalAmount // checked against the server's total, never charged
      })
    });
    if (!response.ok) return showError((await response.json()).error);
    const {id} = await response.json();
    const result = await monei.confirmPayment({paymentId: id, paymentToken: token});
    if (result.nextAction?.mustRedirect) location.assign(result.nextAction.redirectUrl);
  },

  onLoad: (isSupported) => {
    if (!isSupported) hideExpressCheckout();
  }
}).render('#payment-request');

</script>
`;

export const serverSnippet = ({currency}) => `import express from 'express';
import {Monei} from '@monei-js/node-sdk';

const monei = new Monei(process.env.MONEI_API_KEY);
const origin = process.env.PUBLIC_URL; // e.g. https://shop.example

// cartTotal, zoneFor and newOrderId are your store's own.
// Zones the shop serves. No rates means the address cannot be shipped to.
const ZONES = ${JSON.stringify(ZONE_TABLE(), null, 2)};

app.post('/api/payment', express.json(), async (req, res) => {
  const {sessionId, cart, address, billing, optionId, walletAmount} = req.body;
  if (!address?.country) return res.status(400).json({error: 'Missing shipping address'});

  // Never trust an amount from the client. Price the goods from your catalogue
  // and shipping from the zone of the address the order ships to.
  const rate = ZONES[zoneFor(address)].find((r) => r.id === optionId);
  if (!rate) return res.status(400).json({error: 'Unknown shipping option'});

  const amount = cartTotal(cart) + rate.amount;

  // A wallet sheet shows its own total. Refuse a payment it priced differently.
  if (walletAmount !== undefined && walletAmount !== amount) {
    return res.status(422).json({error: 'Amount mismatch'});
  }

  // No paymentToken: the browser confirms this payment with monei.confirmPayment.
  const payment = await monei.payments.create({
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
`;
