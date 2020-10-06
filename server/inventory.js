const items = [
  {
    id: '001',
    title: 'Product 1',
    price: 999,
    image: 'https://picsum.photos/200'
  },
  {
    id: '002',
    title: 'Product 2',
    price: 199,
    image: 'https://picsum.photos/200'
  },
  {
    id: '003',
    title: 'Product 3',
    price: 1299,
    image: 'https://picsum.photos/200'
  },
  {
    id: '004',
    title: 'Product 4',
    price: 14599,
    image: 'https://picsum.photos/200'
  },
  {
    id: '005',
    title: 'Product 5',
    price: 2599,
    image: 'https://picsum.photos/200'
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
