const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authenticateToken");
const supplierController = require("../controllers/supplierController");
const { requirePermission } = require('../middleware/permissionMiddleware');

router.use(authenticateToken);


router.get("/summary", requirePermission("suppliers.view"), supplierController.getSummary);
router.get("/", requirePermission("suppliers.view"), supplierController.getSuppliers);
router.get("/:id", requirePermission("suppliers.view"), supplierController.getSupplier);
router.post("/", requirePermission("suppliers.edit"), supplierController.createSupplier);
router.put("/:id", requirePermission("suppliers.edit"), supplierController.updateSupplier);
router.delete("/:id", requirePermission("suppliers.delete"), supplierController.removeSupplier);


module.exports = router;
