const { authenticateToken } = require("../middleware/authenticateToken");
const express = require("express");
const controller = require("../controllers/rawMaterialsController");
const router = express.Router();
const { requirePermission } = require('../middleware/permissionMiddleware');

router.use(authenticateToken);

router.get("/", requirePermission("raw-materials.view"), controller.list);
router.get("/summary", requirePermission("raw-materials.view"), controller.summary);
router.get("/:id", requirePermission("raw-materials.view"), controller.getById);

router.post("/", requirePermission("raw-materials.edit"), controller.create);
router.put("/:id", requirePermission("raw-materials.edit"), controller.update);
router.delete("/:id",requirePermission("raw-materials.delete"),  controller.remove);

module.exports = router;
