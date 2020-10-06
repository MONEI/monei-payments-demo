const {Monei} = require('@monei-js/node-sdk');
const config = require('./config');
const express = require('express');
const shortid = require('shortid');
const {items, itemsById} = require('./inventory');
const router = express.Router();

const monei = new Monei(config.monei.apiKey);

const calculatePaymentAmount = (items) => {
  return items.reduce((total, item) => {
    const product = itemsById[item.id];
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
  res.json(items);
});

router.post('/payments', async (req, res) => {
  let {items, customer, shippingDetails, billingDetails} = req.body;
  try {
    const amount = calculatePaymentAmount(items);

    // You need to provide a unique order id for each payment.
    // This order ID should be a reference in your system.
    // If payment is not successful you can create a new one with the same order id.
    // For simplicity in this example we create a new unique orderId for each payment attempt.
    const orderId = shortid();

    const payment = await monei.payments.create({
      amount,
      currency: 'EUR',
      orderId,
      customer,
      billingDetails,
      shippingDetails
    });
    return res.status(200).json({
      paymentId: payment.id,
      amount: payment.amount
    });
  } catch (error) {
    return res.status(500).json({error: error.message});
  }
});

module.exports = router;
