const express = require("express");

const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authenticateToken");

const authorizationController = require("../controllers/authorizationController");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get("/users", authorizationController.getUsers);

router.get("/:userId", authorizationController.getUserAuthorization);

router.put("/:userId", authorizationController.saveUserAuthorization);

module.exports = router;
