const express = require("express");
const router = express.Router();

const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require('../middleware/permissionMiddleware');
const stockReportController = require("../controllers/stockReportController");

router.use(authenticateToken);

router.get("/", requirePermission("stock-report.view"), stockReportController.getStockReport);
router.get("/:itemType/:itemId/movements", requirePermission("stock-report.view"), stockReportController.getItemMovements);

module.exports = router;
