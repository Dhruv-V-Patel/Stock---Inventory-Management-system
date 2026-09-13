const notificationService = require("../services/notificationService");

/**
 * Get latest notifications
 */
const getNotifications = async (req, res) => {
  try {
    const notifications = await notificationService.getNotifications(req.user.id);
    res.json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("Get Notifications:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load notifications.",
    });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    await notificationService.markAllNotificationsRead(req.user.id);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error("Read Notifications:", error);

    res.status(500).json({
      success: false,
      message: "Failed to Read notifications.",
    });
  }
};

module.exports = {
  getNotifications,
  markAllNotificationsRead,
};
