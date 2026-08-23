const express = require("express");
const router = express.Router();

const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require("../middleware/permissionMiddleware");

const productionReportController = require("../controllers/productionReportController");

router.use(authenticateToken);

router.get(
  "/",requirePermission("production-report.view"),
  productionReportController.getProductionReport,
);

module.exports = router;
