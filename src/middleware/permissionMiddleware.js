const pool = require("../config/db");

const requirePermission = (permission) => {
  if (!permission || typeof permission !== "string") {
    throw new Error("Permission is required");
  }

  const [module, action] = permission.split(".");

  if (!module || !action) {
    throw new Error(
      `Invalid permission "${permission}". Expected format: module.action`,
    );
  }

  return async (req, res, next) => {
    try {
      // authenticateToken must run before this middleware
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const userId = req.user.id;
      const roleName = req.user.role;

      if (!userId) {
        return res.status(403).json({
          success: false,
          message: "User ID not found",
        });
      }

      if (roleName === "admin") {
        return next();
      }

      const userPermissionResult = await pool.query(
        `
          SELECT 1
          FROM user_permissions up
          INNER JOIN permissions p
              ON p.id = up.permission_id
          WHERE up.user_id = $1
            AND p.module = $2
            AND p.action = $3
          LIMIT 1
        `,
        [userId, module, action],
      );

      if (userPermissionResult.rowCount > 0) {
        return next();
      }

      /*
       * ========================================================
       * DENIED
       * ========================================================
       */
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
        permission,
      });
    } catch (error) {
      console.error("Permission middleware error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to verify permission",
      });
    }
  };
};

module.exports = {
  requirePermission
};