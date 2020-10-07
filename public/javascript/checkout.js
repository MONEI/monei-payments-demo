$.fn.serializeObject = function () {
  const o = {};
  const a = this.serializeArray();
  $.each(a, function () {
    if (o[this.name]) {
      if (!o[this.name].push) {
        o[this.name] = [o[this.name]];
      }
      o[this.name].push(this.value || '');
    } else {
      o[this.name] = this.value || '';
    }
  });
  return o;
};

class Checkout {
  constructor() {
    this.init();
  }

  handleSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    this.checkoutForm.addClass('was-validated');
    if (this.checkoutForm[0].checkValidity() === false) {
      return;
    }
    console.log(this.checkoutForm.serializeObject());
  }

  async createPayment(data) {
    const res = await fetch('/payments', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({})
    });
  }

  init() {
    this.checkoutForm = $('#checkout_form');
    this.checkoutForm.on('submit', (e) => {
      this.handleSubmit(e);
    });
  }
}

window.checkout = new Checkout();
