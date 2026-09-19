const quotationService = require("../services/quotationService");
const { getIpAddress, getUserId } = require("../utils/requestUtils");


const listQuotations = async (req, res, next) => {
  try {
    const quotations =
      await quotationService.listQuotations({
        search: req.query.search || "",
        customer_id:
          req.query.customer_id || "",
        from_date:
          req.query.from_date || "",
        to_date:
          req.query.to_date || "",
      });

    res.json({
      success: true,
      data: quotations,
    });
  } catch (error) {
    next(error);
  }
};


const getQuotationById = async (
  req,
  res,
  next,
) => {
  try {
    const quotation =
      await quotationService.getQuotationById(
        req.params.id,
      );

    res.json({
      success: true,
      data: quotation,
    });
  } catch (error) {
    next(error);
  }
};

/* ---------------------------------- */
/* Next Quotation Number              */
/* GET /api/quotations/next-number    */
/* ---------------------------------- */

const getNextQuotationNo = async (
  req,
  res,
  next,
) => {
  try {
    const quotationNo =
      await quotationService.getNextQuotationNo();

    res.json({
      success: true,
      data: {
        quotation_no: quotationNo,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ---------------------------------- */
/* Create Quotation                   */
/* POST /api/quotations               */
/* ---------------------------------- */

const createQuotation = async (
  req,
  res,
  next,
) => {
  try {
    const quotation =
      await quotationService.createQuotation({
        body: req.body,
        userId: getUserId(req),
        ipAddress: getIpAddress(req),
      });

    res.status(201).json({
      success: true,
      message: "Quotation created successfully.",
      data: quotation,
    });
  } catch (error) {
    next(error);
  }
};

/* ---------------------------------- */
/* Update Quotation                   */
/* PUT /api/quotations/:id            */
/* ---------------------------------- */

const updateQuotation = async (
  req,
  res,
  next,
) => {
  try {
    const quotation =
      await quotationService.updateQuotation({
        id: req.params.id,
        body: req.body,
        userId: getUserId(req),
        ipAddress: getIpAddress(req),
      });

    res.json({
      success: true,
      message: "Quotation updated successfully.",
      data: quotation,
    });
  } catch (error) {
    next(error);
  }
};

/* ---------------------------------- */
/* Delete Quotation                   */
/* DELETE /api/quotations/:id         */
/* ---------------------------------- */

const deleteQuotation = async (
  req,
  res,
  next,
) => {
  try {
    const result =
      await quotationService.deleteQuotation({
        id: req.params.id,
        userId: getUserId(req),
        ipAddress: getIpAddress(req),
      });

    res.json({
      success: true,
      message: "Quotation deleted successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/* ---------------------------------- */
/* Summary                            */
/* GET /api/quotations/summary        */
/* ---------------------------------- */

const getQuotationSummary = async (
  req,
  res,
  next,
) => {
  try {
    const summary =
      await quotationService.getQuotationSummary();

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

/* ================================== */
/* TERMS & CONDITIONS                  */
/* ================================== */

/* ---------------------------------- */
/* List Terms                         */
/* GET /api/quotations/terms          */
/* ---------------------------------- */

const listQuotationTerms = async (
  req,
  res,
  next,
) => {
  try {
    const terms =
      await quotationService.listQuotationTerms();

    res.json({
      success: true,
      data: terms,
    });
  } catch (error) {
    next(error);
  }
};

const getOptions = async (req, res, next) => {
  try {
    const options = await quotationService.getQuotationOptions();

    return res.status(200).json({
      success: true,
      ...options,
    });
  } catch (error) {
    console.error("[Quotation Controller] options:", error);
    next(error);
  }
};

const createQuotationTerm = async (
  req,
  res,
  next,
) => {
  try {
    const term =
      await quotationService.createQuotationTerm({
        term_text: req.body.term_text,
      });

    res.status(201).json({
      success: true,
      message: "Quotation term created successfully.",
      data: term,
    });
  } catch (error) {
    next(error);
  }
};

/* ---------------------------------- */
/* Update Term                        */
/* PUT /api/quotations/terms/:id      */
/* ---------------------------------- */

const updateQuotationTerm = async (
  req,
  res,
  next,
) => {
  try {
    const term =
      await quotationService.updateQuotationTerm({
        id: req.params.id,
        term_text: req.body.term_text,
        is_active: req.body.is_active,
        sort_order: req.body.sort_order,
      });

    res.json({
      success: true,
      message: "Quotation term updated successfully.",
      data: term,
    });
  } catch (error) {
    next(error);
  }
};

/* ---------------------------------- */
/* Delete Term                        */
/* DELETE /api/quotations/terms/:id   */
/* ---------------------------------- */

const deleteQuotationTerm = async (
  req,
  res,
  next,
) => {
  try {
    const term =
      await quotationService.deleteQuotationTerm(
        req.params.id,
      );

    res.json({
      success: true,
      message: "Quotation term deleted successfully.",
      data: term,
    });
  } catch (error) {
    next(error);
  }
};

/* ---------------------------------- */
/* Exports                            */
/* ---------------------------------- */

module.exports = {
  getOptions,
  listQuotations,
  getQuotationById,
  getNextQuotationNo,

  createQuotation,
  updateQuotation,
  deleteQuotation,

  getQuotationSummary,

  listQuotationTerms,
  createQuotationTerm,
  updateQuotationTerm,
  deleteQuotationTerm,
};