const express = require("express");
const { authenticateToken } = require("../middleware/authenticateToken");
const controller = require("../controllers/paymentReportController");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/", requirePermission("payments-report.view"), controller.getPaymentReport);
router.get("/export",requirePermission("payments-report.view"), controller.exportPaymentReport);
router.get("/filters",requirePermission("payments-report.view"), controller.getPaymentReportFilters);

module.exports = router;
