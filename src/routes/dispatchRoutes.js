const express = require("express");
const router = express.Router();

const { authenticateToken } = require("../middleware/authenticateToken");
const controller = require("../controllers/dispatchController");
const { requirePermission } = require("../middleware/permissionMiddleware");

router.use(authenticateToken);

router.get("/summary", controller.getSummary);
router.get("/options", controller.getOptions);
router.get("/sale/:saleId", controller.getSaleForDispatch);

router.get("/", requirePermission("dispatch.view"), controller.getDispatches);
router.get("/:id", requirePermission("dispatch.view"), controller.getDispatch);

router.post("/", requirePermission("dispatch.edit"), controller.createDispatch);
router.put("/:id",requirePermission("dispatch.edit"), controller.updateDispatch);
router.delete("/:id",requirePermission("dispatch.delete"), controller.deleteDispatch);

module.exports = router;
