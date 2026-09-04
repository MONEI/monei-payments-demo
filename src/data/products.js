/**
 * Prices are in cents, the unit the Payments API expects. `art` names an inline
 * SVG in product-art.astro.
 */
export const PRODUCTS = [
  {
    id: 'ethiopia-guji',
    name: 'Ethiopia Guji',
    detail: 'Washed · peach, jasmine, bergamot',
    weight: '250 g whole bean',
    price: 1850,
    art: 'bag'
  },
  {
    id: 'colombia-huila',
    name: 'Colombia Huila',
    detail: 'Washed · red apple, cocoa, caramel',
    weight: '250 g whole bean',
    price: 1550,
    art: 'bag'
  },
  {
    id: 'brazil-cerrado',
    name: 'Brazil Cerrado',
    detail: 'Natural · hazelnut, milk chocolate',
    weight: '1 kg whole bean',
    price: 3900,
    art: 'sack'
  },
  {
    id: 'house-espresso',
    name: 'House Espresso',
    detail: 'Blend · dark chocolate, dried fig',
    weight: '500 g whole bean',
    price: 2250,
    art: 'bag'
  },
  {
    id: 'pour-over-kit',
    name: 'Pour-over Kit',
    detail: 'Glass dripper, carafe, scoop',
    weight: '600 ml',
    price: 4200,
    art: 'dripper'
  },
  {
    id: 'hand-grinder',
    name: 'Hand Grinder',
    detail: 'Stainless burrs, 40 clicks',
    weight: '',
    price: 6800,
    art: 'grinder'
  },
  {
    id: 'stoneware-cup',
    name: 'Stoneware Cup',
    detail: 'Speckled glaze, stackable',
    weight: '180 ml',
    price: 1400,
    art: 'cup'
  },
  {
    // Bizum only accepts amounts under €5 in test mode.
    id: 'filter-papers',
    name: 'Filter Papers',
    detail: 'Unbleached, 100 sheets',
    weight: '',
    price: 390,
    art: 'papers'
  }
];

export const productById = (id) => PRODUCTS.find((p) => p.id === id);
