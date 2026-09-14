const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authenticateToken");
const paymentController = require("../controllers/paymentController");
const { requirePermission } = require("../middleware/permissionMiddleware");

router.use(authenticateToken);

router.get("/options", requirePermission("payments.view"),paymentController.getOptions);
router.get("/", requirePermission("payments.view"), paymentController.listPayments);
router.get("/:id", requirePermission("payments.view"), paymentController.getPayment);
router.post("/", requirePermission("payments.add"),paymentController.createPayment);
router.put("/:id", requirePermission("payments.edit"), paymentController.updatePayment);
router.delete("/:id", requirePermission("payments.delete"), paymentController.deletePayment);

module.exports = router;
