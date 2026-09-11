const express = require("express");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require("../middleware/permissionMiddleware");

const {
  getProductBoms,
  getProductBomById,
  createProductBom,
  updateProductBom,
  deleteProductBom,
} = require("../controllers/productBomController");

const router = express.Router();

router.use(authenticateToken);
    
router.get("/", requirePermission("product-bom.view"), getProductBoms);
router.get("/:id", requirePermission("product-bom.view"), getProductBomById);
router.post("/", requirePermission("product-bom.add"), createProductBom);
router.put("/:id", requirePermission("product-bom.edit"), updateProductBom);
router.delete("/:id", requirePermission("product-bom.delete"), deleteProductBom);

module.exports = router;
