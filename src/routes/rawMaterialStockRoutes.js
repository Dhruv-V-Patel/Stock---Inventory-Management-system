const express = require("express");
const { authenticateToken } = require("../middleware/authenticateToken");
const controller = require("../controllers/rawMaterialStockController");
const { requirePermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authenticateToken);

router.get("/", requirePermission("raw-material-stock.view"), controller.getRawMaterialStock);
router.get("/summary", requirePermission("raw-material-stock.view"), controller.getRawMaterialStockSummary);
router.get("/:id/movements", requirePermission("raw-material-stock.view"), controller.getRawMaterialStockMovements);
router.get("/:id", requirePermission("raw-material-stock.view"), controller.getRawMaterialStockById);

module.exports = router;
