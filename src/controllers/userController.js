const userService = require("../services/userService");
const { getIpAddress, getUserId } = require("../utils/requestUtils");

const getUsers = async (req, res) => {
  try {
    const data = await userService.listUsers();

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[Users] getUsers:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users.",
    });
  }
};

const getUser = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("[Users] getUser:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch user.",
    });
  }
};

const createUser = async (req, res) => {
  try {
    const user = await userService.createUser(req.body,{ userId: getUserId(req), ipAddress: getIpAddress(req),});

    return res.status(201).json({
      success: true,
      message: "User created successfully.",
      data: user,
    });
  } catch (error) {
    console.error("[Users] createUser:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create user.",
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await userService.updateUser(
      req.params.id,
      req.body,
      { currentUserId: getUserId(req), ipAddress: getIpAddress(req),}
    );

    return res.json({
      success: true,
      message: "User updated successfully.",
      data: user,
    });
  } catch (error) {
    console.error("[Users] updateUser:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update user.",
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const id = await userService.deleteUser(
      req.params.id,
      { currentUserId: getUserId(req), ipAddress: getIpAddress(req),}
    );

    return res.json({
      success: true,
      message: "User deleted successfully.",
      data: { id },
    });
  } catch (error) {
    console.error("[Users] deleteUser:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to delete user.",
    });
  }
};

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
};
