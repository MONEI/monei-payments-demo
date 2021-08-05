const config = require("./config");
const express = require("express");
const faker = require("faker");
const router = express.Router();
const url = require("url");
const {Monei, PaymentStatus} = require("@monei-js/node-sdk");
const {generateRandomCart, formatPaymentMethod, parseJSON} = require("./utils");

const monei = new Monei(config.monei.apiKey);

/**
 * Creating a payment with MONEI consists of 5 simple steps
 * 1. Create a payment (server-side)
 * 2. Pass payment ID to initialize MONEI UI Components (client-side)
 * 3. Confirm payment passing payment ID and payment token (client-side)
 * 4. Check payment status (server-side)
 * 5. Receive a webhook with the payment status (server-side)
 */

// Generates a random cart and redirects a customer to the checkout page
router.get("/", (req, res) => {
  const cart = generateRandomCart();

  // For the purpose of this example we are using cookies to store cart information
  // in the real app you will use some sort of database for that.
  res.clearCookie("cart");
  res.clearCookie("details");
  res.cookie("cart", JSON.stringify(cart), {maxAge: 900000});

  res.redirect(`/checkout`);
});

// Shows initial checkout page, also shows error message if present
router.get("/checkout", (req, res) => {
  const errorMessage = req.query.message;
  const cart = parseJSON(req.cookies.cart);
  const details = parseJSON(req.cookies.details);

  res.render("checkout", {cart, details, errorMessage});
});

// Receives payload form the checkout form and creates a new payment
router.post("/checkout", async (req, res) => {
  const {name, email, line1, city, state, zip, country, redirect} = req.body;

  const cart = parseJSON(req.cookies.cart);

  // If there is no cart object in cookies, redirect the customer to the initial page to generate it.
  if (!cart) res.redirect(`/`);

  // Order ID should be alphanumeric and cannot contain special characters
  const orderId = faker.random.alpha({count: 8, upcase: true});

  // You can specify hostname in env variables in case you have custom domain
  const hostname = config.hostname || req.hostname;

  const address = {line1, city, state, zip, country};

  const payment = await monei.payments.create({
    // Payment amount in cents
    amount: cart.totalAmount * 100,

    currency: "EUR",

    // Provide a payment description
    description: `MONEI Payments Demo - #${orderId}`,

    orderId,
    customer: {name, email},

    // In this example we assume billing and shipping details are always the same
    billingDetails: {name, address},
    shippingDetails: {name, address},

    // A customer will be redirected to this url when the payment is complete (successful or failed).
    // Only applicable to the redirect flow.
    // You can separately specify failUrl if you want your customers to be redirected to a different page if payment fails.
    completeUrl: `https://${hostname}/receipt`,

    // A customer is redirected to this url if he cancels the payment (clicks "Go back")
    // In this case we just redirect a customer back to the checkout page
    cancelUrl: `https://${hostname}/checkout`,

    // A url for async callback
    // You will receive a payment result as a POST request to this url
    // This ensures that you get the payment status even when customer closed the browser window or lost internet connection.
    callbackUrl: `https://${hostname}/callback`
  });

  // We store checkout detail in cookies (in real app you'll use some database for that)
  res.cookie("details", JSON.stringify(req.body), {maxAge: 900000});

  // If this is a redirect flow we can redirect a customer to the Hosted Payment Page url
  // If you specify ony one payment method in the "allowedPaymentMethods" parameter
  // a customer will be redirected directly to this payment method flow.
  // For example, to implement PayPal payments with redirect specify "allowedPaymentMethods: ['paypal']"
  // And then redirect your customer to the "nextAction.redirectUrl"
  if (redirect === "true") {
    return res.redirect(payment.nextAction.redirectUrl);
  }

  // If this is not a redirect flow we redirect a customer to the internal payment page
  // passing payment ID
  res.redirect(`/payment?id=${payment.id}`);
});

// Shows the payment page
router.get("/payment", async (req, res) => {
  const paymentId = req.query.id;

  // For the purpose of this example we are using cookies to store cart information
  // in the real app you will use some sort of database for that.
  const cart = parseJSON(req.cookies.cart);
  const details = parseJSON(req.cookies.details);
  const payment = await monei.payments.get(paymentId);

  // If there is no cart object in cookies, redirect the customer to the initial page to generate it.
  if (!cart) res.redirect(`/`);

  res.render("payment", {cart, details, payment});
});

// Checks the status of the payment after it was confirmed client-side.
router.get("/receipt", async (req, res) => {
  const paymentId = req.query.id;

  // Get payment status
  const payment = await monei.payments.get(paymentId);

  // If payment was not successful we redirect a customer back to the checkout page
  // passing the payment error in query string parameters so he can retry the payment again
  if (payment.status !== PaymentStatus.SUCCEEDED) {
    const message = payment.statusMessage || "Payment canceled. Please try again.";
    return res.redirect(url.format({pathname: "/checkout", query: {message}}));
  }

  // For the purpose of this example we are using cookies to store cart information
  // in the real app you will use some sort of database for that.
  const cart = parseJSON(req.cookies.cart);
  const details = parseJSON(req.cookies.details);
  const paymentMethod = formatPaymentMethod(payment);

  // If there is no cart object in cookies, redirect the customer to the initial page to generate it.
  if (!cart) res.redirect(`/`);

  // Render a receipt page
  res.render("receipt", {payment, cart, details, paymentMethod});
});

// Receives a payment result
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
