const supplierService = require("../services/supplierService");
const { getIpAddress, getUserId } = require("../utils/requestUtils");

const getSuppliers = async (req, res) => {
  try {
    const { search = "", status = "" } = req.query;

    const data = await supplierService.listSuppliers({
      search,
      status
    });

    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("[Supplier] getSuppliers:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load suppliers."
    });
  }
};

const getSupplier = async (req, res) => {
  try {
    const supplier = await supplierService.getSupplierById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found."
      });
    }

    return res.json({
      success: true,
      data: supplier
    });
  } catch (error) {
    console.error("[Supplier] getSupplier:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load supplier."
    });
  }
};

const validateSupplier = (body) => {
  const name = String(body?.name ?? "").trim();
  const gstin = String(body?.gstin ?? "").trim().toUpperCase();
  const mobile = String(body?.mobile ?? "").trim();

  if (!name) {
    return "Supplier name is required.";
  }

  if (name.length > 150) {
    return "Supplier name cannot exceed 150 characters.";
  }

  if (mobile && !/^[0-9+\-\s()]{7,20}$/.test(mobile)) {
    return "Invalid mobile number.";
  }

  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
    return "GSTIN must contain exactly 15 alphanumeric characters.";
  }

  return null;
};

const createSupplier = async (req, res) => {
  try {
    const validationError = validateSupplier(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    const name = String(req.body.name).trim();

    const gstin = req.body.gstin
      ? String(req.body.gstin).trim().toUpperCase()
      : null;

    // Duplicate supplier name
    const nameExists =
      await supplierService.checkSupplierNameExists(name);

    if (nameExists) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_SUPPLIER_NAME",
        message: "A supplier with this name already exists."
      });
    }

    // Duplicate GSTIN
    if (gstin) {
      const gstinExists =
        await supplierService.checkSupplierGstinExists(gstin);

      if (gstinExists) {
        return res.status(409).json({
          success: false,
          code: "DUPLICATE_GSTIN",
          message: "A supplier with this GSTIN already exists."
        });
      }
    }

    const supplier = await supplierService.createSupplier({
      ...req.body,
      name: String(req.body.name).trim(),
      contact_person: req.body.contact_person
        ? String(req.body.contact_person).trim()
        : null,
      mobile: req.body.mobile ? String(req.body.mobile).trim() : null,
      gstin: req.body.gstin
        ? String(req.body.gstin).trim().toUpperCase()
        : null,
      address: req.body.address ? String(req.body.address).trim() : null,
      payment_terms: req.body.payment_terms
        ? String(req.body.payment_terms).trim()
        : null,
      is_active: req.body.is_active !== false,
      userId: getUserId(req),
      ipAddress: getIpAddress(req),
    });

    return res.status(201).json({
      success: true,
      message: "Supplier created successfully.",
      data: supplier
    });
  } catch (error) {
    console.error("[Supplier] createSupplier:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Invalid supplier data."
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create supplier."
    });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const validationError = validateSupplier(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }
    
    const name = String(req.body.name).trim();

    const gstin = req.body.gstin
      ? String(req.body.gstin).trim().toUpperCase()
      : null;

    // Duplicate supplier name
    const nameExists =
      await supplierService.checkSupplierNameExists(name, req.params.id);

    if (nameExists) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_SUPPLIER_NAME",
        message: "A supplier with this name already exists."
      });
    }

    // Duplicate GSTIN
    if (gstin) {
      const gstinExists =
        await supplierService.checkSupplierGstinExists(gstin, req.params.id);

      if (gstinExists) {
        return res.status(409).json({
          success: false,
          code: "DUPLICATE_GSTIN",
          message: "A supplier with this GSTIN already exists."
        });
      }
    }

    const supplier = await supplierService.updateSupplier(req.params.id, {
      ...req.body,
      name: String(req.body.name).trim(),
      contact_person: req.body.contact_person
        ? String(req.body.contact_person).trim()
        : null,
      mobile: req.body.mobile ? String(req.body.mobile).trim() : null,
      gstin: req.body.gstin
        ? String(req.body.gstin).trim().toUpperCase()
        : null,
      address: req.body.address ? String(req.body.address).trim() : null,
      payment_terms: req.body.payment_terms
        ? String(req.body.payment_terms).trim()
        : null,
      is_active: req.body.is_active !== false,
      userId: getUserId(req),
      ipAddress: getIpAddress(req),
    }
  );

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found."
      });
    }

    return res.json({
      success: true,
      message: "Supplier updated successfully.",
      data: supplier
    });
  } catch (error) {
    console.error("[Supplier] updateSupplier:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update supplier."
    });
  }
};

const removeSupplier = async (req, res) => {
  try {
    await supplierService.deleteSupplier(req.params.id,{
      userId: getUserId(req),
      ipAddress: getIpAddress(req),
    });

    return res.json({
      success: true,
      message: "Supplier deleted successfully."
    });
  } catch (error) {
    if (error.code === "SUPPLIER_IN_USE") {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }

    if (error.code === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message: "Supplier is referenced by another transaction and cannot be deleted."
      });
    }

    console.error("[Supplier] removeSupplier:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to delete supplier."
    });
  }
};

const getSummary = async (req, res) => {
  try {
    const data = await supplierService.getSupplierSummary();

    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("[Supplier] getSummary:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load supplier summary."
    });
  }
};

const checkSupplierName = async (req, res) => {
  try {
    const name = String(req.query.name ?? "").trim();
    const excludeId = req.query.excludeId || null;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Supplier name is required."
      });
    }

    const exists =
      await supplierService.checkSupplierNameExists(
        name,
        excludeId
      );

    return res.json({
      success: true,
      exists
    });
  } catch (error) {
    console.error(
      "[Supplier] checkSupplierName:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to check supplier name."
    });
  }
};

const checkSupplierGstin = async (req, res) => {
  try {
    const gstin = String(
      req.query.gstin ?? ""
    )
      .trim()
      .toUpperCase();

    const excludeId =
      req.query.excludeId || null;

    if (!gstin) {
      return res.json({
        success: true,
        exists: false
      });
    }

    const exists =
      await supplierService.checkSupplierGstinExists(
        gstin,
        excludeId
      );

    return res.json({
      success: true,
      exists
    });
  } catch (error) {
    console.error(
      "[Supplier] checkSupplierGstin:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to check GSTIN."
    });
  }
};

module.exports = {
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  removeSupplier,
  getSummary,
  checkSupplierName,
  checkSupplierGstin
};
