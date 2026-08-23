const productionReportService = require("../services/productionReportService");

const getProductionReport = async (req, res) => {
  try {
    const result =
      await productionReportService.getProductionReport({
        search: req.query.search,
        product_id: req.query.product_id,
        shift: req.query.shift,
        from_date: req.query.from_date,
        to_date: req.query.to_date,
      });

    res.json(result);
  } catch (error) {
    console.error("Failed to load production report:", error);

    res.status(error.statusCode || 500).json({
      message:
        error.message ||
        "Unable to load production report.",
    });
  }
};

module.exports = {
  getProductionReport,
};
