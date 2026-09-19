const express = require("express");

const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductSummary,
  getNextProductCode,
} = require("../controllers/productsController");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authenticateToken);

router.get("/", requirePermission("products.view"), listProducts);
router.get("/summary", requirePermission("products.view"), getProductSummary);
router.get("/next-code", requirePermission("products.view"), getNextProductCode);
router.get("/:id",requirePermission("products.view"), getProduct);

router.post("/", requirePermission("products.add"), createProduct);

router.put("/:id", requirePermission("products.edit"), updateProduct);

router.delete("/:id", requirePermission("products.delete"),  deleteProduct);

module.exports = router;
