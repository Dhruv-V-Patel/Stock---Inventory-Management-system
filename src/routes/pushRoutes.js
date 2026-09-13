const express = require("express");
const router = express.Router();

const { authenticateToken } = require("../middleware/authenticateToken");

const { subscribe, unsubscribe } = require("../controllers/pushController");

router.get("/public-key", (req, res) => {
  res.json({
    publicKey: process.env.VAPID_PUBLIC_KEY,
  });
});

router.post("/subscribe", authenticateToken, subscribe);

router.post("/unsubscribe", authenticateToken, unsubscribe);

module.exports = router;
