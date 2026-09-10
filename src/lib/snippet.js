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
  cardUi
}) => `<script src="https://js.monei.com/v3/monei.js"></script>
<script type="module">

const accountId = '${accountId ?? 'YOUR_ACCOUNT_ID'}';
const currency = '${currency}';
const sessionId = orderReference;
let amount = ${goods}; // goods only, in cents; shipping is added later

${cardBlock(cardUi)}

// The wallet collects the address, so shipping is priced in the callback.
// Throwing is the only way to signal an unserviceable address.
monei.PaymentRequest({
  accountId, amount, currency, sessionId,
  requestShipping: true,
  requestBilling: true,
  shippingOptions: initialOptions, // never empty: read once, at construction

  onShippingAddressChange: async (address) => {
    const response = await fetch('/api/shipping-rates', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({address})
    });
    if (!response.ok) throw new Error('unserviceable');

    const rates = await response.json();
    return {shippingOptions: rates.shippingOptions, amount: rates.amount};
  },

  onShippingOptionChange: async (option) => ({amount: goods + option.amount}),

  onSubmit: async ({token, shippingDetails}) => {
    const payment = await createPayment(token, shippingDetails);
    const next = payment.nextAction;
    if (next?.mustRedirect) location.assign(next.redirectUrl);
  },

  onLoad: (isSupported) => {
    if (!isSupported) hideExpressCheckout();
  }
}).render('#payment-request');

</script>
`;

export const serverSnippet = ({currency}) => `import {Monei} from '@monei-js/node-sdk';

const monei = new Monei(process.env.MONEI_API_KEY);

// Zones the shop serves. No rates means the address cannot be shipped to.
const ZONES = ${JSON.stringify(ZONE_TABLE(), null, 2).replace(/\n/g, '\n')};

app.post('/api/payment', async (req, res) => {
  const {paymentToken, quote, sig, optionId} = req.body;

  // Never trust an amount from the client. The signed quote carries the
  // cart and zone the server decided; the amount is recomputed from those.
  const {seed, cart, zone} = verifyQuote(quote, sig);
  const rate = ZONES[zone].find((r) => r.id === optionId);
  if (!rate) return res.status(400).json({error: 'Unknown shipping option'});

  const amount = cartTotal(cart) + rate.amount;

  // paymentToken confirms in the same call. completeUrl is required even
  // outside the redirect flow: a 3D Secure challenge returns there.
  const payment = await monei.payments.create({
    amount,
    currency: '${currency}',
    orderId,
    sessionId: seed,
    paymentToken,
    completeUrl: \`\${origin}/receipt\`,
    cancelUrl: \`\${origin}/cancelled\`,
    callbackUrl: \`\${origin}/api/callback\`
  });

  const {id, status, nextAction} = payment;
  res.json({id, status, nextAction});
});

app.post('/api/callback', async (req, res) => {
  // The raw body is required — a parsed one fails the signature check.
  const sig = req.get('monei-signature');
  const event = monei.verifySignature(req.rawBody, sig);
  res.sendStatus(200);
});
`;
