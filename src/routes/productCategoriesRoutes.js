const express = require("express");
const { authenticateToken } = require("../middleware/authenticateToken");

const {
  listCategories,
  createCategory,
} = require("../controllers/productCategoriesController");

const router = express.Router();

router.use(authenticateToken);

router.get("/", listCategories);
router.post("/", createCategory);

module.exports = router;
