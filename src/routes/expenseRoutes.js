const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require("../middleware/permissionMiddleware");
const c = require("../controllers/expenseController");

router.use(authenticateToken);

router.get("/options", requirePermission("expense.view"), c.getOptions);
router.get("/categories", requirePermission("expense.view"), c.listCategories);
router.post("/categories", requirePermission("expense.add"), c.createCategory);
router.put("/categories/:id", requirePermission("expense.edit"), c.updateCategory);
router.delete("/categories/:id", requirePermission("expense.delete"), c.deleteCategory);

router.get("/bills", requirePermission("expense.view"), c.listBills);
router.get("/bills/:id", requirePermission("expense.view"), c.getBill);
router.post("/bills", requirePermission("expense.add"), c.createBill);
router.put("/bills/:id", requirePermission("expense.edit"), c.updateBill);
router.delete("/bills/:id", requirePermission("expense.delete"), c.deleteBill);

router.get("/payables", requirePermission("expense.view"), c.listPayables);
router.get("/reports", requirePermission("expense.view"), c.getReports);

module.exports = router;
