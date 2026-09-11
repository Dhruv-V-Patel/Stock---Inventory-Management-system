const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authenticateToken");
const customerController = require("../controllers/customerController");
const { requirePermission } = require("../middleware/permissionMiddleware");

router.use(authenticateToken);

router.get("/summary", requirePermission("customers.view"), customerController.getSummary);
router.get("/check-name",requirePermission("customers.view"), customerController.checkCustomerName);
router.get("/check-gstin",requirePermission("customers.view"), customerController.checkCustomerGstin);
router.get("/", requirePermission("customers.view"), customerController.getCustomers);
router.get("/:id", requirePermission("customers.view"), customerController.getCustomer);
router.post("/", requirePermission("customers.add"), customerController.createCustomer);
router.put("/:id", requirePermission("customers.edit"), customerController.updateCustomer);
router.delete("/:id", requirePermission("customers.delete"), customerController.removeCustomer);

module.exports = router;
