const config = require("./config");
const express = require("express");
const faker = require("faker");
const router = express.Router();
const url = require('url');
const {products} = require("./inventory");
const {Monei, PaymentStatus} = require("@monei-js/node-sdk");

const monei = new Monei(config.monei.apiKey);

const generateRandomCart = () => {
  const lineItems = products.map(({id, description, name, price}) => {
    const quantity = faker.random.number({min: 1, max: 3});
    return {
      productId: id,
      description,
      name,
      price,
      quantity,
      totalPrice: quantity * price
    };
  });
  return {
    lineItems,
    totalAmount: lineItems.reduce((total, item) => {
      total += item.totalPrice;
      return total;
    }, 0)
  };
};

router.get("/", (req, res) => {
  req.session.regenerate(function() {
    const orderId = faker.random.alpha({count: 8, upcase: true});
    req.session.cart = generateRandomCart();
    res.redirect(`/orders/${orderId}`);
  })
});

router.get("/orders/:orderId", (req, res) => {
  const orderId = req.params.orderId;
  const errorMessage = req.query.message;
  const cart = req.session.cart;
  const details = req.session.details || {};
  res.render("checkout", {cart, errorMessage, details, orderId});
});

router.post("/orders/:orderId", async (req, res) => {
  const orderId = req.params.orderId;
  const {name, email, line1, city, state, zip, country, redirect} = req.body;
  const cart = req.session.cart;
  const hostname = config.hostname || req.hostname;

  const payment = await monei.payments.create({
    amount: cart.totalAmount * 100,
    currency: "EUR",
    description: `MONEI Payments Demo - #${orderId}`,
    orderId: orderId,
    customer: {name, email},
    billingDetails: {line1, city, state, zip, country},
    shippingDetails: {line1, city, state, zip, country},

    completeUrl: `https://${hostname}/orders/${orderId}/receipt`,
    cancelUrl: `https://${hostname}/orders/${orderId}`,

    // Specify a url for async callback
    // You will receive a payment result as a POST request to this url
    // This ensures that you get the payment status even when customer closed the browser window or lost internet connection.
    callbackUrl: `https://${hostname}/callback`
  });

  req.session.details = req.body;

  if (redirect === "true") {
    return res.redirect(payment.nextAction.redirectUrl);
  }

  res.redirect(url.format({
    pathname: `/orders/${orderId}/payment`,
    query: {id: payment.id}
  }));
});

router.get("/orders/:orderId/payment", async (req, res) => {
  const orderId = req.params.orderId;
  const paymentId = req.query.id;
  const cart = req.session.cart;
  const details = req.session.details;
  const payment = await monei.payments.get(paymentId);
  res.render("payment", {cart, details, orderId, payment});
});

router.get("/orders/:orderId/receipt", async (req, res) => {
  const orderId = req.params.orderId;
  const paymentId = req.query.id;
  const payment = await monei.payments.get(paymentId);
  if (payment.status !== PaymentStatus.SUCCEEDED) {
    return res.redirect(url.format({
      pathname: `/orders/${orderId}`,
      query: {message: payment.statusMessage}
    }));
  }
  res.render("receipt", {payment});
});

// Receive a payment result
router.post("/callback", async (req, res) => {
  console.log(`🔔  Callback received!`);
  try {
    // Verify a callback signature to confirm that received request is sent from MONEI.
    const body = monei.verifySignature(req.rawBody, req.header("MONEI-Signature"));
    console.log(body);
  } catch (error) {
    console.log(`⚠️  Callback signature verification failed.`);
  }
  res.sendStatus(200);
});

module.exports = router;
