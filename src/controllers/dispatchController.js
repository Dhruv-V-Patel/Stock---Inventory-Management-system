const dispatchService = require("../services/dispatchService");

const getSummary = async (req, res) => {
  try {
    const data = await dispatchService.getDispatchSummary();
    res.json({ success: true, data });
  } catch (error) {
    console.error("getDispatchSummary:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load dispatch summary.",
    });
  }
};

const getDispatches = async (req, res) => {
  try {
    const data = await dispatchService.listDispatches({
      search: req.query.search || "",
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error("getDispatches:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load dispatches.",
    });
  }
};

const getDispatch = async (req, res) => {
  try {
    const data = await dispatchService.getDispatchById(req.params.id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Dispatch not found.",
      });
    }

    return res.json({ success: true, data });
  } catch (error) {
    console.error("getDispatch:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load dispatch.",
    });
  }
};

const getOptions = async (req, res) => {
  try {
    const data = await dispatchService.getOptions();
    res.json({ success: true, data });
  } catch (error) {
    console.error("getDispatchOptions:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load dispatch options.",
    });
  }
};

const getSaleForDispatch = async (req, res) => {
  try {
    const data = await dispatchService.getSaleForDispatch(
      req.params.saleId,
      req.query.excludeDispatchId || null
    );

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Sale not found.",
      });
    }

    return res.json({ success: true, data });
  } catch (error) {
    console.error("getSaleForDispatch:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load sale.",
    });
  }
};

const createDispatch = async (req, res) => {
  try {
    const data = await dispatchService.createDispatch(
      req.body,
      req.user?.id || null
    );

    res.status(201).json({
      success: true,
      message: "Dispatch created successfully.",
      data,
    });
  } catch (error) {
    console.error("createDispatch:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create dispatch.",
    });
  }
};

const updateDispatch = async (req, res) => {
  try {
    const data = await dispatchService.updateDispatch(
      req.params.id,
      req.body
    );

    res.json({
      success: true,
      message: "Dispatch updated successfully.",
      data,
    });
  } catch (error) {
    console.error("updateDispatch:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update dispatch.",
    });
  }
};

const deleteDispatch = async (req, res) => {
  try {
    const data = await dispatchService.deleteDispatch(req.params.id);

    res.json({
      success: true,
      message: "Dispatch deleted successfully.",
      data,
    });
  } catch (error) {
    console.error("deleteDispatch:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to delete dispatch.",
    });
  }
};

module.exports = {
  getSummary,
  getDispatches,
  getDispatch,
  getOptions,
  getSaleForDispatch,
  createDispatch,
  updateDispatch,
  deleteDispatch,
};
