const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require('../middleware/permissionMiddleware');
const productionController = require("../controllers/productionController");

router.use(authenticateToken);

router.get("/",requirePermission("production.view"), productionController.getProductions);
router.get("/products", requirePermission("production.view"), productionController.getProducts);
// router.get("/boms/:productId", productionController.getProductBoms);
router.get("/:id", requirePermission("production.view"), productionController.getProductionById);
router.post("/", requirePermission("production.edit"), productionController.createProduction);
router.put("/:id", requirePermission("production.edit"), productionController.updateProduction);
router.delete("/:id", requirePermission("production.delete"), productionController.deleteProduction);

module.exports = router;
