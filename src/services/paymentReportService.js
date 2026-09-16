const pool = require("../config/db");

const toNumber = (value) => Number(value ?? 0);

const addParam = (params, value) => {
  params.push(value);
  return `$${params.length}`;
};

const normalizePartyFilter = (value) => {
  if (!value) return null;

  const match = String(value).match(
    /^(CUSTOMER|SUPPLIER|EXPENSE):(\d+)$/i,
  );

  if (match) {
    return {
      type: match[1].toUpperCase(),
      id: Number(match[2]),
    };
  }

  if (/^\d+$/.test(String(value))) {
    return {
      type: "ANY",
      id: Number(value),
    };
  }

  return null;
};

const buildWhere = (filters = {}) => {
  const params = [];
  const where = ["1 = 1"];

  const {
    search = "",
    party_id = "",
    payment_type = "",
    payment_method = "",
    payment_mode = "",
    from_date = "",
    to_date = "",
  } = filters;

  if (search?.trim()) {
    const p = addParam(params, `%${search.trim()}%`);

    where.push(`
      (
        COALESCE(p.payment_no, '') ILIKE ${p}
        OR COALESCE(p.reference_no, '') ILIKE ${p}
        OR COALESCE(p.remarks, '') ILIKE ${p}
        OR COALESCE(c.name, '') ILIKE ${p}
        OR COALESCE(s.name, '') ILIKE ${p}
        OR COALESCE(ec.name, '') ILIKE ${p}
        OR COALESCE(p.paid_to, '') ILIKE ${p}
        OR COALESCE(u.name, '') ILIKE ${p}
      )
    `);
  }

  const party = normalizePartyFilter(party_id);

  if (party?.type === "CUSTOMER") {
    const p = addParam(params, party.id);
    where.push(`p.customer_id = ${p}`);
  } else if (party?.type === "SUPPLIER") {
    const p = addParam(params, party.id);
    where.push(`p.supplier_id = ${p}`);
  } else if (party?.type === "EXPENSE") {
    const p = addParam(params, party.id);
    where.push(`p.expense_category_id = ${p}`);
  } else if (party?.type === "ANY") {
    const p = addParam(params, party.id);

    where.push(`
      (
        p.customer_id = ${p}
        OR p.supplier_id = ${p}
        OR p.expense_category_id = ${p}
      )
    `);
  }

  const type = String(payment_type || "")
    .trim()
    .toLowerCase();

  if (type === "received" || type === "customer") {
    where.push(`p.payment_type = 'CUSTOMER'`);
  } else if (type === "paid" || type === "supplier") {
    where.push(`p.payment_type = 'SUPPLIER'`);
  } else if (type === "expense") {
    where.push(`p.payment_type = 'EXPENSE'`);
  }

  const method = payment_method || payment_mode;

  if (method?.trim()) {
    const p = addParam(params, method.trim());

    where.push(`
      UPPER(COALESCE(p.payment_method, '')) = UPPER(${p})
    `);
  }

  if (from_date) {
    const p = addParam(params, from_date);
    where.push(`p.payment_date >= ${p}::date`);
  }

  if (to_date) {
    const p = addParam(params, to_date);
    where.push(`
      p.payment_date < (${p}::date + INTERVAL '1 day')
    `);
  }

  return {
    whereSql: where.join(" AND "),
    params,
  };
};

const paymentSelect = `
  SELECT
    p.id,
    p.payment_no,
    p.payment_type,

    p.customer_id,
    p.supplier_id,
    p.expense_category_id,
    p.paid_to,
    p.expense_bill_id,

    p.sale_id,
    p.purchase_id,

    p.payment_date::text AS payment_date,
    p.amount,
    p.payment_method,
    p.reference_no,
    p.remarks,

    p.created_by,
    p.created_at,

    c.name AS customer_name,
    c.mobile AS customer_mobile,

    s.name AS supplier_name,
    s.mobile AS supplier_mobile,

    ec.name AS expense_category_name,

    u.name AS created_by_name

  FROM payments p

  LEFT JOIN customers c
    ON c.id = p.customer_id

  LEFT JOIN suppliers s
    ON s.id = p.supplier_id

  LEFT JOIN expense_categories ec
    ON ec.id = p.expense_category_id

  LEFT JOIN users u
    ON u.id = p.created_by
`;

const normalizeEntry = (row) => {
  const paymentType = String(row.payment_type || "").toUpperCase();

  const isCustomer = paymentType === "CUSTOMER";
  const isExpense = paymentType === "EXPENSE";

  let partyId = null;
  let partyName = "Unknown";
  let partyType = "Party";

  if (isCustomer) {
    partyId = row.customer_id;
    partyName = row.customer_name || "Unknown Customer";
    partyType = "Customer";
  } else if (paymentType === "SUPPLIER") {
    partyId = row.supplier_id;
    partyName = row.supplier_name || "Unknown Supplier";
    partyType = "Supplier";
  } else if (isExpense) {
    partyId = row.expense_category_id;

    const category = row.expense_category_name || "Expense";
    const paidTo = String(row.paid_to || "").trim();

    partyName = paidTo
      ? `${category} - ${paidTo}`
      : category;

    partyType = "Expense";
  }

  return {
    ...row,

    id: Number(row.id),

    customer_id:
      row.customer_id == null ? null : Number(row.customer_id),

    supplier_id:
      row.supplier_id == null ? null : Number(row.supplier_id),

    expense_category_id:
      row.expense_category_id == null
        ? null
        : Number(row.expense_category_id),

    expense_bill_id:
      row.expense_bill_id == null
        ? null
        : Number(row.expense_bill_id),

    sale_id:
      row.sale_id == null ? null : Number(row.sale_id),

    purchase_id:
      row.purchase_id == null ? null : Number(row.purchase_id),

    created_by:
      row.created_by == null ? null : Number(row.created_by),

    amount: toNumber(row.amount),

    party_id:
      partyId == null ? null : Number(partyId),

    party_name: partyName,

    party_type: partyType,

    expense_category_name:
      row.expense_category_name || "",

    payment_mode:
      row.payment_method || "",

    report_type:
      isCustomer ? "received" : "paid",

    is_expense: isExpense,
  };
};

const makePartySummary = (rows) => {
  const map = new Map();

  rows.forEach((row) => {
    const item = normalizeEntry(row);

    const paidTo =
      String(row.paid_to || "").trim();

    const key =
      item.party_type === "Expense"
        ? `Expense:${item.party_id}:${paidTo.toLowerCase()}`
        : `${item.party_type}:${item.party_id}`;

    if (!map.has(key)) {
      map.set(key, {
        id: Number(item.party_id),
        name: item.party_name,
        party_type: item.party_type,
        total_entries: 0,
        received_amount: 0,
        paid_amount: 0,
      });
    }

    const summary = map.get(key);

    summary.total_entries += 1;

    if (item.report_type === "received") {
      summary.received_amount += item.amount;
    } else {
      summary.paid_amount += item.amount;
    }
  });

  return [...map.values()]
    .map((item) => ({
      ...item,
      total_amount:
        item.received_amount - item.paid_amount,
    }))
    .sort((a, b) =>
      String(a.name || "").localeCompare(
        String(b.name || ""),
      ),
    );
};

const getPaymentReport = async ({
  search = "",
  party_id = "",
  payment_type = "",
  payment_method = "",
  payment_mode = "",
  from_date = "",
  to_date = "",
  page = 1,
  limit = 10,
} = {}) => {
  const safePage = Math.max(
    Number.parseInt(page, 10) || 1,
    1,
  );

  const safeLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || 10, 1),
    100,
  );

  const offset =
    (safePage - 1) * safeLimit;

  const { whereSql, params } =
    buildWhere({
      search,
      party_id,
      payment_type,
      payment_method,
      payment_mode,
      from_date,
      to_date,
    });

  const result = await pool.query(
    `
      ${paymentSelect}

      WHERE ${whereSql}

      ORDER BY
        p.payment_date DESC,
        p.id DESC
    `,
    params,
  );

  const allRows = result.rows;
  const normalized =
    allRows.map(normalizeEntry);

  const total = normalized.length;

  const receivedRows =
    normalized.filter(
      (row) => row.report_type === "received",
    );

  // const paidRows =
  //   normalized.filter(
  //     (row) => row.report_type === "paid",
  //   );

  const paidRows = normalized.filter(
    (row) =>
      row.report_type === "paid" &&
      !row.is_expense,
  );

  const expenseRows =
    normalized.filter(
      (row) => row.is_expense,
    );

  const receivedAmount =
    receivedRows.reduce(
      (sum, row) => sum + row.amount,
      0,
    );

  const paidAmount =
    paidRows.reduce(
      (sum, row) => sum + row.amount,
      0,
    );

  const expenseAmount =
    expenseRows.reduce(
      (sum, row) => sum + row.amount,
      0,
    );

  const pageRows =
    normalized.slice(
      offset,
      offset + safeLimit,
    );

  return {
    success: true,

    summary: {
      total_entries: total,
      received_entries: receivedRows.length,
      paid_entries: paidRows.length,
      expense_entries: expenseRows.length,

      received_amount: receivedAmount,
      paid_amount: paidAmount,
      expense_amount: expenseAmount,

      total_amount:
        receivedAmount - paidAmount - expenseAmount,
    },

    entries: pageRows,

    partySummary:
      makePartySummary(allRows),

    pagination: {
      page: safePage,
      limit: safeLimit,
      total,

      total_pages: Math.max(
        1,
        Math.ceil(total / safeLimit),
      ),

      from:
        total === 0
          ? 0
          : offset + 1,

      to:
        total === 0
          ? 0
          : Math.min(
              offset + pageRows.length,
              total,
            ),
    },
  };
};

const exportPaymentReport = async (
  filters = {},
) =>
  getPaymentReport({
    ...filters,
    page: 1,
    limit: 100000,
  });

const getPaymentReportFilters = async () => {
  const [
    customers,
    suppliers,
    expenseCategories,
  ] = await Promise.all([
    pool.query(`
      SELECT
        id,
        name
      FROM customers
      WHERE is_active = TRUE
      ORDER BY name ASC
    `),

    pool.query(`
      SELECT
        id,
        name
      FROM suppliers
      WHERE is_active = TRUE
      ORDER BY name ASC
    `),

    pool.query(`
      SELECT
        id,
        name
      FROM expense_categories
      WHERE is_active = TRUE
      ORDER BY name ASC
    `),
  ]);

  return {
    parties: [
      ...customers.rows.map((row) => ({
        id: `CUSTOMER:${row.id}`,
        name: `${row.name} (Customer)`,
      })),

      ...suppliers.rows.map((row) => ({
        id: `SUPPLIER:${row.id}`,
        name: `${row.name} (Supplier)`,
      })),

      ...expenseCategories.rows.map((row) => ({
        id: `EXPENSE:${row.id}`,
        name: `${row.name} (Expense)`,
      })),
    ],
  };
};

module.exports = {
  getPaymentReport,
  exportPaymentReport,
  getPaymentReportFilters,
};
