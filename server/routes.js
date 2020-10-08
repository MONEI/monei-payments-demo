const {Monei} = require('@monei-js/node-sdk');
const config = require('./config');
const express = require('express');
const shortid = require('shortid');
const faker = require('faker');
const {products, productsById} = require('./inventory');
const router = express.Router();

const monei = new Monei(config.monei.apiKey);

// You need to provide a unique order id for each payment.
// This order ID should be a reference in your system.
// If payment is not successful you can create a new one with the same order id.
let orderId = shortid();

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
    orderId,
    lineItems,
    accountId: config.monei.accountId,
    totalAmount: calculatePaymentAmount(lineItems)
  };
  res.json(cart);
});

router.post('/payments', async (req, res) => {
  let {items, customer, shippingDetails, billingDetails} = req.body;
  try {
    const amount = calculatePaymentAmount(items);
    const payment = await monei.payments.create({
      amount,
      currency: 'EUR',
      description: `MONEI Payments Demo - #${orderId}`,
      orderId,
      customer,
      billingDetails,
      shippingDetails,
      completeUrl: `https://${req.hostname}`,
      cancelUrl: `https://${req.hostname}`,
      callbackUrl: `https://${req.hostname}/callback`
    });

    // Update order ID for the next payment
    orderId = shortid();

    return res.status(200).json({
      paymentId: payment.id
    });
  } catch (error) {
    return res.status(500).json({error: error.message});
  }
});

router.post('/callback', async (req, res) => {
  console.log(req.body);
  return res.status(200);
});

module.exports = router;
