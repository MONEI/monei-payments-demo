const {Monei} = require('@monei-js/node-sdk');
const config = require('./config');
const express = require('express');
const faker = require('faker');
const {products, productsById} = require('./inventory');
const router = express.Router();

const monei = new Monei(config.monei.apiKey);

/**
 * MONEI integration to accept credit card payments in 4 simple steps.
 *
 * 1. Generate a payment token on the frontend using MONEI Card Input Component
 * 2. POST endpoint to create a Payment.
 * 3. The Payment is confirmed automatically with monei.js on the client-side.
 * 4. POST endpoint to be set as a callback to securely receive payment result
 */

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

// Render the app HTML with card input flow.
router.get('/', (req, res) => {
  res.render('index.html');
});

// Render the app HTML with payment modal flow.
router.get('/payment-modal', (req, res) => {
  res.render('payment-modal.html');
});

// Return a list of all products
router.get('/products', (req, res) => {
  res.json(products);
});

// Return a current shopping cart details
// For simplicity of this demo we generate a random cart items
router.get('/cart', (req, res) => {
  const lineItems = products.map(({id, description, image, name, price}) => ({
    productId: id,
    description,
    image,
    name,
    price,
    quantity: faker.random.number({
      min: 1,
      max: 3
    })
  }));
  const cart = {
    lineItems,
    accountId: config.monei.accountId,
    totalAmount: calculatePaymentAmount(lineItems)
  };

  res.json(cart);
});

// Create a payment
// We recommend that you create a Payment for each payment attempt.
router.post('/payments', async (req, res) => {
  let {items, customer, shippingDetails, billingDetails} = req.body;
  try {
    const amount = calculatePaymentAmount(items);

    // Provide a unique order ID.
    // For simplicity of this example we generate a new order ID on each payment attempt,
    // But in production you might use the same order ID if the previous payment attempt had failed.
    const orderId = faker.random.number({min: 100000, max: 999999}).toString();

    const payment = await monei.payments.create({
      amount,
      currency: 'EUR',
      description: `MONEI Payments Demo - #${orderId}`,
      orderId,
      customer,
      billingDetails,
      shippingDetails,

      completeUrl: `https://${req.hostname}/payment-modal`,
      cancelUrl: `https://${req.hostname}/payment-modal`,

      // Specify a url for async callback
      // You will receive a payment result as a POST request to this url
      // This ensures that you get the payment status even when customer closed the browser window or lost internet connection.
      callbackUrl: `https://${req.hostname}/callback`
    });

    res.status(200).json(payment);
  } catch (error) {
    res.status(500).json({error: error.message});
  }
});

// Receive a payment result
router.post('/callback', async (req, res) => {
  console.log(`🔔  Callback received!`);
  try {
    // Verify a callback signature to confirm that received request is sent from MONEI.
    const body = monei.verifySignature(req.rawBody, req.header('MONEI-Signature'));
    console.log(body);
  } catch (error) {
    console.log(`⚠️  Callback signature verification failed.`);
  }
  res.sendStatus(200);
});

module.exports = router;
