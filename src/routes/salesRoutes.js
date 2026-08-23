const express = require("express");

const salesController = require("../controllers/salesController");
const { requirePermission } = require('../middleware/permissionMiddleware');
const {authenticateToken} = require('../middleware/authenticateToken');
const router = express.Router();


router.use(authenticateToken);

router.get("/", requirePermission("sales.view"),salesController.listSales);

router.get("/options", requirePermission("sales.view"), salesController.getOptions);

router.get("/:id",requirePermission("sales.view"), salesController.getSaleById);

router.post("/",requirePermission("sales.edit"), salesController.createSale);

router.put("/:id",requirePermission("sales.edit"), salesController.updateSale);

router.delete("/:id", requirePermission("sales.delete"), salesController.deleteSale);

module.exports = router;
