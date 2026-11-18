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
    const billFilePath = req.file
      ? `/uploads/purchase-bills/${req.file.filename}`
      : null;

    if (typeof req.body.items === "string") {
      try {
        req.body.items = JSON.parse(req.body.items);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Invalid purchase items data.",
        });
      }
    }

    const purchase = await purchaseService.createPurchase(
      { ...req.body, bill_file_path: billFilePath },
      { userId: getUserId(req), ipAddress: getIpAddress(req) },
    );

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
      "Invalid raw material.",
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
    const billFilePath = req.file
      ? `/uploads/purchase-bills/${req.file.filename}`
      : null;

    if (typeof req.body.items === "string") {
      try {
        req.body.items = JSON.parse(req.body.items);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Invalid purchase items data.",
        });
      }
    }

    const purchase = await purchaseService.updatePurchase(
      id,
      {
        ...req.body,
        bill_file_path: billFilePath,
      },
      { userId: getUserId(req), ipAddress: getIpAddress(req) },
    );
    return res.status(200).json({
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
    return res.status(knownErrors.includes(error.message) ? 400 : 500).json({
      success: false,
      message: error.message || "Failed to update purchase.",
    });
  }
};

const getRateSettlementPreview = async (req, res) => {
  try {
    const preview = await purchaseService.getPurchaseRateSettlementPreview(req.body || {});
    return res.status(200).json({ success: true, preview });
  } catch (error) {
    const known = ["Valid from and to dates are required.", "From date cannot be after To date.", "Invalid supplier.", "Invalid raw material."];
    return res.status(known.includes(error.message) ? 400 : 500).json({ success: false, message: error.message || "Failed to preview rate settlement." });
  }
};

const applyRateSettlement = async (req, res) => {
  try {
    const result = await purchaseService.applyPurchaseRateSettlement(req.body || {}, {
      userId: getUserId(req),
      ipAddress: getIpAddress(req),
    });
    return res.status(200).json({ success: true, message: "Purchase rates settled successfully.", result });
  } catch (error) {
    console.error("[Purchase Controller] rate settlement:", error);
    const known = [
      "Valid from and to dates are required.",
      "From date cannot be after To date.",
      "Invalid supplier.",
      "Invalid raw material.",
      "Rate must be a valid non-negative number.",
      "Supplier not found or inactive.",
      "No pending-rate purchase items found for the selected filters.",
    ];
    return res.status(known.includes(error.message) ? 400 : 500).json({ success: false, message: error.message || "Failed to settle purchase rates." });
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
    const purchase = await purchaseService.deletePurchase(id, {
      userId: getUserId(req),
      ipAddress: getIpAddress(req),
    });

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
  getRateSettlementPreview,
  applyRateSettlement,
};
