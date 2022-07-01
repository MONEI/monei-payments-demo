const faker = window.faker;
const generateInputTrigger = document.getElementById("generate");
const checkoutForm = document.getElementById("checkout_form");

const {name, address, internet} = faker;

// Generate random form data
generateInputTrigger.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementsByName("name")[0].value = `${name.firstName()} ${name.lastName()}`;
  document.getElementsByName("email")[0].value = internet.email();
  document.getElementsByName("line1")[0].value = `${address.streetAddress()}`;
  document.getElementsByName("city")[0].value = `${address.city()}`;
  document.getElementsByName("state")[0].value = `${address.state()}`;
  document.getElementsByName("zip")[0].value = `${address.zipCode()}`;
});

// Add checkout form validation
checkoutForm.addEventListener(
    "submit",
    function (event) {
      checkoutForm.classList.add("was-validated");
      if (!checkoutForm.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const button = checkoutForm.querySelector('button[type="submit"]');
      button.classList.add("btn-loading");
      button.disabled = true;
    },
    false
  );

function toggleBizumDemo(bizumDemo) {
  if (!bizumDemo) {
    window.open(window.location.origin + `?bizumDemo=1`, "_self");
  } else {
    window.open(window.location.origin, "_self");
  }

}
