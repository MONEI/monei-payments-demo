const faker = require("faker");

// Generate a list of random products
const products = Array(3)
  .fill()
  .map(() => ({
    id: faker.random.uuid(),
    name: faker.commerce.productName(),
    description: faker.commerce.productAdjective(),
    price: faker.random.number({
      min: parseInt(process.env.MIN_PRICE || "10"),
      max: parseInt(process.env.MAX_PRICE || "25")
    }),
    image: faker.image.imageUrl(75, 75, null, true, true)
  }));

const productsById = products.reduce((result, item) => {
  result[item.id] = item;
  return result;
}, {});

module.exports = {
  products,
  productsById
};
