const { getDashboardData, getProductionVsSalesData } = require("../services/dashboardService.js");

const getDashboard = async (req, res) => {
  try {
    const dashboard = await getDashboardData();

    return res.status(200).json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    console.error("[Dashboard Controller]", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
    });
  }
};

const getProductionVsSales = async (req, res) => {
  try {
    const requestedDays = Number(req.query.days);

    const allowedDays = [7, 15, 30, 60, 90];

    const days = allowedDays.includes(requestedDays) ? requestedDays : 7;

    const data = await getProductionVsSalesData(days);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[Production vs Sales Controller]", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch production vs sales",
    });
  }
};

module.exports = {
  getDashboard,
  getProductionVsSales,
};