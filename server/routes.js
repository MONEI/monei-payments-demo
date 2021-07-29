const {Monei, PaymentStatus} = require("@monei-js/node-sdk");
const config = require("./config");
const express = require("express");
const faker = require("faker");
const {products} = require("./inventory");
const router = express.Router();
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

const orders = new Map();

router.get("/", (req, res) => {
  const orderId = faker.random.alpha({count: 8, upcase: true});
  orders.set(orderId, {cart: generateRandomCart(), orderId, details: {}});
  res.redirect(`/orders/${orderId}`);
});

router.get("/orders/:orderId", (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.redirect("/");
  const errorMessage = order.payment && order.payment.statusMessage;
  res.render("checkout", {...order, errorMessage});
});

router.post("/orders/:orderId", async (req, res) => {
  const orderId = req.params.orderId;
  const order = orders.get(req.params.orderId);
  if (!order) return res.redirect("/");

  const {name, email, line1, city, state, zip, country, redirect} = req.body;

  const hostname = config.hostname || req.hostname;

  const payment = await monei.payments.create({
    amount: order.cart.totalAmount * 100,
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

  orders.set(orderId, {...order, payment, details: req.body});

  if (redirect === "true") {
    return res.redirect(payment.nextAction.redirectUrl);
  }

  res.redirect(`/orders/${orderId}/payment`);
});

router.get("/orders/:orderId/payment", (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.redirect("/");
  if (order.payment && order.payment.status !== PaymentStatus.PENDING) {
    return res.redirect("/");
  }
  res.render("payment", order);
});

router.get("/orders/:orderId/receipt", async (req, res) => {
  const orderId = req.params.orderId;
  const order = orders.get(orderId);
  if (!order.payment) return res.redirect("/");
  const payment = await monei.payments.get(order.payment.id);
  orders.set(orderId, {...order, payment});
  if (payment.status !== PaymentStatus.SUCCEEDED) {
    return res.redirect(`/orders/${orderId}`);
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
