// Load environment variables from the `.env` file.
require("dotenv").config();

module.exports = {
  // Your MONEI account credentials.
  // You can find them at https://dashboard.monei.com/settings/api
  monei: {
    accountId: process.env.MONEI_ACCOUNT_ID,
    apiKey: process.env.MONEI_API_KEY
  },

  // Custom hostname, if you are using custom domain
  hostname: process.env.HOSTNAME,

  // Server port.
  port: process.env.PORT || 8000,

  // Tunnel to serve the app over HTTPS and be able to receive webhooks locally.
  // Optionally, if you have a paid ngrok account, you can specify your `subdomain`
  // and `authtoken` in your `.env` file to use it.
  ngrok: {
    enabled: process.env.NODE_ENV !== "production",
    port: process.env.PORT || 8000,
    subdomain: process.env.NGROK_SUBDOMAIN,
    authtoken: process.env.NGROK_AUTHTOKEN
  }
};
