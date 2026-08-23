// const stockReportService = require("../services/stockReportService");

// const getStockReport = async (req, res) => {
//   try {
//     const result = await stockReportService.getStockReport({
//       item_type: req.query.item_type,
//       search: req.query.search,
//       category: req.query.category,
//       status: req.query.status,
//       from_date: req.query.from_date,
//       to_date: req.query.to_date,
//     });

//     res.json(result);
//   } catch (error) {
//     console.error("Failed to load stock report:", error);
//     res.status(error.statusCode || 500).json({
//       message: error.message || "Unable to load stock report.",
//     });
//   }
// };

// const getItemMovements = async (req, res) => {
//   try {
//     const movements = await stockReportService.getItemMovements(
//       req.params.itemType,
//       req.params.itemId,
//     );

//     res.json({ movements });
//   } catch (error) {
//     console.error("Failed to load stock movements:", error);
//     res.status(error.statusCode || 500).json({
//       message: error.message || "Unable to load stock movements.",
//     });
//   }
// };

// module.exports = {
//   getStockReport,
//   getItemMovements,
// };


const stockReportService = require("../services/stockReportService");

const getStockReport = async (req, res) => {
  try {
    const result = await stockReportService.getStockReport({
      item_type: req.query.item_type,
      search: req.query.search,
      category: req.query.category,
      status: req.query.status,
      from_date: req.query.from_date,
      to_date: req.query.to_date,
    });

    res.json(result);
  } catch (error) {
    console.error("Failed to load stock report:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "Unable to load stock report.",
    });
  }
};

const getItemMovements = async (req, res) => {
  try {
    const movements = await stockReportService.getItemMovements(
      req.params.itemType,
      req.params.itemId,
      {
        from_date: req.query.from_date,
        to_date: req.query.to_date,
        limit: req.query.limit,
      },
    );

    res.json({ movements });
  } catch (error) {
    console.error("Failed to load stock movements:", error);
    res.status(error.statusCode || 500).json({
      message: error.message || "Unable to load stock movements.",
    });
  }
};

module.exports = {
  getStockReport,
  getItemMovements,
};
