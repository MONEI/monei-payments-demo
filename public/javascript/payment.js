const paymentForm = document.getElementById("payment_form");
const confirmForm = document.getElementById("confirm_form");
const submitButton = paymentForm.querySelector('button[type="submit"]');
const cardInputContainer = document.getElementById("card_input");
const cardInputError = document.getElementById("card_input_error");
const loader = document.getElementById("loader");

const setLoading = (isLoading) => {
  if (isLoading) {
    loader.classList.remove("d-none");
    submitButton.disabled = true;
  } else {
    loader.classList.add("d-none");
    submitButton.disabled = false;
  }
};

const moneiTokenHandler = async (paymentToken, cardholderName) => {
  // Pass paymentId and paymentToken to confirm payment using monei.js
  // This will automatically open a 3D secure confirmation popup if needed
  // As an alternative you can redirect your customer to payment.nextAction.redirectUrl on the server

  const params = {
    paymentId: window.paymentId,
    paymentToken
  };

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
    window.location.assign(result.nextAction.redirectUrl);
  } catch (error) {
    console.log(error);
    window.location.assign(window.location.href.replace("payment", "receipt"));
  }
};

monei
  .Bizum({
    paymentId: window.paymentId,
    amount: window.amount,
    currency: window.currency,
    language: "en",
    style: {
      height: 42
    },
    onSubmit(result) {
      console.log(result);
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
  })
  .render("#bizum");

monei
  .PayPal({
    paymentId: window.paymentId,
    amount: window.amount,
    currency: window.currency,
    language: "en",
    style: {
      height: 42
    },
    onSubmit(result) {
      console.log(result);
      if (result.token) {
        setLoading(true);
        moneiTokenHandler(result.token);
      }
    },
    onError(error) {
      console.log(error);
    }
  })
  .render("#paypal");

monei
  .PaymentRequest({
    paymentId: window.paymentId,
    amount: window.amount,
    currency: window.currency,
    language: "en",
    style: {
      height: 42
    },
    onBeforeSubmit() {
      setLoading(true);
    },
    onSubmit(result) {
      console.log(result);
      if (result.token) {
        moneiTokenHandler(result.token);
      }
    },
    onError(error) {
      console.log(error);
    }
  })
  .render("#payment_request");

const cardInput = monei.CardInput({
  // Use MONEI Account ID to initialize the component
  paymentId: window.paymentId,
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

paymentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const isValid = paymentForm.checkValidity();
  paymentForm.classList.add("was-validated");
  if (!isValid) return;
  setLoading(true);
  try {
    // Generate a payment token from the card input
    const {token} = await monei.createToken(cardInput);
    if (!token) {
      return setLoading(false);
    }
    const cardholderName = paymentForm.querySelector('input[name="cardholder"]').value;
    await moneiTokenHandler(token, cardholderName);
  } catch (error) {
    console.log(error);
    setLoading(false);
  }
});
