const purchaseService = require("../services/purchaseService");
const { getIpAddress, getUserId } = require("../utils/requestUtils");

const getOptions = async (req, res) => {
  try {
    const options = await purchaseService.getPurchaseOptions();

    return res.status(200).json({
      success: true,
      ...options,
    });
  } catch (error) {
    console.error("[Purchase Controller] options:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load purchase options.",
    });
  }
};

const getPurchases = async (req, res) => {
  try {
    const purchases = await purchaseService.getPurchases();

    return res.status(200).json({
      success: true,
      purchases,
    });
  } catch (error) {
    console.error("[Purchase Controller] list:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load purchases.",
    });
  }
};

const getPurchase = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid purchase ID.",
    });
  }

  try {
    const purchase = await purchaseService.getPurchaseById(id);

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found.",
      });
    }

    return res.status(200).json({
      success: true,
      purchase,
    });
  } catch (error) {
    console.error("[Purchase Controller] detail:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load purchase.",
    });
  }
};

const createPurchase = async (req, res) => {
  try {
    // const userId = req.user?.id || null;

    const purchase = await purchaseService.createPurchase(req.body, { userId: getUserId(req), ipAddress: getIpAddress(req),});

    return res.status(201).json({
      success: true,
      message: "Purchase created successfully.",
      purchase,
    });
  } catch (error) {
    console.error("[Purchase Controller] create:", error);

    const knownErrors = [
      "At least one purchase item is required.",
      "Invalid supplier.",
      "Supplier not found or inactive.",
      "Invalid or duplicate raw material.",
      "One or more raw materials are invalid or inactive.",
      "Quantity must be greater than zero.",
      "Rate cannot be negative.",
      "Invalid raw material.",
      "Invalid purchase totals.",
      "Invalid payment status.",
    ];

    return res.status(knownErrors.includes(error.message) ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to create purchase.",
    });
  }
};

const updatePurchase = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res
      .status(400)
      .json({ success: false, message: "Invalid purchase ID." });
  try {
    const purchase = await purchaseService.updatePurchase(
      id,
      req.body,
      { userId: getUserId(req), ipAddress: getIpAddress(req),}
    );
    return res
      .status(200)
      .json({
        success: true,
        message: "Purchase updated successfully.",
        purchase,
      });
  } catch (error) {
    console.error("[Purchase Controller] update:", error);
    const knownErrors = [
      "Purchase not found.",
      "At least one purchase item is required.",
      "Invalid supplier.",
      "Supplier not found or inactive.",
      "Invalid or duplicate raw material.",
      "One or more raw materials are invalid or inactive.",
      "Quantity must be greater than zero.",
      "Rate cannot be negative.",
      "Invalid raw material.",
      "Invalid purchase totals.",
      "Invalid payment status.",
    ];
    return res
      .status(knownErrors.includes(error.message) ? 400 : 500)
      .json({
        success: false,
        message: error.message || "Failed to update purchase.",
      });
  }
};

const deletePurchase = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid purchase ID.",
    });
  }

  try {
    const purchase = await purchaseService.deletePurchase(id, { userId: getUserId(req), ipAddress: getIpAddress(req),});

    return res.status(200).json({
      success: true,
      message: "Purchase deleted and stock movement reversed.",
      purchase,
    });
  } catch (error) {
    console.error("[Purchase Controller] delete:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete purchase.",
    });
  }
};

module.exports = {
  getOptions,
  getPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  deletePurchase,
};
