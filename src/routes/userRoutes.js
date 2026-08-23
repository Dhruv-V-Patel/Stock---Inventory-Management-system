const express = require("express");

const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authenticateToken");

const userController = require("../controllers/userController");

const router = express.Router();

router.use(authenticateToken, requireAdmin);

router.get("/", userController.getUsers);
router.get("/:id", userController.getUser);
router.post("/", userController.createUser);
router.put("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);

module.exports = router;
