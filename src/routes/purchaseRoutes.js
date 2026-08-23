const express = require("express");
const { authenticateToken } = require("../middleware/authenticateToken");
const purchaseController = require("../controllers/purchaseController");
const { requirePermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authenticateToken);

router.get("/options", requirePermission("purchases.view"), purchaseController.getOptions);
router.get("/", requirePermission("purchases.view"),  purchaseController.getPurchases);
router.post("/", requirePermission("purchases.view"), purchaseController.createPurchase);
router.get("/:id", requirePermission("purchases.edit"), purchaseController.getPurchase);
router.put("/:id", requirePermission("purchases.edit"), purchaseController.updatePurchase);
router.delete("/:id", requirePermission("purchases.delete"), purchaseController.deletePurchase);

module.exports = router;
