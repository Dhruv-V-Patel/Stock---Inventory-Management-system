const service = require("../services/auditLogService");
const status = (e) => (Number.isInteger(e?.statusCode) ? e.statusCode : 500);
const getAuditLogs = async (req, res) => {
  try {
    res.json({ success: true, ...(await service.getAuditLogs(req.query)) });
  } catch (e) {
    console.error("[Audit Logs] list:", e);
    res
      .status(status(e))
      .json({ success: false, message: "Failed to load audit logs." });
  }
};
const getSummary = async (req, res) => {
  try {
    res.json({ success: true, summary: await service.getAuditSummary() });
  } catch (e) {
    console.error("[Audit Logs] summary:", e);
    res
      .status(status(e))
      .json({ success: false, message: "Failed to load audit log summary." });
  }
};
const getOptions = async (req, res) => {
  try {
    res.json({ success: true, ...(await service.getAuditOptions()) });
  } catch (e) {
    console.error("[Audit Logs] options:", e);
    res
      .status(status(e))
      .json({ success: false, message: "Failed to load audit log filters." });
  }
};
const getAuditLog = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res
        .status(400)
        .json({ success: false, message: "Invalid audit log id." });
    const log = await service.getAuditLogById(id);
    if (!log)
      return res
        .status(404)
        .json({ success: false, message: "Audit log not found." });
    res.json({ success: true, log });
  } catch (e) {
    console.error("[Audit Logs] details:", e);
    res
      .status(status(e))
      .json({ success: false, message: "Failed to load audit log details." });
  }
};
module.exports = { getAuditLogs, getSummary, getOptions, getAuditLog };
