const authorizationService = require("../services/authorizationService");

/* =========================================================
   GET USERS
========================================================= */

const getUsers = async (req, res) => {
  try {
    const users = await authorizationService.getAuthorizationUsers();

    return res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("[Authorization] getUsers:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch users.",
    });
  }
};

/* =========================================================
   GET USER AUTHORIZATION
========================================================= */

const getUserAuthorization = async (req, res) => {
  try {
    const data = await authorizationService.getUserAuthorization(
      req.params.userId,
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[Authorization] getUserAuthorization:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch user permissions.",
    });
  }
};

/* =========================================================
   SAVE USER AUTHORIZATION
========================================================= */

const saveUserAuthorization = async (req, res) => {
  try {
    const { permissionIds } = req.body || {};

    const data = await authorizationService.saveUserPermissions(
      req.params.userId,
      permissionIds,
    );

    return res.json({
      success: true,

      message: "User permissions updated successfully.",

      data,
    });
  } catch (error) {
    console.error("[Authorization] saveUserAuthorization:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update user permissions.",
    });
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getUsers,
  getUserAuthorization,
  saveUserAuthorization,
};
