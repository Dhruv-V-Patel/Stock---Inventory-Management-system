const express = require("express");

const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductSummary,
} = require("../controllers/productsController");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authenticateToken);

router.get("/", requirePermission("products.view"), listProducts);
router.get("/summary", requirePermission("products.view"), getProductSummary);
router.get("/:id",requirePermission("products.view"), getProduct);

router.post("/", requirePermission("products.edit"), createProduct);

router.put("/:id", requirePermission("products.edit"), updateProduct);

router.delete("/:id", requirePermission("products.delete"),  deleteProduct);

module.exports = router;
