const config = require('./config');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const faker = require('faker');
const ngrok = config.ngrok.enabled ? require('ngrok') : null;
const app = express();

// Setup useful middleware.
app.use(
  bodyParser.json({
    // We need the raw body to verify callback signature.
    // Let's compute it only when hitting the callback endpoint.
    verify: function (req, res, buf) {
      if (req.originalUrl.startsWith('/callback')) {
        req.rawBody = buf.toString();
      }
    }
  })
);

app.set('trust proxy', 1); // trust first proxy
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, '../public')));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, '../public'));

// Define routes.
app.use('/', require('./routes'));

// Start the server on the correct port.
const server = app.listen(config.port, () => {
  console.log(`🚀  Server listening on port ${server.address().port}`);
});

// Turn on the ngrok tunnel in development, which provides both the mandatory HTTPS
// support for all card payments, and the ability to consume webhooks locally.
if (ngrok) {
  ngrok
    .connect({
      addr: config.ngrok.port,
      subdomain: config.ngrok.subdomain,
      authtoken: config.ngrok.authtoken
    })
    .then((url) => {
      console.log(`💳  App URL to see the demo in your browser: ${url}/`);
    })
    .catch((err) => {
      if (err.code === 'ECONNREFUSED') {
        console.log(`⚠️  Connection refused at ${err.address}:${err.port}`);
      } else {
        console.log(`⚠️ Ngrok error: ${JSON.stringify(err)}`);
      }
      process.exit(1);
    });
}
