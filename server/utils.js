const faker = require("faker");

module.exports.generateRandomCart = (props = {}) => {
  const {defaultPrice, numItems = 3, qty = {min: 1, max: 5}} = props
  const lineItems = Array(numItems)
    .fill()
    .map(() => {
      const quantity = faker.random.number(qty);
      const price = faker.random.number({
        min: parseInt(defaultPrice ? defaultPrice.min : (process.env.MIN_PRICE || "10")),
        max: parseInt(defaultPrice ? defaultPrice.max : (process.env.MAX_PRICE || "100"))
      });
      return {
        productId: faker.random.uuid(),
        name: faker.commerce.productName(),
        description: faker.commerce.productAdjective(),
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

module.exports.formatPaymentMethod = (payment) => {
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
};
