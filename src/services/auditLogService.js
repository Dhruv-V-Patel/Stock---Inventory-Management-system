const pool = require("../config/db");

const pageOf = (v) =>
  Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : 1;
const sizeOf = (v) =>
  Math.min(100, Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : 30);

const filters = (q = {}) => {
  const values = [];
  const where = [];
  const add = (sql, value) => {
    values.push(value);
    where.push(sql.replace("$V", `$${values.length}`));
  };
  const search = String(q.search || "").trim();
  if (search) {
    values.push(`%${search}%`);
    const p = `$${values.length}`;
    where.push(
      `(CAST(al.id AS TEXT) ILIKE ${p} OR COALESCE(al.action,'') ILIKE ${p} OR COALESCE(al.module,'') ILIKE ${p} OR COALESCE(CAST(al.record_id AS TEXT),'') ILIKE ${p} OR COALESCE(u.name,'') ILIKE ${p} OR COALESCE(u.email,'') ILIKE ${p} OR COALESCE(CAST(al.ip_address AS TEXT),'') ILIKE ${p})`,
    );
  }
  const uid = Number(q.user_id);
  if (Number.isInteger(uid) && uid > 0) add("al.user_id = $V", uid);
  if (q.action) add("UPPER(al.action) = $V", String(q.action).toUpperCase());
  if (q.module) add("al.module = $V", String(q.module));
  if (q.from) add("al.created_at >= $V::date", String(q.from));
  if (q.to) add("al.created_at < ($V::date + INTERVAL '1 day')", String(q.to));
  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", values };
};

const getAuditLogs = async (q = {}) => {
  const page = pageOf(q.page),
    pageSize = sizeOf(q.pageSize),
    offset = (page - 1) * pageSize;
  const { where, values } = filters(q);
  const count = await pool.query(
    `SELECT COUNT(*)::int total FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${where}`,
    values,
  );
  const total = Number(count.rows[0]?.total || 0);
  const result = await pool.query(
    `
    SELECT al.id, al.user_id, al.action, al.module, al.record_id, al.old_data, al.new_data,
           al.ip_address, al.created_at, u.name user_name, u.email user_email
    FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id ${where}
    ORDER BY al.created_at DESC, al.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `,
    [...values, pageSize, offset],
  );
  return {
    logs: result.rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      from: total ? offset + 1 : 0,
      to: Math.min(offset + result.rows.length, total),
    },
  };
};

const getAuditSummary = async () => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE created_at >= CURRENT_DATE)::int today, COUNT(*) FILTER(WHERE UPPER(action)='UPDATE')::int updates, COUNT(*) FILTER(WHERE UPPER(action)='DELETE')::int deletes FROM audit_logs`,
  );
  return rows[0] || { total: 0, today: 0, updates: 0, deletes: 0 };
};

const getAuditLogById = async (id) => {
  const { rows } = await pool.query(
    `SELECT al.id,al.user_id,al.action,al.module,al.record_id,al.old_data,al.new_data,al.ip_address,al.created_at,u.name user_name,u.email user_email FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id WHERE al.id=$1`,
    [id],
  );
  return rows[0] || null;
};

const getAuditOptions = async () => {
  const [users, modules, actions] = await Promise.all([
    pool.query("SELECT id,name,email FROM users ORDER BY name,id"),
    pool.query(
      "SELECT DISTINCT module FROM audit_logs WHERE module IS NOT NULL AND TRIM(module)<>'' ORDER BY module",
    ),
    pool.query(
      "SELECT DISTINCT UPPER(action) action FROM audit_logs WHERE action IS NOT NULL AND TRIM(action)<>'' ORDER BY action",
    ),
  ]);
  return {
    users: users.rows,
    modules: modules.rows.map((r) => r.module),
    actions: actions.rows.map((r) => r.action),
  };
};


const createAuditLog = async ({
  userId = null,
  module,
  action,
  recordId = null,
  oldData = null,
  newData = null,
  ipAddress = null
}) => {
  if (!module) {
    throw new Error("Audit log module is required.");
  }

  if (!action) {
    throw new Error("Audit log action is required.");
  }

  await pool.query(
    `
      INSERT INTO audit_logs (
        user_id,
        module,
        action,
        record_id,
        old_data,
        new_data,
        ip_address
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5::jsonb,
        $6::jsonb,
        $7
      )
    `,
    [
      userId,
      module,
      action,
      recordId,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      ipAddress
    ],
  );
};


module.exports = {
  getAuditLogs,
  getAuditSummary,
  getAuditLogById,
  getAuditOptions,
  createAuditLog,
};
