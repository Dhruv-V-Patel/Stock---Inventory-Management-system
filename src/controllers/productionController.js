const productionService = require("../services/productionService");
const { getIpAddress, getUserId } = require("../utils/requestUtils");


const getProductions = async (req, res) => {
  try {
    const productions = await productionService.getProductions();

    return res.status(200).json({
      success: true,
      productions,
    });
  } catch (error) {
    console.error("Get productions error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load productions.",
    });
  }
};


const getProducts = async (req, res) => {
  try {
    const products = await productionService.getProducts();

    return res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Get production products error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load products.",
    });
  }
};


const getProductionById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid production ID.",
      });
    }

    const production = await productionService.getProductionById(id);

    if (!production) {
      return res.status(404).json({
        success: false,
        message: "Production batch not found.",
      });
    }

    return res.status(200).json({
      success: true,
      production,
    });
  } catch (error) {
    console.error("Get production by ID error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load production.",
    });
  }
};


const createProduction = async (req, res) => {
  try {
    const production = await productionService.createProduction(
      req.body,
      { userId: getUserId(req), ipAddress: getIpAddress(req),}
    );

    return res.status(201).json({
      success: true,
      message: "Production batch created successfully.",
      production,
    });
  } catch (error) {
    console.error("Create production error:", error);

    let statusCode = 500;

    if (
      error.message?.includes("required") ||
      error.message?.includes("Invalid") ||
      error.message?.includes("greater than zero") ||
      error.message?.includes("cannot exceed") ||
      error.message?.includes("Insufficient stock")
    ) {
      statusCode = 400;
    }

    if (error.message?.includes("not found")) {
      statusCode = 404;
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to create production.",
    });
  }
};


const updateProduction = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid production ID.",
      });
    }

    const production = await productionService.updateProduction(
      id,
      req.body,
      { userId: getUserId(req), ipAddress: getIpAddress(req),}
    );

    return res.status(200).json({
      success: true,
      message: "Production batch updated successfully.",
      production,
    });
  } catch (error) {
    console.error("Update production error:", error);

    const statusCode = error.message?.includes("not found") ? 404 : 400;

    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to update production.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| DELETE /api/production/:id
|--------------------------------------------------------------------------
*/

const deleteProduction = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid production ID.",
      });
    }

    const result = await productionService.deleteProduction(id, { userId: getUserId(req), ipAddress: getIpAddress(req),});

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("Delete production error:", error);

    const statusCode = error.message?.includes("not found")
      ? 404
      : error.message?.includes("linked with curing")
        ? 409
        : 500;

    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to delete production.",
    });
  }
};

module.exports = {
  getProductions,
  getProducts,
  // getProductBoms,
  getProductionById,
  createProduction,
  updateProduction,
  deleteProduction,
};
