require("dotenv").config();

// const https = require('https');
const https = require("http");
const fs = require("fs");
const app = require("./src/app");

// const options = {
//   key: fs.readFileSync('/etc/letsencrypt/live/jayproducts.in/privkey.pem'),
//   cert: fs.readFileSync('/etc/letsencrypt/live/jayproducts.in/cert.pem')
// };

const server = https.createServer(/*options,*/ app);


const parseCookies = (header = "") => {
  return header.split(";").reduce((cookies, part) => {
    const separator = part.indexOf("=");

    if (separator === -1) {
      return cookies;
    }

    const key = part.slice(0, separator).trim();

    if (key) {
      cookies[key] = decodeURIComponent(part.slice(separator + 1).trim());
    }

    return cookies;
  }, {});
};

server.listen(process.env.PORT, () => {
  console.log(`server is running ${process.env.PORT}`);
});
