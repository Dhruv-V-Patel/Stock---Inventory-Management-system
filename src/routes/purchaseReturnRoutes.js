const express = require("express");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require("../middleware/permissionMiddleware");
const controller = require("../controllers/purchaseReturnController");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/options",
  requirePermission("purchase_returns.view"),
  controller.getOptions,
);
router.get(
  "/purchases",
  requirePermission("purchase_returns.view"),
  controller.getSupplierPurchases,
);
router.get(
  "/purchases/:purchaseId/items",
  requirePermission("purchase_returns.view"),
  controller.getPurchaseItems,
);
router.get(
  "/",
  requirePermission("purchase_returns.view"),
  controller.getReturns,
);
router.post(
  "/",
  requirePermission("purchase_returns.create"),
  controller.createReturn,
);
router.get(
  "/:id",
  requirePermission("purchase_returns.view"),
  controller.getReturn,
);
router.put(
  "/:id",
  requirePermission("purchase_returns.edit"),
  controller.updateReturn,
);
router.delete(
  "/:id",
  requirePermission("purchase_returns.delete"),
  controller.deleteReturn,
);

module.exports = router;
