const config = require("./config");
const express = require("express");
const faker = require("faker");
const router = express.Router();
const url = require("url");
const {Monei, PaymentStatus} = require("@monei-js/node-sdk");
const {generateRandomCart, getPaymentMethod, parseJSON} = require("./utils");

const monei = new Monei(config.monei.apiKey);

router.get("/", (req, res) => {
  const cart = generateRandomCart();
  res.clearCookie('cart');
  res.clearCookie('details');
  res.cookie('cart', JSON.stringify(cart), {maxAge: 900000});
  res.redirect(`/checkout`);
});

router.get("/checkout", (req, res) => {
  const errorMessage = req.query.message;
  const cart = parseJSON(req.cookies.cart);
  const details = parseJSON(req.cookies.details);
  res.render("checkout", {cart, details, errorMessage});
});

router.post("/checkout", async (req, res) => {
  const {name, email, line1, city, state, zip, country, redirect} = req.body;

  const cart = JSON.parse(req.cookies.cart);
  const orderId = faker.random.alpha({count: 8, upcase: true});
  const hostname = config.hostname || req.hostname;

  const address = {line1, city, state, zip, country}

  const payment = await monei.payments.create({
    amount: cart.totalAmount * 100,
    currency: "EUR",
    description: `MONEI Payments Demo - #${orderId}`,
    orderId: orderId,
    customer: {name, email},
    billingDetails: {name, address},
    shippingDetails: {name, address},

    completeUrl: `https://${hostname}/receipt`,
    cancelUrl: `https://${hostname}/checkout`,

    // Specify a url for async callback
    // You will receive a payment result as a POST request to this url
    // This ensures that you get the payment status even when customer closed the browser window or lost internet connection.
    callbackUrl: `https://${hostname}/callback`
  });

  res.cookie('details', JSON.stringify(req.body), {maxAge: 900000});

  if (redirect === "true") {
    return res.redirect(payment.nextAction.redirectUrl);
  }

  res.redirect(`/payment?id=${payment.id}`);
});

router.get("/payment", async (req, res) => {
  const paymentId = req.query.id;
  const cart = parseJSON(req.cookies.cart);
  const details = parseJSON(req.cookies.details);
  const payment = await monei.payments.get(paymentId);
  res.render("payment", {cart, details, payment});
});

router.get("/receipt", async (req, res) => {
  const paymentId = req.query.id;
  const payment = await monei.payments.get(paymentId);
  if (payment.status !== PaymentStatus.SUCCEEDED) {
    return res.redirect(`/checkout?message=${payment.statusMessage}`);
  }
  const cart = parseJSON(req.cookies.cart);
  const details = parseJSON(req.cookies.details);
  const paymentMethod = getPaymentMethod(payment);
  res.render("receipt", {payment, cart, details, paymentMethod});
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
