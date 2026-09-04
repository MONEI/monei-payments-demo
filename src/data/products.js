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
    id: 'stoneware-cup',
    name: 'Stoneware Cup',
    detail: 'Speckled glaze, stackable',
    weight: '180 ml',
    price: 1400,
    art: 'cup'
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
