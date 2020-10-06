class Store {
  constructor() {
    this.lineItems = [];
    this.products = [];
    this.productsById = [];
    this.displayPaymentSummary().then(() => console.log('Store is loaded'));
  }

  getPaymentTotal() {
    return this.lineItems.reduce(
      (total, {productId, quantity}) => total + quantity * this.productsById[productId].price,
      0
    );
  }

  formatPrice(amount, currency = 'EUR') {
    let price = amount / 100;
    let numberFormat = new Intl.NumberFormat(['en-US'], {
      style: 'currency',
      currency: currency,
      currencyDisplay: 'symbol'
    });
    return numberFormat.format(price);
  }

  randomQuantity(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async loadProducts() {
    const res = await fetch('/products');
    this.products = await res.json();
    this.productsById = this.products.reduce((result, product) => {
      result[product.id] = product;
      return result;
    }, {});
  }

  async displayPaymentSummary() {
    await this.loadProducts();
    const orderItems = document.getElementById('order-items');
    const orderTotal = document.getElementById('order-total');
    this.products.map((product) => {
      const quantity = this.randomQuantity(1, 5);
      let lineItemPrice = this.formatPrice(product.price * quantity);
      let lineItem = document.createElement('li');
      lineItem.classList.add(
        'list-group-item',
        'd-flex',
        'justify-content-between',
        'lh-condensed'
      );
      lineItem.innerHTML = `
      <img src="${product.image}" width="75" height="75" alt="${product.name}" class="rounded mr-3">
      <div class="flex-fill mr-3">
        <h6 class="my-0">${product.name}</h6>
        <small class="text-muted">${product.description}</small>
      </div>
      <div class="text-right">
        <div class="text-muted text-nowrap">${quantity} x ${this.formatPrice(product.price)}</div>
        <div>${lineItemPrice}</div>
      </div>
      `;
      orderItems.appendChild(lineItem);
      this.lineItems.push({
        productId: product.id,
        quantity
      });
      const total = this.formatPrice(this.getPaymentTotal());
      orderTotal.querySelector('[data-subtotal]').innerText = total;
      orderTotal.querySelector('[data-total]').innerText = total;
    });
  }
}

window.store = new Store();
