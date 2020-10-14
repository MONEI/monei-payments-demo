(async () => {
  const form = document.getElementById('checkout_form');
  const button = form.querySelector('button[type="submit"]');

  const setLoading = (isLoading) => {
    if (isLoading) {
      button.disabled = true;
      button.classList.add('btn-loading');
    } else {
      button.disabled = false;
      button.classList.remove('btn-loading');
    }
  };

  const formatPrice = (amount, currency = 'EUR') => {
    let price = amount / 100;
    let numberFormat = new Intl.NumberFormat(['en-US'], {
      style: 'currency',
      currency: currency,
      currencyDisplay: 'symbol'
    });
    return numberFormat.format(price);
  };

  // Create a payment on the server
  const createPayment = async ({cart, customer, billingDetails, shippingDetails}) => {
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
  };

  // Load cart information
  const loadCart = async () => {
    const res = await fetch('/cart');
    return await res.json();
  };

  // Render MONEI Card Input Component
  const renderCardInput = (cart) => {
    const container = document.getElementById('card_input');
    const errorText = document.getElementById('card_input_error');
    const cardInput = monei.CardInput({
      // Use MONEI Account ID to initialize the component
      accountId: cart.accountId,
      onLoad: () => {
        // Enable submit button when component is loaded
        document.querySelector('button[type="submit"]').disabled = false;
      },
      onFocus: () => {
        container.classList.add('is-focused');
      },
      onBlur: () => {
        container.classList.remove('is-focused');
      },
      onEnter: () => {
        // Submit form on enter key inside the card input
        button.click();
      },
      onChange: (props) => {
        // Provide real time validation errors
        if (props.isTouched) {
          if (props.error) {
            container.classList.add('is-invalid');
            container.classList.remove('is-valid');
            errorText.innerText = props.error;
          } else {
            container.classList.remove('is-invalid');
            container.classList.add('is-valid');
            errorText.innerText = '';
          }
        }
      }
    });

    // Render card input into a container div
    cardInput.render(container);
    return cardInput;
  };

  // Display cart summary using the date received form the server
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
      button.querySelector('[data-total]').innerText = total;
    });
  };

  // Display payment result
  const displayResult = (status, message) => {
    const result = document.getElementById('result_message');
    const checkout = document.getElementById('checkout');
    checkout.classList.add('d-none');
    result.classList.remove('d-none');
    if (status === 'SUCCEEDED') {
      result.innerHTML = `
      <div class="card-body">
        <h2 class="card-title text-success">Thanks for your order!</h2>
        Yay! You successfully made a payment with MONEI.
      </div>
      `;
    } else {
      result.innerHTML = `
      <div class="card-body">
        <h2 class="card-title text-danger">Oops, payment failed.</h2>
        ${message}
      </div>
      `;
    }
  };

  const cart = await loadCart();
  displayCartSummary(cart);

  // Render MONEI Card Input Component
  const cardInput = renderCardInput(cart);

  // Listen to submit event on the payment form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isValid = form.checkValidity();
    form.classList.add('was-validated');
    if (!isValid) return;
    setLoading(true);
    try {
      // Generate a payment token from the card input
      const {token} = await monei.createToken(cardInput);
      if (!token) {
        return setLoading(false);
      }
      const customer = {
        name: form.querySelector('input[name="name"]').value,
        email: form.querySelector('input[name="email"]').value
      };
      const billingDetails = {
        name: customer.name,
        email: customer.email,
        address: {
          country: form.querySelector('select[name="country"]').value,
          city: form.querySelector('input[name="city"]').value,
          line1: form.querySelector('input[name="line1"]').value,
          zip: form.querySelector('input[name="zip"]').value,
          state: form.querySelector('input[name="state"]').value
        }
      };

      // Create a payment on the server
      // As an alternative you can pass a payment token directly to your server
      // when you're creating a payment
      const payment = await createPayment({
        cart,
        customer,
        billingDetails,
        shippingDetails: billingDetails
      });

      // Pass paymentId and paymentToken to confirm payment using monei.js
      // This will automatically open a 3D secure confirmation popup if needed
      // As an alternative you can redirect your customer to payment.nextAction.redirectUrl on the server
      const result = await monei.confirmPayment({paymentId: payment.id, paymentToken: token});

      // At this moment you can show a customer the payment result
      // But you should always rely on the result passed to the callback endpoint on your server
      // to update the order status
      console.log(result);
      displayResult(result.status, result.statusMessage);
    } catch (error) {
      console.log(error);
      displayResult(error.status, error.message);
    } finally {
      setLoading(false);
    }
  });
})();
