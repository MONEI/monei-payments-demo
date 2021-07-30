const config = require("./config");
const express = require("express");
const exphbs = require("express-handlebars");
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const ngrok = config.ngrok.enabled ? require("ngrok") : null;
const app = express();

// Setup useful middleware.
app.use(
  bodyParser.json({
    // We need the raw body to verify callback signature.
    // Let's compute it only when hitting the callback endpoint.
    verify: function (req, res, buf) {
      if (req.originalUrl.startsWith("/callback")) {
        req.rawBody = buf.toString();
      }
    }
  })
);

const hbs = exphbs.create({
  extname: ".hbs",
  helpers: {
    currency: function (amount) {
      const num = Number(amount);
      return num.toLocaleString("en", {style: "currency", currency: "EUR"});
    },
    address: function (address) {
      if (!address) return null;
      const {line1, line2, city, country, state, zip} = address;
      const lines = [];
      if (line1) lines.push(line1);
      if (line2) lines.push(line2);
      if (city || state || zip || country) {
        const line = [];
        if (city) line.push(city);
        if (state) line.push(state);
        if (zip) line.push(zip);
        if (country) line.push(country);
        lines.push(line.join(", "));
      }
      if (lines.length === 0) return null;
      return lines.join(" ");
    }
  }
});

app.set("trust proxy", 1); // trust first proxy
app.use(
  session({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: true,
    cookie: {secure: true}
  })
);
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, "../public")));
app.engine(".hbs", hbs.engine);
app.set("views", path.join(__dirname, "./views"));
app.set("view engine", ".hbs");

// Define routes.
app.use("/", require("./routes"));

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
      if (err.code === "ECONNREFUSED") {
        console.log(`⚠️  Connection refused at ${err.address}:${err.port}`);
      } else {
        console.log(`⚠️ Ngrok error: ${JSON.stringify(err)}`);
      }
      process.exit(1);
    });
}
