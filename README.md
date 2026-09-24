# MONEI Payments Demo

This demo features a sample e-commerce store that uses [MONEI Components](https://docs.monei.com/monei-js/overview/) and the [Payments API](https://docs.monei.com/apis/rest/) to illustrate how to accept Credit Card, Bizum, PayPal, Apple Pay and Google Pay payments on the web.

**You can see this demo app running in test mode on [payments-demo.monei.com](https://payments-demo.monei.com).**

## Overview

![MONEI Payments Demo Preview](public/images/preview.jpg)

This demo provides an all-in-one example for integrating with MONEI on the web:

<!-- prettier-ignore -->
|     | Features
:---: | :---
✨ | **Pre-built components for Credit Card, Bizum, PayPal, Apple Pay and Google Pay.** Card entry comes in two shapes — a single [Card Input](https://docs.monei.com/payment-methods/card/) or separate number/expiry/CVC fields — both with real-time validation, formatting and autofill.
🔐 | **3D Secure.** When the bank asks for a challenge, `monei.confirmPayment` opens it in a popup over the checkout.
🧾 | **Server-side pricing.** The browser never decides the amount. The server recomputes the total from the cart, the shipping address and the chosen shipping option before the payment is created, so a tampered request cannot change the price.
🔧 | **Webhook signing.** Payment results are verified with [signature verification](https://docs.monei.com/guides/verify-signature/), which MONEI requires.
🎛️ | **Live configuration.** Theme, checkout flow, payment methods and cart all live in the URL, so any state you reach can be shared as a link.
📱 | **Responsive design.** The checkout works on all screen sizes.

## How the integration is put together

The demo runs on [Astro](https://astro.build) with server-side rendering. There is no client framework — the payment code is plain JavaScript. It starts on Astro's `astro:page-load` event; outside Astro, start it on `DOMContentLoaded` instead.

The integration lives in these files:

1. [`src/client/checkout.js`](src/client/checkout.js) mounts [MONEI Components](https://docs.monei.com/monei-js/reference/) for each payment method and handles the browser side of the flow. It reads the order from the page through [`checkout-page.js`](src/client/checkout-page.js), whose `order()` builds the request body.
2. [`src/pages/api/`](src/pages/api/) holds the server routes:
   - `payment.js` — prices the order and opens the payment the browser confirms
   - `redirect-payment.js` — the same, returning a hosted payment page instead
   - `shipping-rates.js` — lists the shipping options for an address
   - `callback.js` — receives and verifies the webhook
3. [`src/lib/`](src/lib/) holds what the routes use: [`payment.js`](src/lib/payment.js) decides the amount, [`shipping.js`](src/lib/shipping.js) the zones and rates, [`cart.js`](src/lib/cart.js) the goods total, and [`monei.js`](src/lib/monei.js) the MONEI client.

### Payment flow

1. The browser tokenizes the payment method, and [`api/payment.js`](src/pages/api/payment.js) creates the payment with a server-computed amount.
2. The browser confirms it with `monei.confirmPayment` ([`checkout.js`](src/client/checkout.js)). A 3D Secure challenge opens in a popup.
3. [`receipt.astro`](src/pages/receipt.astro) reads the status on the server with `payments.get`. Do not trust the `completeUrl` query string to decide the result.
4. [`api/callback.js`](src/pages/api/callback.js) receives the webhook and verifies its signature. This is the reliable signal, even if the shopper closes the tab, so fulfil orders here.

The components tokenize under a `sessionId`, and the payment must be created with the same one. The demo makes a new one on every page load, so no two shoppers share one.

Steps 1–2 use the [custom checkout](https://docs.monei.com/integrations/build-custom-checkout/) alternative of initialising the components with the Account ID, then confirming in the browser with `confirmPayment`. The [Express checkout](https://docs.monei.com/integrations/express-checkout/) guide passes `paymentToken` to `payments.create` on the server instead.

How each method gets its shipping price:

- **Card:** the address form calls [`api/shipping-rates.js`](src/pages/api/shipping-rates.js), the shopper picks an option, and its id goes to `api/payment.js` with the cart and address.
- **Bizum and PayPal:** they pay for the same form order as the card. It is taken when their popup opens, so edits made behind the popup do not change what it charges.
- **Apple Pay and Google Pay:** the wallet collects the address in its own sheet, so shipping is priced in the `onShippingAddressChange` and `onShippingOptionChange` callbacks. See [Express checkout](https://docs.monei.com/integrations/express-checkout/).
- **Hosted page:** [`api/redirect-payment.js`](src/pages/api/redirect-payment.js) prices the form order the same way and returns `nextAction.redirectUrl`; MONEI sends the shopper back to `completeUrl`.

### Demo-only code

These parts exist only to drive the demo. Skip them when you copy the integration:

- [`rail.astro`](src/components/rail.astro), [`panels.js`](src/client/panels.js), [`nav.js`](src/client/nav.js) and the URL settings in [`config.js`](src/lib/config.js) — the settings rail
- [`code-panel.astro`](src/components/code-panel.astro), [`code-panel.js`](src/client/code-panel.js), [`events.js`](src/client/events.js) — the code and event log panel; the `emit()` calls in `checkout.js` only feed it
- [`cart-ui.js`](src/client/cart-ui.js) and `seededCart` in [`cart.js`](src/lib/cart.js) — a random, editable basket
- the sample-address and Bizum preset buttons in [`address-form.astro`](src/components/address-form.astro), and [`test-cards.astro`](src/components/test-cards.astro)
- [`themes.js`](src/data/themes.js) and [`public/fonts/`](public/fonts/) — the store themes

## Getting started

You will need:

- [Node.js](https://nodejs.org/en) >= 22.12
- A MONEI account ([sign up](https://dashboard.monei.com/?action=signUp) for free)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/), only to receive webhooks locally

Copy the environment file:

    cp .env.example .env

Fill in your [Account ID and API key](https://dashboard.monei.com/settings/api) in test mode. `.env.example` explains each variable. They are read at runtime, never built into the bundle.

Enable each payment method in test mode in the dashboard. PayPal also needs a connected PayPal business account — in test mode, the test business account listed in [Testing](https://docs.monei.com/testing/) — and Google Pay a configured card processor. See [Express checkout](https://docs.monei.com/integrations/express-checkout/) for the full list.

Install dependencies and start the dev server:

    npm install
    npm run dev

The store is now on `http://localhost:4321`, and test card, Bizum and PayPal payments complete there. Apple Pay needs HTTPS and a registered domain, so it does not work on localhost.

### Receiving webhooks locally

MONEI cannot deliver the webhook to localhost. To receive it, open a tunnel to the dev server:

    npm run dev:tunnel                               # dev server that accepts *.trycloudflare.com
    cloudflared tunnel --url http://localhost:4321   # public HTTPS URL forwarding to it

Put the tunnel URL in `PUBLIC_URL` and restart. `/api/callback` will now receive webhooks.

### Test cards

Use MONEI's [test cards](https://docs.monei.com/testing/). The demo surfaces the useful ones in the order summary, including a card that triggers a 3D Secure challenge.

Bizum only appears for shoppers in Spain.

## Deployment

The demo deploys to [Vercel](https://vercel.com) with the Astro adapter. Set `MONEI_ACCOUNT_ID` and `MONEI_API_KEY` in the project's environment variables. `PUBLIC_URL` is optional: without it, the return and webhook URLs use the host the request came in on.

Apple Pay also requires [registering the domain](https://docs.monei.com/payment-methods/apple-pay/#register-your-domain-with-apple-pay), and the verification file at `/.well-known/apple-developer-merchantid-domain-association` to be reachable. The file in this repo belongs to payments-demo.monei.com; download your own from the dashboard. A quick tunnel's hostname changes on every run, so testing Apple Pay through one means registering the domain again each time.

### Before you go live

- Switch to the live Account ID and API key.
- Enable each payment method in live mode.
- Register the production domain for Apple Pay.

## Tests

    npm test
