const faker = window.faker;
const generateInputTrigger = document.getElementById('generate');

const {name, address, internet} = faker;

generateInputTrigger.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementsByName('name')[0].value = `${name.firstName()} ${name.lastName()}`;
  document.getElementsByName('email')[0].value = internet.email();
  document.getElementsByName('line1')[0].value = `${address.streetAddress()}`;
  document.getElementsByName('city')[0].value = `${address.city()}`;
  document.getElementsByName('state')[0].value = `${address.state()}`;
  document.getElementsByName('zip')[0].value = `${address.zipCode()}`;
});
