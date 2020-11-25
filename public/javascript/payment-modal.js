(async () => {
  const cart = await store.loadCart();
  store.displayCartSummary(cart);

  // Listen to submit event on the payment form
  store.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isValid = store.form.checkValidity();
    store.form.classList.add('was-validated');
    if (!isValid) return;
    store.setLoading(true);
    try {
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
      // This will automatically open a payment popup to collect customer's card information
      // As an alternative you can redirect your customer to payment.nextAction.redirectUrl on the server
      const result = await monei.confirmPayment({
        paymentId: payment.id,
        // Set fullscreen payment page
        fullscreen: store.form.querySelector('input[name="fullscreen"]').checked
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
