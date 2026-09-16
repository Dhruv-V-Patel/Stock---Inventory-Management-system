const expenseService = require("../services/expenseService");
const { getIpAddress, getUserId } = require("../utils/requestUtils");

const meta = (req) => ({
  userId: getUserId(req),
  ipAddress: getIpAddress(req),
});
const sendError = (res, error) => {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;
  if (status >= 500) console.error("[ExpenseController]", error);
  return res
    .status(status)
    .json({
      message: status >= 500 ? "An unexpected error occurred." : error.message,
    });
};

const listCategories = async (req, res) => {
  try {
    return res.json({ categories: await expenseService.listCategories() });
  } catch (e) {
    return sendError(res, e);
  }
};
const createCategory = async (req, res) => {
  try {
    return res
      .status(201)
      .json({
        message: "Expense category created successfully.",
        category: await expenseService.createCategory(req.body, meta(req)),
      });
  } catch (e) {
    return sendError(res, e);
  }
};
const updateCategory = async (req, res) => {
  try {
    return res.json({
      message: "Expense category updated successfully.",
      category: await expenseService.updateCategory(
        req.params.id,
        req.body,
        meta(req),
      ),
    });
  } catch (e) {
    return sendError(res, e);
  }
};
const deleteCategory = async (req, res) => {
  try {
    await expenseService.deleteCategory(req.params.id, meta(req));
    return res.json({ message: "Expense category deleted successfully." });
  } catch (e) {
    return sendError(res, e);
  }
};

const listBills = async (req, res) => {
  try {
    return res.json({ bills: await expenseService.listBills(req.query) });
  } catch (e) {
    return sendError(res, e);
  }
};
const getBill = async (req, res) => {
  try {
    const bill = await expenseService.getBill(req.params.id);
    if (!bill)
      return res.status(404).json({ message: "Expense bill not found." });
    return res.json({ bill });
  } catch (e) {
    return sendError(res, e);
  }
};
const createBill = async (req, res) => {
  try {
    return res
      .status(201)
      .json({
        message: "Expense bill created successfully.",
        bill: await expenseService.createBill(req.body, meta(req)),
      });
  } catch (e) {
    return sendError(res, e);
  }
};
const updateBill = async (req, res) => {
  try {
    return res.json({
      message: "Expense bill updated successfully.",
      bill: await expenseService.updateBill(req.params.id, req.body, meta(req)),
    });
  } catch (e) {
    return sendError(res, e);
  }
};
const deleteBill = async (req, res) => {
  try {
    await expenseService.deleteBill(req.params.id, meta(req));
    return res.json({ message: "Expense bill deleted successfully." });
  } catch (e) {
    return sendError(res, e);
  }
};

const listPayables = async (req, res) => {
  try {
    return res.json({ payables: await expenseService.listPayables() });
  } catch (e) {
    return sendError(res, e);
  }
};
const getReports = async (req, res) => {
  try {
    return res.json(await expenseService.getExpenseReport(req.query));
  } catch (e) {
    return sendError(res, e);
  }
};
const getOptions = async (req, res) => {
  try {
    return res.json(await expenseService.getOptions());
  } catch (e) {
    return sendError(res, e);
  }
};

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listBills,
  getBill,
  createBill,
  updateBill,
  deleteBill,
  listPayables,
  getReports,
  getOptions,
};
