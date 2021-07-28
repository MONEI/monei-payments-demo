(async () => {
  // Render MONEI Card Input Component
  const renderCardInput = (cart) => {
    const container = document.getElementById('card_input');
    const errorText = document.getElementById('card_input_error');
    const cardInput = monei.CardInput({
      // Use MONEI Account ID to initialize the component
      accountId: cart.accountId,
      language: 'en',
      onLoad: () => {
        // Enable submit button when component is loaded
        store.button.disabled = false;
      },
      onFocus: () => {
        container.classList.add('is-focused');
      },
      onBlur: () => {
        container.classList.remove('is-focused');
      },
      onEnter: () => {
        // Submit form on enter key inside the card input
        store.button.click();
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

  const cart = await store.loadCart();
  store.displayCartSummary(cart);

  // Render MONEI Card Input Component
  const cardInput = renderCardInput(cart);

  // Listen to submit event on the payment form
  store.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isValid = store.form.checkValidity();
    store.form.classList.add('was-validated');
    if (!isValid) return;
    store.setLoading(true);
    try {
      // Generate a payment token from the card input
      const {token} = await monei.createToken(cardInput);
      if (!token) {
        return store.setLoading(false);
      }
      const {customer, billingDetails} = store.getFormValues();

      // Create a payment on the server
      // As an alternative you can pass a payment token directly to your server
      // when you're creating a payment
      const payment = await store.createPayment({
        cart,
        customer,
        billingDetails,
        shippingDetails: billingDetails
      });

      // Pass paymentId and paymentToken to confirm payment using monei.js
      // This will automatically open a 3D secure confirmation popup if needed
      // As an alternative you can redirect your customer to payment.nextAction.redirectUrl on the server
      const result = await monei.confirmPayment({
        paymentId: payment.id,
        paymentToken: token
      });

      // At this moment you can show a customer the payment result
      // But you should always rely on the result passed to the callback endpoint on your server
      // to update the order status
      console.log(result);
      store.displayResult(result.status, result.statusMessage);
    } catch (error) {
      console.log(error);
      store.displayResult(error.status, error.message);
    } finally {
      store.setLoading(false);
    }
  });
})();
