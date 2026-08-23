const purchaseReturnService = require("../services/purchaseReturnService");
const { getIpAddress, getUserId } = require("../utils/requestUtils");

const known = [
  "At least one return item is required.",
  "Invalid supplier.",
  "Supplier not found or inactive.",
  "Invalid purchase.",
  "Purchase not found.",
  "Purchase does not belong to this supplier.",
  "Purchase has no returnable items.",
  "Invalid return item.",
  "Invalid or duplicate raw material.",
  "Raw material is not part of the selected purchase.",
  "Return quantity must be greater than zero.",
  "Return quantity exceeds available quantity.",
  "Return quantity exceeds remaining purchase quantity.",
  "Return quantity exceeds current stock.",
  "Return quantity exceeds returnable quantity.",
  "Return reason is required.",
  "Invalid return total.",
  "Purchase return not found.",
];

const statusFor = (error) =>
  known.includes(error.message) ? 400 : 500;

const getOptions = async (req, res) => {
  try {
    const data = await purchaseReturnService.getOptions();
    res.json({ success: true, ...data });
  } catch (error) {
    console.error("[Purchase Return] options:", error);
    res
      .status(statusFor(error))
      .json({ success: false, message: error.message });
  }
};

const getSupplierPurchases = async (req, res) => {
  try {
    const supplierId = Number(req.query.supplier_id);

    const purchases =
      await purchaseReturnService.getSupplierPurchases(
        supplierId,
      );

    res.json({ success: true, purchases });
  } catch (error) {
    console.error(
      "[Purchase Return] supplier purchases:",
      error,
    );

    res
      .status(statusFor(error))
      .json({ success: false, message: error.message });
  }
};

const getPurchaseItems = async (req, res) => {
  try {
    const purchaseId = Number(req.params.purchaseId);

    const items =
      await purchaseReturnService.getPurchaseReturnableItems(
        purchaseId,
      );

    res.json({ success: true, items });
  } catch (error) {
    console.error(
      "[Purchase Return] purchase items:",
      error,
    );

    res
      .status(statusFor(error))
      .json({ success: false, message: error.message });
  }
};

const getReturns = async (req, res) => {
  try {
    const returns =
      await purchaseReturnService.getReturns();

    res.json({ success: true, returns });
  } catch (error) {
    console.error("[Purchase Return] list:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load purchase returns.",
    });
  }
};

const getReturn = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Purchase return not found.");
    }

    const data =
      await purchaseReturnService.getReturnById(id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Purchase return not found.",
      });
    }

    res.json({
      success: true,
      return: data,
    });
  } catch (error) {
    res
      .status(statusFor(error))
      .json({
        success: false,
        message: error.message,
      });
  }
};

const createReturn = async (req, res) => {
  try {
    const data =
      await purchaseReturnService.createReturn(
        req.body,
        {
          userId: getUserId(req),
          ipAddress: getIpAddress(req),
        },
      );

    res.status(201).json({
      success: true,
      message: "Purchase return created successfully.",
      return: data,
    });
  } catch (error) {
    console.error("[Purchase Return] create:", error);

    res
      .status(statusFor(error))
      .json({
        success: false,
        message: error.message,
      });
  }
};

const updateReturn = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const data =
      await purchaseReturnService.updateReturn(
        id,
        req.body,
        {
          userId: getUserId(req),
          ipAddress: getIpAddress(req),
        },
      );

    res.json({
      success: true,
      message: "Purchase return updated successfully.",
      return: data,
    });
  } catch (error) {
    console.error("[Purchase Return] update:", error);

    res
      .status(statusFor(error))
      .json({
        success: false,
        message: error.message,
      });
  }
};

const deleteReturn = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const data =
      await purchaseReturnService.deleteReturn(
        id,
        {
          userId: getUserId(req),
          ipAddress: getIpAddress(req),
        },
      );

    res.json({
      success: true,
      message:
        "Purchase return deleted and stock movement reversed.",
      return: data,
    });
  } catch (error) {
    console.error("[Purchase Return] delete:", error);

    res
      .status(statusFor(error))
      .json({
        success: false,
        message: error.message,
      });
  }
};

module.exports = {
  getOptions,
  getSupplierPurchases,
  getPurchaseItems,
  getReturns,
  getReturn,
  createReturn,
  updateReturn,
  deleteReturn,
};
