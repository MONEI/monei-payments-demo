const items = [
  {
    id: '001',
    title: 'Product 1',
    description: 'product 1 description',
    price: 999
  },
  {
    id: '002',
    title: 'Product 2',
    description: 'product 2 description',
    price: 199
  },
  {
    id: '003',
    title: 'Product 3',
    description: 'product 3 description',
    price: 1299
  },
  {
    id: '004',
    title: 'Product 4',
    description: 'product 4 description',
    price: 14599
  },
  {
    id: '005',
    title: 'Product 5',
    description: 'product 5 description',
    price: 2599
  }
];

const itemsById = items.reduce((result, item) => {
  result[item.id] = item;
  return result;
}, {});

module.exports = {
  items,
  itemsById
};
