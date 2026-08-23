const productBomService = require("../services/productBomService");


/* ========================================
   GET ALL
======================================== */

const getProductBoms = async (req, res) => {
  try {
    const boms =
      await productBomService.getAllBoms();

    res.json({
      success: true,
      boms,
    });
  } catch (error) {
    // console.error(
    //   "[Product BOM Controller] GET:",
    //   error
    // );

    res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch product BOMs.",
    });
  }
};


/* ========================================
   GET BY ID
======================================== */

const getProductBomById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid BOM ID.",
      });
    }

    const bom =
      await productBomService.getBomById(id);

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: "Product BOM not found.",
      });
    }

    res.json({
      success: true,
      bom,
    });
  } catch (error) {
    console.error(
      "[Product BOM Controller] GET BY ID:",
      error
    );

    res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch product BOM.",
    });
  }
};


/* ========================================
   CREATE
======================================== */

const createProductBom = async (req, res) => {
  try {
    const {
      product_id,
      name,
      is_active = true,
      items,
    } = req.body;

    const productId = Number(product_id);

    if (
      !Number.isInteger(productId) ||
      productId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid product is required.",
      });
    }

    if (
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "BOM name is required.",
      });
    }

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({
        success: false,
        message:
          "At least one raw material is required.",
      });
    }

    const normalizedItems =
      normalizeItems(items);

    const bom =
      await productBomService.createBom({
        productId,
        name: name.trim(),
        isActive: Boolean(is_active),
        items: normalizedItems,
      });

    res.status(201).json({
      success: true,
      message:
        "Product BOM created successfully.",
      bom,
    });
  } catch (error) {
    console.error(
      "[Product BOM Controller] CREATE:",
      error
    );

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "A BOM with this name already exists for this product.",
      });
    }

    res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Failed to create product BOM.",
    });
  }
};


/* ========================================
   UPDATE
======================================== */

const updateProductBom = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid BOM ID.",
      });
    }

    const {
      product_id,
      name,
      is_active = true,
      items,
    } = req.body;

    const productId = Number(product_id);

    if (
      !Number.isInteger(productId) ||
      productId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid product is required.",
      });
    }

    if (
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "BOM name is required.",
      });
    }

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({
        success: false,
        message:
          "At least one raw material is required.",
      });
    }

    const normalizedItems =
      normalizeItems(items);

    const bom =
      await productBomService.updateBom({
        id,
        productId,
        name: name.trim(),
        isActive: Boolean(is_active),
        items: normalizedItems,
      });

    res.json({
      success: true,
      message:
        "Product BOM updated successfully.",
      bom,
    });
  } catch (error) {
    console.error(
      "[Product BOM Controller] UPDATE:",
      error
    );

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "A BOM with this name already exists for this product.",
      });
    }

    res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Failed to update product BOM.",
    });
  }
};


/* ========================================
   DELETE
======================================== */

const deleteProductBom = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid BOM ID.",
      });
    }

    await productBomService.deleteBom(id);

    res.json({
      success: true,
      message:
        "Product BOM deleted successfully.",
    });
  } catch (error) {
    console.error(
      "[Product BOM Controller] DELETE:",
      error
    );

    res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Failed to delete product BOM.",
    });
  }
};


/* ========================================
   NORMALIZE ITEMS
======================================== */

const normalizeItems = (items) => {
  const seen = new Set();

  return items.map((item) => {
    const rawMaterialId = Number(
      item.raw_material_id
    );

    const quantity = Number(item.quantity);

    if (
      !Number.isInteger(rawMaterialId) ||
      rawMaterialId <= 0
    ) {
      const error = new Error(
        "Invalid raw material."
      );

      error.statusCode = 400;

      throw error;
    }

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      const error = new Error(
        "Material quantity must be greater than zero."
      );

      error.statusCode = 400;

      throw error;
    }

    if (seen.has(rawMaterialId)) {
      const error = new Error(
        "The same raw material cannot be added more than once."
      );

      error.statusCode = 400;

      throw error;
    }

    seen.add(rawMaterialId);

    return {
      raw_material_id: rawMaterialId,
      quantity,
    };
  });
};


module.exports = {
  getProductBoms,
  getProductBomById,
  createProductBom,
  updateProductBom,
  deleteProductBom,
};