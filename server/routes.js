const {Monei} = require('@monei-js/node-sdk');
const config = require('./config');
const express = require('express');
const faker = require('faker');
const {products, productsById} = require('./inventory');
const router = express.Router();

const monei = new Monei(config.monei.apiKey);

const calculatePaymentAmount = (items) => {
  return items.reduce((total, item) => {
    const product = productsById[item.productId];
    if (!product) {
      throw new Error(`Product with id: ${item.id} is not found in the inventory`);
    }
    total += product.price * item.quantity;
    return total;
  }, 0);
};

// Render the main app HTML.
router.get('/', (req, res) => {
  res.render('index.html');
});

router.get('/products', (req, res) => {
  res.json(products);
});

router.get('/cart', (req, res) => {
  req.session.regenerate(() => {
    const sessionId = req.session.id;
    const lineItems = products.map(({id, description, image, name, price}) => ({
      productId: id,
      description,
      image,
      name,
      price,
      quantity: faker.random.number({
        min: 1,
        max: 5
      })
    }));
    const cart = {
      lineItems,
      sessionId,
      accountId: config.monei.accountId,
      totalAmount: calculatePaymentAmount(lineItems)
    };

    res.json(cart);
  });
});

router.post('/payments', async (req, res) => {
  let {items, customer, shippingDetails, billingDetails} = req.body;
  try {
    const amount = calculatePaymentAmount(items);
    const sessionId = req.session.id;
    const orderId = faker.random.number({min: 100000, max: 999999}).toString();
    const payment = await monei.payments.create({
      amount,
      currency: 'EUR',
      description: `MONEI Payments Demo - #${orderId}`,
      sessionId,
      orderId,
      customer,
      billingDetails,
      shippingDetails,
      completeUrl: `https://${req.hostname}`,
      cancelUrl: `https://${req.hostname}`,
      callbackUrl: `https://${req.hostname}/callback`
    });
    res.status(200).json(payment);
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

router.post('/callback', async (req, res) => {
  console.log(req.header('MONEI-Signature'));
  console.log(`🔔  Callback received!`);
  console.log('Callback payload', req.body);
  res.sendStatus(200);
});

module.exports = router;
