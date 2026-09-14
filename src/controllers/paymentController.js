const paymentService = require("../services/paymentService");
const {
  getIpAddress,
  getUserId,
} = require("../utils/requestUtils");


/* =========================================================
   ERROR HANDLER
   ========================================================= */

const sendError = (res, error) => {
  const statusCode =
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400
      ? error.statusCode
      : 500;

  if (statusCode >= 500) {
    console.error(
      "[PaymentController]",
      error,
    );
  }

  return res
    .status(statusCode)
    .json({
      message:
        statusCode >= 500
          ? "An unexpected error occurred while processing the payment."
          : error.message,
    });
};


/* =========================================================
   LIST PAYMENTS
   GET /api/payments
   ========================================================= */

const listPayments = async (
  req,
  res,
) => {
  try {
    const payments =
      await paymentService.listPayments();

    return res.json({
      payments,
    });
  } catch (error) {
    return sendError(
      res,
      error,
    );
  }
};


/* =========================================================
   PAYMENT OPTIONS
   GET /api/payments/options
   ========================================================= */

const getOptions = async (
  req,
  res,
) => {
  try {
    const options =
      await paymentService.getOptions();

    return res.json(
      options,
    );
  } catch (error) {
    return sendError(
      res,
      error,
    );
  }
};


/* =========================================================
   GET PAYMENT
   GET /api/payments/:id
   ========================================================= */

const getPayment = async (
  req,
  res,
) => {
  try {
    const payment =
      await paymentService.getPaymentById(
        req.params.id,
      );

    if (!payment) {
      return res
        .status(404)
        .json({
          message:
            "Payment not found.",
        });
    }

    return res.json({
      payment,
    });
  } catch (error) {
    return sendError(
      res,
      error,
    );
  }
};


/* =========================================================
   CREATE PAYMENT
   POST /api/payments
   ========================================================= */

const createPayment = async (
  req,
  res,
) => {
  try {
    const payment =
      await paymentService.createPayment(
        req.body,
        {
          userId:
            getUserId(req),

          ipAddress:
            getIpAddress(req),
        },
      );

    return res
      .status(201)
      .json({
        message:
          "Payment created successfully.",

        payment,
      });
  } catch (error) {
    return sendError(
      res,
      error,
    );
  }
};


/* =========================================================
   UPDATE PAYMENT
   PUT /api/payments/:id
   ========================================================= */

const updatePayment = async (
  req,
  res,
) => {
  try {
    const payment =
      await paymentService.updatePayment(
        req.params.id,
        req.body,
        {
          userId:
            getUserId(req),

          ipAddress:
            getIpAddress(req),
        },
      );

    return res.json({
      message:
        "Payment updated successfully.",

      payment,
    });
  } catch (error) {
    return sendError(
      res,
      error,
    );
  }
};


/* =========================================================
   DELETE PAYMENT
   DELETE /api/payments/:id
   ========================================================= */

const deletePayment = async (
  req,
  res,
) => {
  try {
    const result =
      await paymentService.deletePayment(
        req.params.id,
        {
          userId:
            getUserId(req),

          ipAddress:
            getIpAddress(req),
        },
      );

    return res.json({
      message:
        `Payment ${result.payment_no} deleted successfully.`,

      ...result,
    });
  } catch (error) {
    return sendError(
      res,
      error,
    );
  }
};


/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  listPayments,
  getOptions,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
};