const express = require("express");
const { authenticateToken } = require("../middleware/authenticateToken");
const { getDashboard, getProductionVsSales } = require("../controllers/dashboardController.js");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/", requirePermission("dashboard.view"), getDashboard);

router.get("/production-vs-sales", requirePermission("dashboard.view"), getProductionVsSales);

module.exports = router;