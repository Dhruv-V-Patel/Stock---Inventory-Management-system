const express = require("express");
const router = express.Router();
const quotationController = require("../controllers/quotationController");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require("../middleware/permissionMiddleware");

router.use(authenticateToken);

router.get("/options", requirePermission("quotations.view"), quotationController.getOptions);
router.get("/summary", requirePermission("quotations.view"), quotationController.getQuotationSummary);
router.get("/next-number", requirePermission("quotations.view"), quotationController.getNextQuotationNo);

// Keep /terms before /:id so "terms" is not treated as an ID.
router.get("/terms", requirePermission("quotations.view"), quotationController.listQuotationTerms);
router.post("/terms", requirePermission("quotations.add"), quotationController.createQuotationTerm);
router.put("/terms/:id", requirePermission("quotations.edit"), quotationController.updateQuotationTerm);
router.delete("/terms/:id", requirePermission("quotations.delete"), quotationController.deleteQuotationTerm);

router.get("/", requirePermission("quotations.view"), quotationController.listQuotations);
router.post("/", requirePermission("quotations.add"), quotationController.createQuotation);
router.get("/:id", requirePermission("quotations.view"), quotationController.getQuotationById);
router.put("/:id", requirePermission("quotations.edit"), quotationController.updateQuotation);
router.delete("/:id", requirePermission("quotations.delete"), quotationController.deleteQuotation);

module.exports = router;
