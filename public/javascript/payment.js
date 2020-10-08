(async () => {
  const formatPrice = (amount, currency = 'EUR') => {
    let price = amount / 100;
    let numberFormat = new Intl.NumberFormat(['en-US'], {
      style: 'currency',
      currency: currency,
      currencyDisplay: 'symbol'
    });
    return numberFormat.format(price);
  };

  const createPayment = async (cart) => {
    try {
      const response = await fetch('/payments', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          items: cart.lineItems
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
  };

  const loadCart = async () => {
    const res = await fetch('/cart');
    return await res.json();
  };

  const renderCardInput = (cart) => {
    const container = document.getElementById('card_input');
    const errorText = document.getElementById('card_input_error');
    const cardInput = monei.CardInput({
      accountId: cart.accountId,
      orderId: cart.orderId,
      onFocus: () => {
        container.classList.add('is-focused');
      },
      onBlur: () => {
        container.classList.remove('is-focused');
      },
      onChange: (props) => {
        if (props.isTouched && props.error) {
          container.classList.add('is-invalid');
          errorText.innerText = props.error;
        } else {
          container.classList.remove('is-invalid');
          errorText.innerText = '';
        }
      }
    });
    cardInput.render(container);
    return cardInput;
  };

  const displayCartSummary = (cart) => {
    const orderItems = document.getElementById('order-items');
    const orderTotal = document.getElementById('order-total');
    cart.lineItems.map((li) => {
      let lineItemPrice = formatPrice(li.price * li.quantity);
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
        <div class="text-muted text-nowrap">${li.quantity} x ${formatPrice(li.price)}</div>
        <div>${lineItemPrice}</div>
      </div>
      `;
      orderItems.appendChild(lineItem);
      const total = formatPrice(cart.totalAmount);
      orderTotal.querySelector('[data-subtotal]').innerText = total;
      orderTotal.querySelector('[data-total]').innerText = total;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.classList.add('was-validated');
    const customer = {
      name: e.target.querySelector('input[name="name"]').value
    };

    console.log(customer);
  };

  const form = document.getElementById('checkout_form');
  form.addEventListener('submit', handleSubmit);

  const cart = await loadCart();
  displayCartSummary(cart);
  const cardInput = renderCardInput(cart);
})();
