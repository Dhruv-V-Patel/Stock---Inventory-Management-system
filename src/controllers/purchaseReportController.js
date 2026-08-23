const purchaseReportService = require("../services/purchaseReportService");

const getPurchaseReport = async (req, res) => {
  try {
    const result =
      await purchaseReportService.getPurchaseReport({
        search: req.query.search,
        supplier_id: req.query.supplier_id,
        payment_status: req.query.payment_status,
        from_date: req.query.from_date,
        to_date: req.query.to_date,
      });

    res.json(result);
  } catch (error) {
    console.error(
      "Failed to load purchase report:",
      error,
    );

    res.status(error.statusCode || 500).json({
      message:
        error.message ||
        "Unable to load purchase report.",
    });
  }
};

module.exports = {
  getPurchaseReport,
};