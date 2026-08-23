const express = require("express");

const router = express.Router();

const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require('../middleware/permissionMiddleware');

const purchaseReportController = require("../controllers/purchaseReportController");

router.use(authenticateToken);

router.get("/",requirePermission("purchase-report.view"), purchaseReportController.getPurchaseReport);

module.exports = router;
