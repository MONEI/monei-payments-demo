const form = document.getElementById("payment_form");
const submitButton = form.querySelector('button[type="submit"]');
const cardInputContainer = document.getElementById("card_input");
const cardInputError = document.getElementById("card_input_error");

const renderCardInput = () => {
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
  return cardInput;
};

// Render MONEI Card Input Component
const cardInput = renderCardInput();

const setLoading = (isLoading) => {
  if (isLoading) {
    submitButton.disabled = true;
    submitButton.classList.add("btn-loading");
  } else {
    submitButton.disabled = false;
    submitButton.classList.remove("btn-loading");
  }
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const isValid = form.checkValidity();
  form.classList.add("was-validated");
  if (!isValid) return;
  setLoading(true);
  try {
    // Generate a payment token from the card input
    const {token} = await monei.createToken(cardInput);
    if (!token) {
      return setLoading(false);
    }

    // Pass paymentId and paymentToken to confirm payment using monei.js
    // This will automatically open a 3D secure confirmation popup if needed
    // As an alternative you can redirect your customer to payment.nextAction.redirectUrl on the server
    const result = await monei.confirmPayment({
      paymentId: window.paymentId,
      paymentToken: token,
      paymentMethod: {
        card: {
          cardholderName: form.querySelector('input[name="cardholder"]').value
        }
      }
    });

    // At this moment you can show a customer the payment result
    // But you should always rely on the result passed to the callback endpoint on your server
    // to update the order status
    console.log(result);
    window.location.assign(window.location.href.replace("payment", "receipt"));
  } catch (error) {
    console.log(error);
    setLoading(false);
  }
});
