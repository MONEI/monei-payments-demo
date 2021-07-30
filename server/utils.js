const {products} = require("./inventory");
const {PaymentPaymentMethodMethodEnum, PaymentPaymentMethodCardBrandEnum} = require('@monei-js/node-sdk')
const faker = require("faker");
const unpipe = require("unpipe");

module.exports.generateRandomCart = () => {
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

module.exports.formatCurrency = (amount) => {
  const num = Number(amount);
  return num.toLocaleString("en", {style: "currency", currency: "EUR"});
};

module.exports.formatAddress = (address) => {
  if (!address) return null;
  const {line1, line2, city, country, state, zip} = address;
  const lines = [];
  if (line1) lines.push(line1);
  if (line2) lines.push(line2);
  if (city || state || zip || country) {
    const line = [];
    if (city) line.push(city);
    if (state) line.push(state);
    if (zip) line.push(zip);
    if (country) line.push(country);
    lines.push(line.join(", "));
  }
  if (lines.length === 0) return null;
  return lines.join(" ");
};

module.exports.getPaymentMethod = (payment) => {
  const {card, bizum, paypal, method} = payment.paymentMethod;

  // Bizum
  if (bizum) {
      return `Bizum - ${bizum.phoneNumber}`;
  }

  // Paypal
  if (paypal) {
      return `PayPal - ${paypal.orderId}`;
  }
  // Card
  if (card) {
    return `${card.brand} - ${card.last4}`;
  }

  return method;
};

module.exports.parseJSON = (string) => {
  try {
    return JSON.parse(string);
  } catch (error) {
    return undefined;
  }
}
