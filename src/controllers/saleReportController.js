const saleReportService = require("../services/saleReportService");

const getSaleReport = async (req, res) => {
  try {
    const result = await saleReportService.getSaleReport({
      search: req.query.search,
      customer_id: req.query.customer_id,
      payment_status: req.query.payment_status,
      from_date: req.query.from_date,
      to_date: req.query.to_date,
    });

    return res.json(result);
  } catch (error) {
    console.error("Failed to load sale report:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Unable to load sales report.",
    });
  }
};

module.exports = {
  getSaleReport,
};
