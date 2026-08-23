const paymentReportService = require("../services/paymentReportService");

const getPaymentReport = async (req, res) => {
  try {
    const result = await paymentReportService.getPaymentReport(req.query);
    return res.json(result);
  } catch (error) {
    console.error("Failed to load payment report:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load payment report.",
    });
  }
};

const exportPaymentReport = async (req, res) => {
  try {
    const result = await paymentReportService.exportPaymentReport(req.query);
    return res.json(result);
  } catch (error) {
    console.error("Failed to export payment report:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to export payment report.",
    });
  }
};

const getPaymentReportFilters = async (req, res) => {
  try {
    const data = await paymentReportService.getPaymentReportFilters();
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Failed to load payment report filters:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to load payment report filters.",
    });
  }
};

module.exports = {
  getPaymentReport,
  exportPaymentReport,
  getPaymentReportFilters,
};
