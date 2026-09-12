const express = require("express");
const {
  list,
  items,
  save,
  remove,
} = require("../controllers/openingStockController");
const { authenticateToken } = require("../middleware/authenticateToken");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.use(authenticateToken);

router.get("/", requirePermission("opening-stock.view"), list);

router.get("/items", requirePermission("opening-stock.view"), items);

router.post("/", requirePermission("opening-stock.edit"), save);

router.put("/:id", requirePermission("opening-stock.edit"), save);

router.delete("/:id", requirePermission("opening-stock.delete"), remove);

module.exports = router;
