const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require('../middleware/permissionMiddleware');
const productionController = require("../controllers/productionController");
const productionCorrectionController = require("../controllers/productionCorrectionController");

router.use(authenticateToken);

// ============================================================
// PRODUCTION CONSUMPTION CORRECTION
// ============================================================

router.get("/consumption-corrections/options",requirePermission("consumption-correction.view"), productionCorrectionController.getOptions);

router.get("/consumption-corrections/bom/:bomId/materials", requirePermission("consumption-correction.view"), productionCorrectionController.getBomMaterials);

router.post("/consumption-corrections/find", requirePermission("consumption-correction.view"), productionCorrectionController.findProductions);

router.post("/consumption-corrections/preview", requirePermission("consumption-correction.view"), productionCorrectionController.previewCorrection);

router.post("/consumption-corrections", requirePermission("consumption-correction.add"), productionCorrectionController.applyCorrection);

router.get("/consumption-corrections", requirePermission("consumption-correction.view"), productionCorrectionController.getCorrections);

router.get("/consumption-corrections/:id", requirePermission("consumption-correction.view"),  productionCorrectionController.getCorrectionById);

router.get("/",requirePermission("production.view"), productionController.getProductions);
router.get("/products", requirePermission("production.view"), productionController.getProducts);
// router.get("/boms/:productId", productionController.getProductBoms);
router.get("/:id", requirePermission("production.view"), productionController.getProductionById);
router.post("/", requirePermission("production.add"), productionController.createProduction);
router.put("/:id", requirePermission("production.edit"), productionController.updateProduction);
router.delete("/:id", requirePermission("production.delete"), productionController.deleteProduction);

module.exports = router;
