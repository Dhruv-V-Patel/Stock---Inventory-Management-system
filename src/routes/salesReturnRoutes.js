const express = require("express");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require("../middleware/permissionMiddleware");
const controller = require("../controllers/salesReturnController");

const router = express.Router();

router.use(authenticateToken);

router.get(
  "/options",
  requirePermission("sales_returns.view"),
  controller.getOptions,
);

router.get(
  "/sales",
  requirePermission("sales_returns.view"),
  controller.getCustomerSales,
);

router.get(
  "/sales/:saleId/items",
  requirePermission("sales_returns.view"),
  controller.getSaleItems,
);

router.get(
  "/",
  requirePermission("sales_returns.view"),
  controller.getReturns,
);

router.post(
  "/",
  requirePermission("sales_returns.add"),
  controller.createReturn,
);

router.get(
  "/:id",
  requirePermission("sales_returns.view"),
  controller.getReturn,
);

router.put(
  "/:id",
  requirePermission("sales_returns.edit"),
  controller.updateReturn,
);

router.delete(
  "/:id",
  requirePermission("sales_returns.delete"),
  controller.deleteReturn,
);

module.exports = router;
