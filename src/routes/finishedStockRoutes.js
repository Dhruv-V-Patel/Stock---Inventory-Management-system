const express = require("express");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require("../middleware/permissionMiddleware");

const {
  getFinishedStock,
  getRecentMovements,
  getProductMovements,
} = require("../controllers/finishedStockController");

const router = express.Router();
router.use(authenticateToken);


router.get("/", requirePermission("ready-stock.view"), getFinishedStock);

router.get("/movements", requirePermission("ready-stock.view"), getRecentMovements);

router.get("/:productId/movements", requirePermission("ready-stock.view"), getProductMovements);

module.exports = router;
