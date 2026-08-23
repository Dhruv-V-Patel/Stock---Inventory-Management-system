const productsService = require("../services/productsService");
const {
  getIpAddress, getUserId
} = require("../utils/requestUtils");


const listProducts = async (req, res) => {
  try {
    const products = await productsService.listProducts();

    return res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("[Products Controller] list:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load products.",
    });
  }
};

const getProduct = async (req, res) => {
  try {
    const product = await productsService.getProduct(
      req.params.id
    );

    console.log("Get Product controller called");

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("[Products Controller] get:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : "Failed to load product.",
    });
  }
};

const createProduct = async (req, res) => {
  try {
    const product = await productsService.createProduct({
      body: req.body || {},
      userId: getUserId(req),
      ipAddress: getIpAddress(req),
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully.",
      product,
    });
  } catch (error) {
    console.error("[Products Controller] create:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Product code already exists.",
        field: "code",
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : "Failed to create product.",
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const product = await productsService.updateProduct({
      id: req.params.id,
      body: req.body || {},
      userId: getUserId(req),
      ipAddress: getIpAddress(req),
    });

    return res.status(200).json({
      success: true,
      message: "Product updated successfully.",
      product,
    });
  } catch (error) {
    console.error("[Products Controller] update:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Product code already exists.",
        field: "code",
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : "Failed to update product.",
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    await productsService.deleteProduct({
      id: req.params.id,
      userId: getUserId(req),
      ipAddress: getIpAddress(req),
    });

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully.",
    });
  } catch (error) {
    console.error("[Products Controller] delete:", error);

    if (error.code === "PRODUCT_IN_USE") {
      return res.status(409).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    }

    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "Product is already referenced by another module. Deactivate it instead of deleting it.",
        code: "PRODUCT_IN_USE",
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : "Failed to delete product.",
    });
  }
};

const getProductSummary = async (req, res) => {
  try {
    const summary =
      await productsService.getProductSummary();

    return res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("[Products Controller] summary:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load product summary.",
    });
  }
};

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductSummary,
};