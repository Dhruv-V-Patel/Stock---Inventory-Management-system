const express = require("express");

const router = express.Router();

const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require('../middleware/permissionMiddleware');

const saleReportController = require("../controllers/saleReportController");

router.use(authenticateToken);

router.get("/",requirePermission("sales-report.view"), saleReportController.getSaleReport);

module.exports = router;
