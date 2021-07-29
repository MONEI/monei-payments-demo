const faker = window.faker;
const generateInputTrigger = document.getElementById("generate");

const {name, address, internet} = faker;

generateInputTrigger.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementsByName("name")[0].value = `${name.firstName()} ${name.lastName()}`;
  document.getElementsByName("email")[0].value = internet.email();
  document.getElementsByName("line1")[0].value = `${address.streetAddress()}`;
  document.getElementsByName("city")[0].value = `${address.city()}`;
  document.getElementsByName("state")[0].value = `${address.state()}`;
  document.getElementsByName("zip")[0].value = `${address.zipCode()}`;
});

// Fetch all the forms we want to apply custom Bootstrap validation styles to
const forms = document.querySelectorAll(".needs-validation");

// Loop over them and prevent submission
Array.prototype.slice.call(forms).forEach(function (form) {
  form.addEventListener(
    "submit",
    function (event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add("was-validated");
      const button = form.querySelector('button[type="submit"]');
      button.classList.add("btn-loading");
      button.disabled = true;
    },
    false
  );
});
