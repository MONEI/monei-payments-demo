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
🔐 | **Dynamic 3D Secure for Visa and Mastercard.** The app handles the challenge flow when the card requires it.
🧾 | **Server-side pricing.** The browser never decides the amount. The server recomputes the total from the cart, the shipping address and the chosen shipping option before the payment is created, so a tampered request cannot change the price.
🔧 | **Webhook signing.** Payment results are verified with [signature verification](https://docs.monei.com/guides/verify-signature/), a recommended security practice.
🎛️ | **Live configuration.** Theme, checkout flow, payment methods and cart all live in the URL, so any state you reach can be shared as a link.
📱 | **Responsive design.** The checkout works on all screen sizes.

## How the integration is put together

The demo runs on [Astro](https://astro.build) with server-side rendering. There is no client framework — the payment code is plain JavaScript, the same as you would write in a PHP, Shopify or jQuery store.

Two directories carry the integration:

1. [`src/client/checkout.js`](src/client/checkout.js) mounts [MONEI Components](https://docs.monei.com/monei-js/reference/) for each payment method and handles the browser side of the flow.
2. [`src/pages/api/`](src/pages/api/) holds the server routes:
   - `payment.js` — turns a payment token into a payment
   - `redirect-payment.js` — the same call without a token, which returns a hosted payment page instead
   - `shipping-rates.js` — lists the shipping options for an address
   - `callback.js` — receives and verifies the webhook

The amount is decided in [`src/lib/payment.js`](src/lib/payment.js), never in the browser.

### Payment flow

1. The browser tokenizes the payment method, and [`api/payment.js`](src/pages/api/payment.js) creates the payment with a server-computed amount.
2. The browser confirms it with `monei.confirmPayment` ([`checkout.js`](src/client/checkout.js)). A 3D Secure challenge opens in a popup.
3. [`receipt.astro`](src/pages/receipt.astro) reads the status on the server with `payments.get`. Do not trust the `completeUrl` query string to decide the result.
4. [`api/callback.js`](src/pages/api/callback.js) receives the webhook and verifies its signature. This is the reliable signal, even if the shopper closes the tab, so fulfil orders here.

Steps 1–2 follow the [custom checkout](https://docs.monei.com/integrations/build-custom-checkout/) pattern of creating the payment first and confirming it in the browser. The [Express checkout](https://docs.monei.com/integrations/express-checkout/) guide instead passes `paymentToken` to `payments.create` on the server; that works too, but 3D Secure then redirects the whole page.

Apple Pay and Google Pay collect the address in their own sheet, so shipping is priced in the `onShippingAddressChange` and `onShippingOptionChange` callbacks through [`api/shipping-rates.js`](src/pages/api/shipping-rates.js). See [Express checkout](https://docs.monei.com/integrations/express-checkout/).

### Demo-only code

These parts exist only to drive the demo. Skip them when you read the integration:

- [`rail.astro`](src/components/rail.astro), [`panels.js`](src/client/panels.js), [`nav.js`](src/client/nav.js) — the settings rail and its navigation
- [`code-panel.astro`](src/components/code-panel.astro), [`code-panel.js`](src/client/code-panel.js), [`events.js`](src/client/events.js) — the code and event log panel
- [`checkout-page.js`](src/client/checkout-page.js) — the checkout page's DOM: error lines, busy states, the rates picker and panel layout
- [`cart-ui.js`](src/client/cart-ui.js) and the seeded cart in [`cart.js`](src/lib/cart.js) — a random, editable basket
- [`themes.js`](src/data/themes.js) — the store themes

## Getting started

You will need:

- [Node.js](https://nodejs.org/en) >= 22.12
- A MONEI account ([sign up](https://dashboard.monei.com/?action=signUp) for free)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/), only to receive webhooks locally

Copy the environment file:

    cp .env.example .env

Fill in your [Account ID and API key](https://dashboard.monei.com/settings/api) in test mode. `.env.example` explains each variable.

Enable each payment method in test mode in the dashboard. PayPal also needs a connected PayPal business account, and Google Pay a configured card processor — see [Express checkout](https://docs.monei.com/integrations/express-checkout/) for the full list.

Install dependencies and start the dev server:

    npm install
    npm run dev

The store is now on `http://localhost:4321`, and test payments complete there.

### Receiving webhooks locally

MONEI cannot deliver the webhook to localhost. To receive it, open a tunnel to the dev server:

    npm run dev:tunnel                               # dev server that accepts *.trycloudflare.com
    cloudflared tunnel --url http://localhost:4321   # public HTTPS URL forwarding to it

Put the tunnel hostname in `HOSTNAME` and restart. `/api/callback` will now receive webhooks.

### Test cards

Use MONEI's [test cards](https://docs.monei.com/testing/). The demo surfaces the useful ones in the order summary, including a card that triggers a 3D Secure challenge.

Bizum only appears for callers in Spain, because MONEI resolves the available methods from the caller's IP.

## Deployment

The demo deploys to [Vercel](https://vercel.com) with the Astro adapter. Set `MONEI_ACCOUNT_ID` and `MONEI_API_KEY` in the project's environment variables. `HOSTNAME` is optional: without it, the return and webhook URLs use the host the request came in on.

Apple Pay also requires [registering the domain](https://docs.monei.com/payment-methods/apple-pay/#register-your-domain-with-apple-pay), and the verification file at `/.well-known/apple-developer-merchantid-domain-association` to be reachable. The file in this repo belongs to payments-demo.monei.com; download your own from the dashboard. A quick tunnel's hostname changes on every run, so testing Apple Pay through one means registering the domain again each time.

## Tests

    npm test
