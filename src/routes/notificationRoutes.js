const express = require("express");
const router = express.Router();

const {authenticateToken} = require("../middleware/authenticateToken");
const notificationController = require("../controllers/notificationController");

router.use(authenticateToken);

// Get latest notifications
router.get("/", notificationController.getNotifications);
router.post("/read", notificationController.markAllNotificationsRead);

module.exports = router;