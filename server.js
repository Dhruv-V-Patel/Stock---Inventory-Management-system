require("dotenv").config();

// const https = require('https');
const https = require("http");
const fs = require("fs");
const app = require("./src/app");
const { Server } = require("socket.io");
const notificationService = require("./src/services/notificationService");

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

// const io = new Server(server, {
//     cors: {
//         origin: true,
//         credentials: true
//     }
// });


const io = new Server(server);
notificationService.setSocketIO(io);

io.on("connection", (socket) => {
  //console.log("Socket connected:", socket.id);

  socket.on("disconnect", () => {
    //console.log("Socket disconnected:", socket.id);
  });
});

app.set("io", io);

server.listen(process.env.PORT, () => {
  console.log(`server is running ${process.env.PORT}`);
});
