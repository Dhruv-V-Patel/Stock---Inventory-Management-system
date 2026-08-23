const express = require("express");
const { requireAdmin, authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require("../middleware/permissionMiddleware");
const controller = require("../controllers/auditLogController");

const router = express.Router();

router.use(authenticateToken, requireAdmin);


router.get("/summary", requirePermission("audit_logs.view"), controller.getSummary);

router.get("/options", requirePermission("audit_logs.view"), controller.getOptions);

router.get("/", requirePermission("audit_logs.view"), controller.getAuditLogs);

router.get("/:id",requirePermission("audit_logs.view"),controller.getAuditLog);

module.exports = router;
