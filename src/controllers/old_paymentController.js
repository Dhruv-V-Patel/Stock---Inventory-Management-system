const paymentService = require("../services/paymentService");
const { getIpAddress, getUserId } = require("../utils/requestUtils");


// const getUserId = (req) =>
//   req.user?.id ?? req.user?.userId ?? req.auth?.id ?? null;

const sendError = (res, error) => {
  const statusCode =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;
  if (statusCode >= 500) console.error("[PaymentController]", error);
  return res
    .status(statusCode)
    .json({
      message:
        statusCode >= 500
          ? "An unexpected error occurred while processing the payment."
          : error.message,
    });
};

const listPayments = async (req, res) => {
  try {
    return res.json({ payments: await paymentService.listPayments() });
  } catch (e) {
    return sendError(res, e);
  }
};
const getOptions = async (req, res) => {
  try {
    return res.json(await paymentService.getOptions());
  } catch (e) {
    return sendError(res, e);
  }
};
const getPayment = async (req, res) => {
  try {
    const payment = await paymentService.getPaymentById(req.params.id);
    if (!payment)
      return res.status(404).json({ message: "Payment not found." });
    return res.json({ payment });
  } catch (e) {
    return sendError(res, e);
  }
};
const createPayment = async (req, res) => {
  try {
    const payment = await paymentService.createPayment(
      req.body,
      { userId: getUserId(req), ipAddress: getIpAddress(req),}
    );
    return res
      .status(201)
      .json({ message: "Payment created successfully.", payment });
  } catch (e) {
    return sendError(res, e);
  }
};
const updatePayment = async (req, res) => {
  try {
    const payment = await paymentService.updatePayment(
      req.params.id,
      req.body,
      { userId: getUserId(req), ipAddress: getIpAddress(req),},
    );
    return res.json({ message: "Payment updated successfully.", payment });
  } catch (e) {
    return sendError(res, e);
  }
};
const deletePayment = async (req, res) => {
  try {
    const result = await paymentService.deletePayment(
      req.params.id,
      { userId: getUserId(req), ipAddress: getIpAddress(req),}
    );
    return res.json({
      message: `Payment ${result.payment_no} deleted successfully.`,
      ...result,
    });
  } catch (e) {
    return sendError(res, e);
  }
};
module.exports = {
  listPayments,
  getOptions,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
};
