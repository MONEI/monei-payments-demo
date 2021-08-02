const paymentForm = document.getElementById("payment_form");
const confirmForm = document.getElementById("confirm_form");
const submitButton = paymentForm.querySelector('button[type="submit"]');
const cardInputContainer = document.getElementById("card_input");
const cardInputError = document.getElementById("card_input_error");

// Show/hide full screen loader
const setLoading = (isLoading) => {
  if (isLoading) {
    document.body.classList.add("loading");
    submitButton.disabled = true;
  } else {
    document.body.classList.remove("loading");
    submitButton.disabled = false;
  }
};

// Pass paymentId and paymentToken to confirm payment using monei.js
// This will automatically open a 3D secure confirmation popup if needed
// As an alternative you can redirect your customer to payment.nextAction.redirectUrl on the server
const moneiTokenHandler = async (paymentToken, cardholderName) => {
  setLoading(true);

  const params = {
    paymentId: window.paymentId,
    paymentToken
  };

  // Send a cardholder name for the card payments
  if (cardholderName) {
    params.paymentMethod = {
      card: {cardholderName}
    };
  }

  try {
    const result = await monei.confirmPayment(params);

    // At this moment you can show a customer the payment result
    // But you should always rely on the result passed to the callback endpoint on your server
    // to update the order status
    console.log(result);

    // Redirect your customer to the receipt page to check the payment status (server-side)
    window.location.assign(`/receipt?id=${window.paymentId}`);
  } catch (error) {
    console.log(error);
    window.location.assign(`/receipt?id=${window.paymentId}`);
  }
};

// Initialize Bizum payment button
const bizumButton = monei.Bizum({
  paymentId: window.paymentId,

  // In addition to payment ID pass amount and currency as parameters
  amount: window.amount,
  currency: window.currency,

  // You can specify UI component language
  language: "en",

  // Specify button styles
  style: {
    height: 42
  },

  // Specify a callback when payment is submitted
  onSubmit(result) {
    console.log(result);

    // At the moment Bizum does not support payment confirmation flow with monei.js
    // To confirm Bizum payment you need to do a post request to
    // "https://secure.monei.com/payments/{{payment.id}}/confirm" passing payment ID and payment token
    // You can do it with by submitting a form (client-side) or by calling confirm API endpoint (server-side)
    if (result.token) {
      setLoading(true);
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = "paymentToken";
      field.value = result.token;
      confirmForm.appendChild(field);
      confirmForm.submit();
    }
  },

  onError(error) {
    console.log(error);
  }
});

// Render Bizum button into the container div
bizumButton.render("#bizum");

// Initialize PayPal payment button
const paypalButton = monei.PayPal({
  paymentId: window.paymentId,

  // In addition to payment ID pass amount and currency as parameters
  amount: window.amount,
  currency: window.currency,

  // You can specify UI component language
  language: "en",

  // Specify button styles
  style: {
    height: 42
  },

  // Specify a callback when payment is submitted
  onSubmit(result) {
    console.log(result);
    if (result.token) {
      // Pass the payment token to monei.js to confirm payment
      moneiTokenHandler(result.token);
    }
  },

  onError(error) {
    console.log(error);
  }
});

// Render PayPal button into the container div
paypalButton.render("#paypal");

// Initialize Payment Request button
// This component will render either Apple Pay or Google Pay button
// depending on the browser and operation system
const paymentRequestButton = monei.PaymentRequest({
  paymentId: window.paymentId,
  // In addition to payment ID pass amount and currency as parameters
  amount: window.amount,
  currency: window.currency,

  // You can specify UI component language
  language: "en",

  // Specify button styles
  style: {
    height: 42
  },

  // Specify a callback when payment is submitted
  onSubmit(result) {
    console.log(result);
    if (result.token) {
      // Pass the payment token to monei.js to confirm payment
      moneiTokenHandler(result.token);
    }
  },
  onError(error) {
    console.log(error);
  }
});

// Render Payment Request button into the container div
paymentRequestButton.render("#payment_request");

// Initialize Card Input component
const cardInput = monei.CardInput({
  paymentId: window.paymentId,

  // You can specify UI component language
  language: "en",

  onLoad: () => {
    // Enable submit button when component is loaded
    submitButton.disabled = false;
  },
  onFocus: () => {
    cardInputContainer.classList.add("is-focused");
  },
  onBlur: () => {
    cardInputContainer.classList.remove("is-focused");
  },
  onEnter: () => {
    // Submit form on enter key inside the card input
    submitButton.click();
  },
  onChange: (props) => {
    // Provide real time validation errors
    if (props.isTouched) {
      if (props.error) {
        cardInputContainer.classList.add("is-invalid");
        cardInputContainer.classList.remove("is-valid");
        cardInputError.innerText = props.error;
      } else {
        cardInputContainer.classList.remove("is-invalid");
        cardInputContainer.classList.add("is-valid");
        cardInputError.innerText = "";
      }
    }
  }
});

// Render card input into a container div
cardInput.render(cardInputContainer);

// Generate Card Input payment token when payment form is submitted
paymentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  // Check if form is valid
  const isValid = paymentForm.checkValidity();
  paymentForm.classList.add("was-validated");

  if (!isValid) return;
  setLoading(true);

  try {
    // Generate a payment token from the Card Input
    const {token} = await monei.createToken(cardInput);
    if (!token) {
      return setLoading(false);
    }
    const cardholderName = paymentForm.querySelector('input[name="cardholder"]').value;

    // Pass payment token and cardholder name to monei.js to confirm payment
    await moneiTokenHandler(token, cardholderName);
  } catch (error) {
    console.log(error);
    setLoading(false);
  }
});
