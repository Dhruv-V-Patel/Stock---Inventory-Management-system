const customerService = require("../services/customerService");

const getCustomers = async (req, res) => {
  try {
    const { search = "", status = "" } = req.query;

    const data = await customerService.listCustomers({ search, status });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[Customer] getCustomers:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load customers.",
    });
  }
};

const getCustomer = async (req, res) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    return res.json({
      success: true,
      data: customer,
    });
  } catch (error) {
    console.error("[Customer] getCustomer:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load customer.",
    });
  }
};

const validateCustomer = (body) => {
  const name = String(body?.name ?? "").trim();
  const gstin = String(body?.gstin ?? "").trim().toUpperCase();
  const mobile = String(body?.mobile ?? "").trim();

  if (!name) {
    return "Customer name is required.";
  }

  if (name.length > 150) {
    return "Customer name cannot exceed 150 characters.";
  }

  if (mobile && !/^[0-9+\-\s()]{7,20}$/.test(mobile)) {
    return "Invalid mobile number.";
  }

  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
    return "GSTIN must contain exactly 15 alphanumeric characters.";
  }

  return null;
};

const normalizePayload = (body) => ({
  name: String(body.name ?? "").trim(),
  contact_person: body.contact_person
    ? String(body.contact_person).trim()
    : null,
  mobile: body.mobile ? String(body.mobile).trim() : null,
  gstin: body.gstin
    ? String(body.gstin).trim().toUpperCase()
    : null,
  address: body.address ? String(body.address).trim() : null,
  payment_terms: body.payment_terms
    ? String(body.payment_terms).trim()
    : null,
  is_active: body.is_active !== false,
});

const createCustomer = async (req, res) => {
  try {
    const validationError = validateCustomer(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const payload = normalizePayload(req.body);

    if (await customerService.checkCustomerNameExists(payload.name)) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_CUSTOMER_NAME",
        message: "A customer with this name already exists.",
      });
    }

    if (
      payload.gstin &&
      (await customerService.checkCustomerGstinExists(payload.gstin))
    ) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_GSTIN",
        message: "A customer with this GSTIN already exists.",
      });
    }

    const customer = await customerService.createCustomer(payload);

    return res.status(201).json({
      success: true,
      message: "Customer created successfully.",
      data: customer,
    });
  } catch (error) {
    console.error("[Customer] createCustomer:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Invalid customer data.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create customer.",
    });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const validationError = validateCustomer(req.body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const payload = normalizePayload(req.body);

    if (
      await customerService.checkCustomerNameExists(
        payload.name,
        req.params.id,
      )
    ) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_CUSTOMER_NAME",
        message: "A customer with this name already exists.",
      });
    }

    if (
      payload.gstin &&
      (await customerService.checkCustomerGstinExists(
        payload.gstin,
        req.params.id,
      ))
    ) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_GSTIN",
        message: "A customer with this GSTIN already exists.",
      });
    }

    const customer = await customerService.updateCustomer(
      req.params.id,
      payload,
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    return res.json({
      success: true,
      message: "Customer updated successfully.",
      data: customer,
    });
  } catch (error) {
    console.error("[Customer] updateCustomer:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update customer.",
    });
  }
};

const removeCustomer = async (req, res) => {
  try {
    await customerService.deleteCustomer(req.params.id);

    return res.json({
      success: true,
      message: "Customer deleted successfully.",
    });
  } catch (error) {
    if (error.code === "CUSTOMER_IN_USE") {
      return res.status(409).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    if (error.code === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "Customer is referenced by another transaction and cannot be deleted.",
      });
    }

    console.error("[Customer] removeCustomer:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete customer.",
    });
  }
};

const getSummary = async (req, res) => {
  try {
    const data = await customerService.getCustomerSummary();

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[Customer] getSummary:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load customer summary.",
    });
  }
};

const checkCustomerName = async (req, res) => {
  try {
    const name = String(req.query.name ?? "").trim();
    const excludeId = req.query.excludeId || null;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Customer name is required.",
      });
    }

    const exists = await customerService.checkCustomerNameExists(
      name,
      excludeId,
    );

    return res.json({
      success: true,
      exists,
    });
  } catch (error) {
    console.error("[Customer] checkCustomerName:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check customer name.",
    });
  }
};

const checkCustomerGstin = async (req, res) => {
  try {
    const gstin = String(req.query.gstin ?? "")
      .trim()
      .toUpperCase();

    const excludeId = req.query.excludeId || null;

    if (!gstin) {
      return res.json({
        success: true,
        exists: false,
      });
    }

    const exists = await customerService.checkCustomerGstinExists(
      gstin,
      excludeId,
    );

    return res.json({
      success: true,
      exists,
    });
  } catch (error) {
    console.error("[Customer] checkCustomerGstin:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check GSTIN.",
    });
  }
};

module.exports = {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  removeCustomer,
  getSummary,
  checkCustomerName,
  checkCustomerGstin,
};
