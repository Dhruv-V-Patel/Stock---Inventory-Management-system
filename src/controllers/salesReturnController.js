const salesReturnService = require("../services/salesReturnService");
const { getIpAddress, getUserId } = require("../utils/requestUtils");

const knownErrors = [
  "At least one return item is required.",
  "Invalid customer.",
  "Customer not found or inactive.",
  "Invalid sale.",
  "Sale not found.",
  "Sale does not belong to this customer.",
  "Invalid or duplicate product.",
  "Product is not part of the selected sale.",
  "Return quantity must be greater than zero.",
  "Sales return not found.",
];

const statusFor = (error) => {
  if (knownErrors.includes(error.message)) return 400;
  if (String(error.message || "").startsWith("Return quantity exceeds available quantity")) return 400;
  return error.statusCode || 500;
};

const getOptions = async (req, res) => {
  try {
    const data = await salesReturnService.getOptions();
    res.json({ success: true, ...data });
  } catch (error) {
    console.error("[Sales Return] options:", error);
    res.status(statusFor(error)).json({
      success: false,
      message: error.message || "Failed to load sales return options.",
    });
  }
};

const getCustomerSales = async (req, res) => {
  try {
    const sales = await salesReturnService.getCustomerSales(
      Number(req.query.customer_id),
    );

    res.json({ success: true, sales });
  } catch (error) {
    console.error("[Sales Return] customer sales:", error);
    res.status(statusFor(error)).json({
      success: false,
      message: error.message || "Failed to load customer sales.",
    });
  }
};

const getSaleItems = async (req, res) => {
  try {
    const items = await salesReturnService.getSaleReturnableItems(
      Number(req.params.saleId),
    );

    res.json({ success: true, items });
  } catch (error) {
    console.error("[Sales Return] sale items:", error);
    res.status(statusFor(error)).json({
      success: false,
      message: error.message || "Failed to load sale items.",
    });
  }
};

const getReturns = async (req, res) => {
  try {
    const returns = await salesReturnService.getReturns();
    res.json({ success: true, returns });
  } catch (error) {
    console.error("[Sales Return] list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load sales returns.",
    });
  }
};

const getReturn = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: "Sales return not found.",
    });
  }

  try {
    const data = await salesReturnService.getReturnById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Sales return not found.",
      });
    }

    res.json({ success: true, return: data });
  } catch (error) {
    console.error("[Sales Return] detail:", error);
    res.status(statusFor(error)).json({
      success: false,
      message: error.message || "Failed to load sales return.",
    });
  }
};

const createReturn = async (req, res) => {
  try {
    const data = await salesReturnService.createReturn(
      req.body,
      { userId: getUserId(req), ipAddress: getIpAddress(req),}
    );

    res.status(201).json({
      success: true,
      message: "Sales return created successfully.",
      return: data,
    });
  } catch (error) {
    console.error("[Sales Return] create:", error);
    res.status(statusFor(error)).json({
      success: false,
      message: error.message || "Failed to create sales return.",
    });
  }
};

const updateReturn = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: "Sales return not found.",
    });
  }

  try {
    const data = await salesReturnService.updateReturn(
      id,
      req.body,
      { userId: getUserId(req), ipAddress: getIpAddress(req),}
    );

    res.json({
      success: true,
      message: "Sales return updated successfully.",
      return: data,
    });
  } catch (error) {
    console.error("[Sales Return] update:", error);
    res.status(statusFor(error)).json({
      success: false,
      message: error.message || "Failed to update sales return.",
    });
  }
};

const deleteReturn = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: "Sales return not found.",
    });
  }

  try {
    const data = await salesReturnService.deleteReturn(id, { userId: getUserId(req), ipAddress: getIpAddress(req),});

    res.json({
      success: true,
      message: "Sales return deleted and stock movement reversed.",
      return: data,
    });
  } catch (error) {
    console.error("[Sales Return] delete:", error);
    res.status(statusFor(error)).json({
      success: false,
      message: error.message || "Failed to delete sales return.",
    });
  }
};

module.exports = {
  getOptions,
  getCustomerSales,
  getSaleItems,
  getReturns,
  getReturn,
  createReturn,
  updateReturn,
  deleteReturn,
};
