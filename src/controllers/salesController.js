const salesService = require("../services/salesService");
const { getIpAddress, getUserId } = require("../utils/requestUtils");


const sendError = (res, error) => {
  const statusCode =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  if (statusCode >= 500) {
    console.error("[SalesController]", error);
  }

  return res.status(statusCode).json({
    message:
      statusCode >= 500
        ? "An unexpected error occurred while processing the sale."
        : error.message,
  });
};

const listSales = async (req, res) => {
  try {
    const sales = await salesService.listSales();

    return res.json({ sales });
  } catch (error) {
    return sendError(res, error);
  }
};

const getOptions = async (req, res) => {
  try {
    const options = await salesService.getOptions();

    return res.json(options);
  } catch (error) {
    return sendError(res, error);
  }
};

const getSaleById = async (req, res) => {
  try {
    const sale = await salesService.getSaleById(req.params.id);

    if (!sale) {
      return res.status(404).json({
        message: "Sale not found.",
      });
    }

    return res.json({ sale });
  } catch (error) {
    return sendError(res, error);
  }
};

const createSale = async (req, res) => {
  try {
    const sale = await salesService.createSale(
      req.body,
     { userId: getUserId(req), ipAddress: getIpAddress(req),}
    );

    return res.status(201).json({
      message: "Sale created successfully.",
      sale,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const updateSale = async (req, res) => {
  try {
    const sale = await salesService.updateSale(
      req.params.id,
      req.body,
     { userId: getUserId(req), ipAddress: getIpAddress(req),}
    );

    return res.json({
      message: "Sale updated successfully.",
      sale,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const deleteSale = async (req, res) => {
  try {
    const result = await salesService.deleteSale(
      req.params.id,
     { userId: getUserId(req), ipAddress: getIpAddress(req),}
    );

    return res.json({
      message: `Sale ${result.sale_no} deleted and stock restored.`,
      ...result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  listSales,
  getOptions,
  getSaleById,
  createSale,
  updateSale,
  deleteSale,
};
