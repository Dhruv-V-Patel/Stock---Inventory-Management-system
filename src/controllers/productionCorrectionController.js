const correctionService = require("../services/productionCorrectionService");
const {
  getIpAddress,
  getUserId,
} = require("../utils/requestUtils");

/**
 * GET /consumption-corrections/options
 */
const getOptions = async (req, res) => {
  try {
    const data = await correctionService.getOptions();

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error(
      "Get consumption correction options error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to load consumption correction options.",
    });
  }
};

/**
 * GET /consumption-corrections/bom/:bomId/materials
 */
const getBomMaterials = async (req, res) => {
  try {
    const bomId = Number(req.params.bomId);

    if (!Number.isInteger(bomId) || bomId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid BOM ID.",
      });
    }

    const materials =
      await correctionService.getBomMaterials(bomId);

    return res.status(200).json({
      success: true,
      materials,
    });
  } catch (error) {
    console.error(
      "Get BOM materials for consumption correction error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to load BOM raw materials.",
    });
  }
};

/**
 * POST /consumption-corrections/find
 */
const findProductions = async (req, res) => {
  try {
    const productions =
      await correctionService.findProductions(req.body);

    return res.status(200).json({
      success: true,
      productions,
    });
  } catch (error) {
    console.error(
      "Find consumption correction productions error:",
      error,
    );

    const statusCode =
      error.message?.includes("required") ||
      error.message?.includes("Invalid") ||
      error.message?.includes("cannot") ||
      error.message?.includes("Please")
        ? 400
        : 500;

    return res.status(statusCode).json({
      success: false,
      message:
        error.message ||
        "Failed to find production batches.",
    });
  }
};

/**
 * POST /consumption-corrections/preview
 */
const previewCorrection = async (req, res) => {
  try {
    const preview =
      await correctionService.previewCorrection(req.body);

    return res.status(200).json({
      success: true,
      preview,
    });
  } catch (error) {
    console.error(
      "Consumption correction preview error:",
      error,
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Failed to generate correction preview.",
    });
  }
};

/**
 * POST /consumption-corrections
 */
const applyCorrection = async (req, res) => {
  try {
    const result =
      await correctionService.applyCorrection(
        req.body,
        {
          userId: getUserId(req),
          ipAddress: getIpAddress(req),
        },
      );

    return res.status(201).json({
      success: true,
      message:
        "Production consumption correction applied successfully.",
      ...result,
    });
  } catch (error) {
    console.error(
      "Apply consumption correction error:",
      error,
    );

    let statusCode = 500;

    if (
      error.message?.includes("required") ||
      error.message?.includes("Invalid") ||
      error.message?.includes("Please") ||
      error.message?.includes("already") ||
      error.message?.includes("different") ||
      error.message?.includes("no stock difference") ||
      error.message?.includes("Insufficient")
    ) {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      message:
        error.message ||
        "Failed to apply consumption correction.",
    });
  }
};

/**
 * GET /consumption-corrections
 */
const getCorrections = async (req, res) => {
  try {
    const corrections =
      await correctionService.getCorrections({
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
      });

    return res.status(200).json({
      success: true,
      corrections,
    });
  } catch (error) {
    console.error(
      "Get consumption corrections error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to load consumption correction history.",
    });
  }
};

/**
 * GET /consumption-corrections/:id
 */
const getCorrectionById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid correction ID.",
      });
    }

    const correction =
      await correctionService.getCorrectionById(id);

    if (!correction) {
      return res.status(404).json({
        success: false,
        message: "Consumption correction not found.",
      });
    }

    return res.status(200).json({
      success: true,
      correction,
    });
  } catch (error) {
    console.error(
      "Get consumption correction by ID error:",
      error,
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to load consumption correction.",
    });
  }
};

module.exports = {
  getOptions,
  getBomMaterials,
  findProductions,
  previewCorrection,
  applyCorrection,
  getCorrections,
  getCorrectionById,
};