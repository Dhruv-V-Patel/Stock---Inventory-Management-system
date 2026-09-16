const pool = require("../config/db");
const { createAuditLog } = require("./auditLogService");
const {
  applyAvailableExpenseAdvance,
  updateExpenseBillStatus,
} = require("./paymentService");

const EPS = 0.000001;
const toId = (v, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    const e = new Error(`Invalid ${label}.`);
    e.statusCode = 400;
    throw e;
  }
  return n;
};
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const err = (message, statusCode = 400) => {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
};

const listCategories = async () => {
  const { rows } = await pool.query(
    `SELECT id,name,is_active,created_at,updated_at FROM expense_categories ORDER BY name,id`,
  );
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    is_active: Boolean(r.is_active),
  }));
};

const createCategory = async (body, meta = {}) => {
  const name = String(body?.name || "").trim();
  if (!name) throw err("Category name is required.");
  const { rows } = await pool.query(
    `INSERT INTO expense_categories(name,is_active) VALUES($1,TRUE) RETURNING *`,
    [name],
  );
  await createAuditLog({
    action: "CREATE",
    module: "EXPENSE_CATEGORY",
    recordId: rows[0].id,
    userId: meta.userId,
    ipAddress: meta.ipAddress,
  }).catch(() => {});
  return rows[0];
};

const updateCategory = async (id, body, meta = {}) => {
  id = toId(id, "category");
  const name = String(body?.name || "").trim();
  if (!name) throw err("Category name is required.");
  const active =
    body?.is_active === false || body?.is_active === "false" ? false : true;
  const { rows } = await pool.query(
    `UPDATE expense_categories SET name=$1,is_active=$2,updated_at=NOW() WHERE id=$3 RETURNING *`,
    [name, active, id],
  );
  if (!rows.length) throw err("Expense category not found.", 404);
  await createAuditLog({
    action: "UPDATE",
    module: "EXPENSE_CATEGORY",
    recordId: id,
    userId: meta.userId,
    ipAddress: meta.ipAddress,
  }).catch(() => {});
  return rows[0];
};

const deleteCategory = async (id, meta = {}) => {
  id = toId(id, "category");
  const used = await pool.query(
    `SELECT 1 FROM expense_bills WHERE category_id=$1 LIMIT 1`,
    [id],
  );
  if (used.rows.length)
    throw err(
      "Category is already used in an expense bill. Deactivate it instead.",
    );
  const result = await pool.query(
    `DELETE FROM expense_categories WHERE id=$1`,
    [id],
  );
  if (!result.rowCount) throw err("Expense category not found.", 404);
  await createAuditLog({
    action: "DELETE",
    module: "EXPENSE_CATEGORY",
    recordId: id,
    userId: meta.userId,
    ipAddress: meta.ipAddress,
  }).catch(() => {});
};

const nextExpenseNo = async (client) => {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(id),0)+1 AS next_id FROM expense_bills`,
  );
  return `EXP-${String(rows[0].next_id).padStart(5, "0")}`;
};

const billSelect = `
SELECT eb.id, eb.expense_no, eb.category_id, ec.name AS category_name,
       eb.vendor_name, eb.bill_number, eb.bill_date, eb.due_date,
       eb.total_amount,
       COALESCE((SELECT SUM(epa.allocated_amount) FROM expense_payment_allocations epa WHERE epa.expense_bill_id=eb.id),0) AS paid_amount,
       GREATEST(eb.total_amount-COALESCE((SELECT SUM(epa.allocated_amount) FROM expense_payment_allocations epa WHERE epa.expense_bill_id=eb.id),0),0) AS due_amount,
       eb.payment_status, eb.remarks, eb.created_at, eb.updated_at
FROM expense_bills eb
LEFT JOIN expense_categories ec ON ec.id=eb.category_id`;

const listBills = async (filters = {}) => {
  const where = [],
    params = [];
  if (filters.category_id) {
    params.push(toId(filters.category_id, "category"));
    where.push(`eb.category_id=$${params.length}`);
  }
  if (filters.status) {
    params.push(String(filters.status).toUpperCase());
    where.push(`eb.payment_status=$${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    where.push(
      `(eb.expense_no ILIKE $${params.length} OR COALESCE(eb.vendor_name,'') ILIKE $${params.length} OR COALESCE(eb.bill_number,'') ILIKE $${params.length})`,
    );
  }
  if (filters.from_date) {
    params.push(filters.from_date);
    where.push(`eb.bill_date >= $${params.length}`);
  }
  if (filters.to_date) {
    params.push(filters.to_date);
    where.push(`eb.bill_date <= $${params.length}`);
  }
  const { rows } = await pool.query(
    `${billSelect} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY eb.bill_date DESC,eb.id DESC`,
    params,
  );
  return rows.map(normalizeBill);
};

const normalizeBill = (r) => ({
  ...r,
  id: Number(r.id),
  category_id: Number(r.category_id),
  total_amount: num(r.total_amount),
  paid_amount: num(r.paid_amount),
  due_amount: num(r.due_amount),
});

const getBill = async (id) => {
  id = toId(id, "expense bill");
  const { rows } = await pool.query(`${billSelect} WHERE eb.id=$1`, [id]);
  return rows[0] ? normalizeBill(rows[0]) : null;
};

const validateBill = (body) => {
  const categoryId = toId(body?.category_id, "category");
  const vendor = String(body?.vendor_name || "").trim();
  const billDate = String(body?.bill_date || "").trim();
  const total = num(body?.total_amount, NaN);
  if (!vendor) throw err("Vendor / Paid To is required.");
  if (!billDate) throw err("Bill date is required.");
  if (!Number.isFinite(total) || total <= 0)
    throw err("Bill amount must be greater than zero.");
  return {
    categoryId,
    vendor,
    billNumber: String(body?.bill_number || "").trim() || null,
    billDate,
    dueDate: String(body?.due_date || "").trim() || null,
    total,
    remarks: String(body?.remarks || "").trim() || null,
  };
};

const createBill = async (body, meta = {}) => {
  const d = validateBill(body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const category = await client.query(
      `SELECT id FROM expense_categories WHERE id=$1 AND is_active=TRUE`,
      [d.categoryId],
    );
    if (!category.rows.length)
      throw err("Expense category not found or inactive.", 404);
    const expenseNo =
      String(body?.expense_no || "").trim() || (await nextExpenseNo(client));
    const inserted = await client.query(
      `INSERT INTO expense_bills(expense_no,category_id,vendor_name,bill_number,bill_date,due_date,total_amount,payment_status,remarks,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9) RETURNING id`,
      [
        expenseNo,
        d.categoryId,
        d.vendor,
        d.billNumber,
        d.billDate,
        d.dueDate,
        d.total,
        d.remarks,
        meta.userId || null,
      ],
    );
    const billId = Number(inserted.rows[0].id);
    await applyAvailableExpenseAdvance(client, billId);
    await updateExpenseBillStatus(client, billId);
    await client.query("COMMIT");
    await createAuditLog({
      action: "CREATE",
      module: "EXPENSE_BILL",
      recordId: billId,
      userId: meta.userId,
      ipAddress: meta.ipAddress,
    }).catch(() => {});
    return await getBill(billId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const updateBill = async (id, body, meta = {}) => {
  id = toId(id, "expense bill");
  const d = validateBill(body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const old = await client.query(
      `SELECT id,total_amount FROM expense_bills WHERE id=$1 FOR UPDATE`,
      [id],
    );
    if (!old.rows.length) throw err("Expense bill not found.", 404);
    const allocated = await client.query(
      `SELECT COALESCE(SUM(allocated_amount),0) AS paid FROM expense_payment_allocations WHERE expense_bill_id=$1`,
      [id],
    );
    const paid = num(allocated.rows[0].paid);
    if (d.total + EPS < paid)
      throw err(
        `Bill amount cannot be less than already paid amount ₹${paid.toFixed(2)}.`,
      );
    await client.query(
      `UPDATE expense_bills SET category_id=$1,vendor_name=$2,bill_number=$3,bill_date=$4,due_date=$5,total_amount=$6,remarks=$7,updated_at=NOW() WHERE id=$8`,
      [
        d.categoryId,
        d.vendor,
        d.billNumber,
        d.billDate,
        d.dueDate,
        d.total,
        d.remarks,
        id,
      ],
    );
    await updateExpenseBillStatus(client, id);
    await client.query("COMMIT");
    await createAuditLog({
      action: "UPDATE",
      module: "EXPENSE_BILL",
      recordId: id,
      userId: meta.userId,
      ipAddress: meta.ipAddress,
    }).catch(() => {});
    return await getBill(id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const deleteBill = async (id, meta = {}) => {
  id = toId(id, "expense bill");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT id,payment_status FROM expense_bills WHERE id=$1 FOR UPDATE`,
      [id],
    );
    if (!r.rows.length) throw err("Expense bill not found.", 404);
    const a = await client.query(
      `SELECT COUNT(*)::int AS count FROM expense_payment_allocations WHERE expense_bill_id=$1`,
      [id],
    );
    if (Number(a.rows[0].count) > 0)
      throw err(
        "Cannot delete an expense bill that has payment allocations. Reverse/delete the payments first.",
      );
    await client.query(`DELETE FROM expense_bills WHERE id=$1`, [id]);
    await client.query("COMMIT");
    await createAuditLog({
      action: "DELETE",
      module: "EXPENSE_BILL",
      recordId: id,
      userId: meta.userId,
      ipAddress: meta.ipAddress,
    }).catch(() => {});
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const listPayables = async () =>
  listBills({ status: "PENDING" }).then(async (pending) => {
    const partial = await listBills({ status: "PARTIAL" });
    return [...pending, ...partial].sort(
      (a, b) =>
        new Date(a.due_date || a.bill_date) -
        new Date(b.due_date || b.bill_date),
    );
  });

// const getDashboard = async (filters = {}) => {
//   const params = [];
//   const where = [];
//   if (filters.from_date) {
//     params.push(filters.from_date);
//     where.push(`eb.bill_date >= $${params.length}`);
//   }
//   if (filters.to_date) {
//     params.push(filters.to_date);
//     where.push(`eb.bill_date <= $${params.length}`);
//   }
//   const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
//   const [summary, category, monthly] = await Promise.all([
//     pool.query(
//       `SELECT COUNT(*)::int bill_count,COALESCE(SUM(total_amount),0) total_billed,COALESCE(SUM(paid),0) total_paid,COALESCE(SUM(GREATEST(total_amount-paid,0)),0) total_due FROM (SELECT eb.*,COALESCE((SELECT SUM(allocated_amount) FROM expense_payment_allocations epa WHERE epa.expense_bill_id=eb.id),0) paid FROM expense_bills eb ${w}) x`,
//       params,
//     ),
//     pool.query(
//       `SELECT ec.name,COUNT(eb.id)::int bill_count,COALESCE(SUM(eb.total_amount),0) total_billed,COALESCE(SUM(COALESCE((SELECT SUM(allocated_amount) FROM expense_payment_allocations epa WHERE epa.expense_bill_id=eb.id),0)),0) total_paid FROM expense_bills eb JOIN expense_categories ec ON ec.id=eb.category_id ${w} GROUP BY ec.id,ec.name ORDER BY total_billed DESC`,
//       params,
//     ),
//     pool.query(
//       `SELECT TO_CHAR(eb.bill_date,'YYYY-MM') month,COALESCE(SUM(eb.total_amount),0) total_billed,COALESCE(SUM(COALESCE((SELECT SUM(allocated_amount) FROM expense_payment_allocations epa WHERE epa.expense_bill_id=eb.id),0)),0) total_paid FROM expense_bills eb ${w} GROUP BY 1 ORDER BY 1`,
//       params,
//     ),
//   ]);
//   return {
//     summary: {
//       bill_count: Number(summary.rows[0].bill_count),
//       total_billed: num(summary.rows[0].total_billed),
//       total_paid: num(summary.rows[0].total_paid),
//       total_due: num(summary.rows[0].total_due),
//     },
//     by_category: category.rows.map((r) => ({
//       ...r,
//       bill_count: Number(r.bill_count),
//       total_billed: num(r.total_billed),
//       total_paid: num(r.total_paid),
//       total_due: Math.max(num(r.total_billed) - num(r.total_paid), 0),
//     })),
//     monthly: monthly.rows.map((r) => ({
//       ...r,
//       total_billed: num(r.total_billed),
//       total_paid: num(r.total_paid),
//       total_due: Math.max(num(r.total_billed) - num(r.total_paid), 0),
//     })),
//   };
// };

const getExpenseReport = async ({
  search = "",
  category_id = "",
  payment_status = "",
  from_date = "",
  to_date = "",
} = {}) => {
  const params = [];
  const where = ["1 = 1"];

  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  // -----------------------------
  // Category Filter
  // -----------------------------
  if (category_id) {
    where.push(
      `eb.category_id = ${addParam(Number(category_id))}`
    );
  }

  // -----------------------------
  // Payment Status Filter
  // -----------------------------
  if (payment_status) {
    where.push(
      `eb.payment_status = ${addParam(
        String(payment_status).toUpperCase()
      )}`
    );
  }

  // -----------------------------
  // Date From
  // -----------------------------
  if (from_date) {
    where.push(
      `eb.bill_date >= ${addParam(from_date)}::date`
    );
  }

  // -----------------------------
  // Date To
  // -----------------------------
  if (to_date) {
    where.push(
      `eb.bill_date <= ${addParam(to_date)}::date`
    );
  }

  // -----------------------------
  // Search
  // -----------------------------
  if (search) {
    const searchParam = addParam(
      `%${String(search).trim()}%`
    );

    where.push(`
      (
        eb.expense_no ILIKE ${searchParam}
        OR COALESCE(eb.vendor_name, '') ILIKE ${searchParam}
        OR COALESCE(eb.bill_number, '') ILIKE ${searchParam}
        OR COALESCE(ec.name, '') ILIKE ${searchParam}
      )
    `);
  }

  // =========================================================
  // EXPENSE ENTRIES
  // =========================================================

  const expenseQuery = `
    SELECT
      eb.id,
      eb.expense_no,

      eb.category_id,
      ec.name AS category_name,

      eb.vendor_name,
      eb.bill_number,

      eb.bill_date::text AS bill_date,
      eb.due_date::text AS due_date,

      eb.total_amount,

      COALESCE(
        pay.paid_amount,
        0
      )::numeric AS paid_amount,

      GREATEST(
        eb.total_amount -
        COALESCE(pay.paid_amount, 0),
        0
      )::numeric AS due_amount,

      eb.payment_status,
      eb.remarks,

      eb.created_at,
      eb.updated_at

    FROM expense_bills eb

    LEFT JOIN expense_categories ec
      ON ec.id = eb.category_id

    LEFT JOIN (
      SELECT
        expense_bill_id,
        SUM(allocated_amount)::numeric AS paid_amount

      FROM expense_payment_allocations

      GROUP BY expense_bill_id
    ) pay
      ON pay.expense_bill_id = eb.id

    WHERE ${where.join(" AND ")}

    ORDER BY
      eb.bill_date DESC,
      eb.id DESC
  `;

  const { rows } = await pool.query(
    expenseQuery,
    params
  );

  // =========================================================
  // NORMALIZE
  // =========================================================

  const normalizedRows = rows.map((row) => ({
    ...row,

    id: Number(row.id),

    category_id: row.category_id
      ? Number(row.category_id)
      : null,

    total_amount: num(row.total_amount),

    paid_amount: num(row.paid_amount),

    due_amount: Math.max(
      num(row.total_amount) -
        num(row.paid_amount),
      0
    ),
  }));

  // =========================================================
  // SUMMARY
  // =========================================================

  const summary = normalizedRows.reduce(
    (acc, row) => {
      acc.totalBills += 1;

      acc.totalBilled += row.total_amount;

      acc.totalPaid += row.paid_amount;

      acc.totalDue += row.due_amount;

      if (row.payment_status === "PAID") {
        acc.paidBills += 1;
      }

      if (row.payment_status === "PENDING") {
        acc.pendingBills += 1;
      }

      if (row.payment_status === "PARTIAL") {
        acc.partialBills += 1;
      }

      return acc;
    },
    {
      totalBills: 0,
      totalBilled: 0,
      totalPaid: 0,
      totalDue: 0,

      paidBills: 0,
      pendingBills: 0,
      partialBills: 0,
    }
  );

  // =========================================================
  // CATEGORY WISE
  // =========================================================

  const categoryMap = new Map();

  for (const row of normalizedRows) {
    const categoryId = row.category_id || 0;

    const categoryName =
      row.category_name || "Uncategorized";

    if (!categoryMap.has(categoryId)) {
      categoryMap.set(categoryId, {
        category_id: categoryId,
        category_name: categoryName,

        bill_count: 0,

        total_billed: 0,
        total_paid: 0,
        total_due: 0,
      });
    }

    const item = categoryMap.get(categoryId);

    item.bill_count += 1;

    item.total_billed += row.total_amount;

    item.total_paid += row.paid_amount;

    item.total_due += row.due_amount;
  }

  const categoryWise = Array.from(
    categoryMap.values()
  ).sort(
    (a, b) =>
      b.total_billed -
      a.total_billed
  );

  // =========================================================
  // MONTHLY
  // =========================================================

  const monthlyMap = new Map();

  for (const row of normalizedRows) {
    if (!row.bill_date) continue;

    const month = String(row.bill_date).slice(
      0,
      7
    );

    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, {
        month,

        bill_count: 0,

        total_billed: 0,
        total_paid: 0,
        total_due: 0,
      });
    }

    const item = monthlyMap.get(month);

    item.bill_count += 1;

    item.total_billed += row.total_amount;

    item.total_paid += row.paid_amount;

    item.total_due += row.due_amount;
  }

  const monthly = Array.from(
    monthlyMap.values()
  ).sort(
    (a, b) =>
      a.month.localeCompare(b.month)
  );

  // =========================================================
  // RETURN
  // =========================================================

  return {
  summary: {
    total_bills: Number(summary.totalBills || 0),
    total_billed: Number(summary.totalBilled || 0),
    total_paid: Number(summary.totalPaid || 0),
    total_due: Number(summary.totalDue || 0),

    paid_bills: Number(summary.paidBills || 0),
    pending_bills: Number(summary.pendingBills || 0),
    partial_bills: Number(summary.partialBills || 0),
  },

  rows: normalizedRows,

  by_category: categoryWise.map((row) => ({
    category_id: Number(row.category_id || 0),
    name: row.category_name || "Uncategorized",
    category_name: row.category_name || "Uncategorized",

    bill_count: Number(row.bill_count || 0),

    total_billed: Number(row.total_billed || 0),
    total_paid: Number(row.total_paid || 0),
    total_due: Number(row.total_due || 0),
  })),

  monthly: monthly.map((row) => ({
    month: row.month,

    bill_count: Number(row.bill_count || 0),

    total_billed: Number(row.total_billed || 0),
    total_paid: Number(row.total_paid || 0),
    total_due: Number(row.total_due || 0),
  })),
};
};

const getOptions = async () => {
  const [categories, vendors] = await Promise.all([
    pool.query(
      `SELECT id,name FROM expense_categories WHERE is_active=TRUE ORDER BY name,id`,
    ),
    pool.query(
      `SELECT id,name FROM suppliers WHERE is_active=TRUE ORDER BY name,id`,
    ),
  ]);
  return {
    categories: categories.rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
    })),
    suppliers: vendors.rows.map((r) => ({ id: Number(r.id), name: r.name })),
  };
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
  // getDashboard,
  getExpenseReport,
  getOptions,
};
