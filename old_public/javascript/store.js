class Store {
  constructor() {
    this.form = document.getElementById('checkout_form');
    this.button = this.form.querySelector('button[type="submit"]');
    this.result = document.getElementById('result_message');
    this.checkout = document.getElementById('checkout');
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.button.disabled = true;
      this.button.classList.add('btn-loading');
    } else {
      this.button.disabled = false;
      this.button.classList.remove('btn-loading');
    }
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

  // Create a payment on the server
  async createPayment({cart, customer, billingDetails, shippingDetails}) {
    try {
      const response = await fetch('/payments', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          items: cart.lineItems,
          customer,
          billingDetails,
          shippingDetails
        })
      });
      const data = await response.json();
      if (data.error) {
        return {error: data.error};
      } else {
        return data;
      }
    } catch (err) {
      return {error: err.message};
    }
  }

  // Load cart information
  async loadCart() {
    const res = await fetch('/cart');
    return await res.json();
  }

  // Display cart summary using the date received form the server
  displayCartSummary(cart) {
    const orderItems = document.getElementById('order-items');
    const orderTotal = document.getElementById('order-total');
    cart.lineItems.map((li) => {
      let lineItemPrice = this.formatPrice(li.price * li.quantity);
      let lineItem = document.createElement('li');
      lineItem.classList.add(
        'list-group-item',
        'd-flex',
        'justify-content-between',
        'lh-condensed'
      );
      lineItem.innerHTML = `
      <img src="${li.image}" width="75" height="75" alt="${li.name}" class="rounded mr-3">
      <div class="flex-fill mr-3">
        <h6 class="my-0">${li.name}</h6>
        <small class="text-muted">${li.description}</small>
      </div>
      <div class="text-right">
        <div class="text-muted text-nowrap">${li.quantity} x ${this.formatPrice(li.price)}</div>
        <div>${lineItemPrice}</div>
      </div>
      `;
      orderItems.appendChild(lineItem);
      const total = this.formatPrice(cart.totalAmount);
      orderTotal.querySelector('[data-subtotal]').innerText = total;
      orderTotal.querySelector('[data-total]').innerText = total;
      this.button.querySelector('[data-total]').innerText = total;
    });
  }

  // Display payment result
  displayResult(status, message) {
    this.checkout.classList.add('d-none');
    this.result.classList.remove('d-none');
    if (status === 'SUCCEEDED') {
      this.result.innerHTML = `
      <div class="card-body">
        <h2 class="card-title text-success">Thanks for your order!</h2>
        Yay! You successfully made a payment with MONEI.
      </div>
      `;
    } else {
      this.result.innerHTML = `
      <div class="card-body">
        <h2 class="card-title text-danger">Oops, payment failed.</h2>
        ${message}
      </div>
      `;
    }
  }

  // Get values from the form fields
  getFormValues() {
    const customer = {
      name: store.form.querySelector('input[name="name"]').value,
      email: store.form.querySelector('input[name="email"]').value
    };
    const billingDetails = {
      name: customer.name,
      email: customer.email,
      address: {
        country: store.form.querySelector('select[name="country"]').value,
        city: store.form.querySelector('input[name="city"]').value,
        line1: store.form.querySelector('input[name="line1"]').value,
        zip: store.form.querySelector('input[name="zip"]').value,
        state: store.form.querySelector('input[name="state"]').value
      }
    };

    return {customer, billingDetails};
  }
}

window.store = new Store();
