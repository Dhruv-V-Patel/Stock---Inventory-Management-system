const pool = require("../config/db");
const { createAuditLog } = require("./auditLogService");

const normalizeSupplier = (row) => ({
  ...row,
  is_active: Boolean(row.is_active),
  total_purchase: Number(row.total_purchase ?? 0),
  purchase_return_amount: Number(row.purchase_return_amount ?? 0),
  net_purchase_amount: Number(
    row.net_purchase_amount ?? row.total_purchase ?? 0,
  ),
  paid_amount: Number(row.paid_amount ?? 0),
  due_amount: Number(row.due_amount ?? 0),
});

const listSuppliers = async ({ search = "", status = "" } = {}) => {
  const values = [];
  const conditions = [];

  if (search) {
    values.push(`%${search.trim()}%`);
    const index = values.length;

    conditions.push(`
      (
        s.name ILIKE $${index}
        OR s.contact_person ILIKE $${index}
        OR s.mobile ILIKE $${index}
        OR s.gstin ILIKE $${index}
        OR s.payment_terms ILIKE $${index}
        OR s.address ILIKE $${index}
      )
    `);
  }

  if (status === "active" || status === "inactive") {
    values.push(status === "active");
    conditions.push(`s.is_active = $${values.length}`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const { rows } = await pool.query(
    `
      SELECT
        s.id,
        s.name,
        s.contact_person,
        s.mobile,
        s.gstin,
        s.address,
        s.payment_terms,
        s.is_active,
        s.created_at,
        s.updated_at,
        COALESCE(p.total_purchase, 0)::numeric AS total_purchase,
        COALESCE(p.total_return, 0)::numeric AS purchase_return_amount,
        COALESCE(p.net_purchase, 0)::numeric AS net_purchase_amount,
        COALESCE(pay.paid_amount, 0)::numeric AS paid_amount,
        GREATEST(
          COALESCE(p.net_purchase, 0) -
          COALESCE(pay.paid_amount, 0),
          0
        )::numeric AS due_amount
        
      FROM suppliers s
      LEFT JOIN (
  SELECT
    p.supplier_id,
    SUM(p.total_amount) AS total_purchase,

    SUM(
      COALESCE(pr.total_return, 0)
    ) AS total_return,

    SUM(
      GREATEST(
        p.total_amount - COALESCE(pr.total_return, 0),
        0
      )
    ) AS net_purchase

  FROM purchases p

  LEFT JOIN (
    SELECT
      purchase_id,
      SUM(total_amount) AS total_return
    FROM purchase_returns
    GROUP BY purchase_id
  ) pr
    ON pr.purchase_id = p.id

  GROUP BY p.supplier_id
) p ON p.supplier_id = s.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS paid_amount
        FROM payments
        WHERE payment_type = 'SUPPLIER'
          AND supplier_id IS NOT NULL
        GROUP BY supplier_id
      ) pay ON pay.supplier_id = s.id
      ${whereClause}
      ORDER BY s.name ASC, s.id ASC
    `,
    values,
  );

  return rows.map(normalizeSupplier);
};

const getSupplierById = async (id) => {
  const { rows } = await pool.query(
    `
      SELECT
        s.id,
        s.name,
        s.contact_person,
        s.mobile,
        s.gstin,
        s.address,
        s.payment_terms,
        s.is_active,
        s.created_at,
        s.updated_at,
        COALESCE(p.total_purchase, 0)::numeric AS total_purchase,
        COALESCE(p.total_return, 0)::numeric AS purchase_return_amount,
        COALESCE(p.net_purchase, 0)::numeric AS net_purchase_amount,
        COALESCE(pay.paid_amount, 0)::numeric AS paid_amount,

        GREATEST(
          COALESCE(p.net_purchase, 0) -
          COALESCE(pay.paid_amount, 0),
          0
        )::numeric AS due_amount
      FROM suppliers s
      LEFT JOIN (
        SELECT
  p.supplier_id,
  SUM(p.total_amount) AS total_purchase,

  SUM(COALESCE(pr.total_return, 0)) AS total_return,

  SUM(
    GREATEST(
      p.total_amount - COALESCE(pr.total_return, 0),
      0
    )
  ) AS net_purchase

FROM purchases p

LEFT JOIN (
  SELECT
    purchase_id,
    SUM(total_amount) AS total_return
  FROM purchase_returns
  GROUP BY purchase_id
) pr
  ON pr.purchase_id = p.id

GROUP BY p.supplier_id
      ) p ON p.supplier_id = s.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS paid_amount
        FROM payments
        WHERE payment_type = 'SUPPLIER'
          AND supplier_id IS NOT NULL
        GROUP BY supplier_id
      ) pay ON pay.supplier_id = s.id
      WHERE s.id = $1
    `,
    [id],
  );

  if (!rows[0]) return null;

  const supplier = normalizeSupplier(rows[0]);

  const [purchasesResult, paymentsResult] = await Promise.all([
    pool.query(
      `
       SELECT
  p.id,
  p.purchase_no,
  p.purchase_date,
  p.total_amount,

  COALESCE(
    (
      SELECT SUM(pr.total_amount)
      FROM purchase_returns pr
      WHERE pr.purchase_id = p.id
    ),
    0
  ) AS purchase_return_amount,

  GREATEST(
    p.total_amount -
    COALESCE(
      (
        SELECT SUM(pr.total_amount)
        FROM purchase_returns pr
        WHERE pr.purchase_id = p.id
      ),
      0
    ),
    0
  ) AS net_purchase_amount,

  p.payment_status,
  p.remarks

FROM purchases p
WHERE p.supplier_id = $1
ORDER BY p.purchase_date DESC, p.id DESC
LIMIT 10
      `,
      [id],
    ),
    pool.query(
      `
        SELECT
          id,
          payment_no,
          payment_date,
          amount,
          payment_method,
          reference_no,
          purchase_id,
          remarks
        FROM payments
        WHERE payment_type = 'SUPPLIER'
          AND supplier_id = $1
        ORDER BY payment_date DESC, id DESC
        LIMIT 10
      `,
      [id],
    ),
  ]);

  return {
    ...supplier,
    recent_purchases: purchasesResult.rows.map((purchase) => ({
      ...purchase,
      total_amount: Number(purchase.total_amount ?? 0),
      purchase_return_amount: Number(purchase.purchase_return_amount ?? 0),
      net_purchase_amount: Number(
        purchase.net_purchase_amount ??
        purchase.total_amount ??
        0
      ),
    })),
    recent_payments: paymentsResult.rows.map((payment) => ({
      ...payment,
      amount: Number(payment.amount ?? 0),
    })),
  };
};

const createSupplier = async (payload) => {
  const {
    name,
    contact_person = null,
    mobile = null,
    gstin = null,
    address = null,
    payment_terms = null,
    is_active = true,
    userId,
    ipAddress,
  } = payload;

  const { rows } = await pool.query(
    `
      INSERT INTO suppliers (
        name,
        contact_person,
        mobile,
        gstin,
        address,
        payment_terms,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        name,
        contact_person,
        mobile,
        gstin,
        address,
        payment_terms,
        is_active,
        created_at,
        updated_at
    `,
    [
      name,
      contact_person,
      mobile,
      gstin,
      address,
      payment_terms,
      Boolean(is_active),
    ],
  );
  const supplier = normalizeSupplier(rows[0]);

  await createAuditLog({
    userId: userId || null,
    module: "SUPPLIERS",
    action: "CREATE",
    recordId: supplier.id,
    oldData: null,
    newData: supplier,
    ipAddress: ipAddress || null,
  });

  return supplier;
};

const updateSupplier = async (id, payload) => {
  const {
    name,
    contact_person = null,
    mobile = null,
    gstin = null,
    address = null,
    payment_terms = null,
    is_active = true,
    userId,
    ipAddress,
  } = payload;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query(
      `
        SELECT
          id,
          name,
          contact_person,
          mobile,
          gstin,
          address,
          payment_terms,
          is_active,
          created_at,
          updated_at
        FROM suppliers
        WHERE id = $1
        FOR UPDATE
      `,
      [id],
    );

    if (!existingResult.rowCount) {
      const error = new Error("Supplier not found.");

      error.statusCode = 404;

      throw error;
    }

    const oldSupplier = normalizeSupplier(existingResult.rows[0]);

    const result = await client.query(
      `
        UPDATE suppliers
        SET
          name = $1,
          contact_person = $2,
          mobile = $3,
          gstin = $4,
          address = $5,
          payment_terms = $6,
          is_active = $7,
          updated_at = NOW()
        WHERE id = $8
        RETURNING
          id,
          name,
          contact_person,
          mobile,
          gstin,
          address,
          payment_terms,
          is_active,
          created_at,
          updated_at
      `,
      [
        name,
        contact_person,
        mobile,
        gstin,
        address,
        payment_terms,
        Boolean(is_active),
        id,
      ],
    );

    const newSupplier = normalizeSupplier(result.rows[0]);

    await createAuditLog({
      userId: userId || null,
      module: "SUPPLIERS",
      action: "UPDATE",
      recordId: newSupplier.id,
      oldData: oldSupplier,
      newData: newSupplier,
      ipAddress: ipAddress || null,
    });
    await client.query("COMMIT");

    return newSupplier;
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

const supplierHasPurchases = async (id) => {
  const { rows } = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM purchases
        WHERE supplier_id = $1
      ) AS used
    `,
    [id],
  );

  return Boolean(rows[0]?.used);
};

const deleteSupplier = async (id, { userId, ipAddress }) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const purchaseCheck = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM purchases
          WHERE supplier_id = $1
        ) AS used
      `,
      [id],
    );

    if (purchaseCheck.rows[0]?.used) {
      const error = new Error(
        "This supplier is already used in purchases and cannot be deleted. Set the supplier inactive instead.",
      );
      error.code = "SUPPLIER_IN_USE";
      throw error;
    }
    const supplierResult = await client.query(
      `
        SELECT
          id,
          name,
          contact_person,
          mobile,
          gstin,
          address,
          payment_terms,
          is_active,
          created_at,
          updated_at
        FROM suppliers
        WHERE id = $1
        FOR UPDATE
      `,
      [id],
    );

    if (!supplierResult.rowCount) {
      const error = new Error("Supplier not found.");

      error.code = "NOT_FOUND";

      throw error;
    }

    const oldSupplier = normalizeSupplier(supplierResult.rows[0]);

    const result = await client.query(
      `DELETE FROM suppliers WHERE id = $1 RETURNING id`,
      [id],
    );

    if (!result.rowCount) {
      const error = new Error("Supplier not found.");
      error.code = "NOT_FOUND";
      throw error;
    }

    await createAuditLog({
      userId: userId || null,
      module: "SUPPLIERS",
      action: "DELETE",
      recordId: oldSupplier.id,
      oldData: oldSupplier,
      ipAddress: ipAddress || null,
    });
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getSupplierSummary = async () => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active,
      COUNT(*) FILTER (WHERE is_active = FALSE)::int AS inactive,
      COUNT(*) FILTER (
        WHERE NULLIF(TRIM(gstin), '') IS NOT NULL
      )::int AS with_gstin,
      COALESCE((
        SELECT SUM(total_amount)
        FROM purchases
      ), 0)::numeric AS total_purchase,
      COALESCE((
        SELECT SUM(amount)
        FROM payments
        WHERE payment_type = 'SUPPLIER'
          AND supplier_id IS NOT NULL
      ), 0)::numeric AS paid_amount,
       GREATEST(
        (
          COALESCE((
            SELECT SUM(total_amount)
            FROM purchases
          ), 0)
          -
          COALESCE((
            SELECT SUM(pri.amount)
            FROM purchase_returns pr
            INNER JOIN purchase_return_items pri
              ON pri.purchase_return_id = pr.id
          ), 0)
        )
        -
        COALESCE((
          SELECT SUM(amount)
          FROM payments
          WHERE payment_type = 'SUPPLIER'
            AND supplier_id IS NOT NULL
        ), 0),
        0
      )::numeric AS due_amount
    FROM suppliers
  `);

  return {
    ...rows[0],
    total_purchase: Number(rows[0]?.total_purchase ?? 0),
    paid_amount: Number(rows[0]?.paid_amount ?? 0),
    due_amount: Number(rows[0]?.due_amount ?? 0),
  };
};

const checkSupplierNameExists = async (name, excludeId = null) => {
  const values = [name.trim()];
  let query = `
    SELECT id, name
    FROM suppliers
    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
  `;

  if (excludeId) {
    values.push(excludeId);
    query += ` AND id <> $2`;
  }

  query += ` LIMIT 1`;
  const { rows } = await pool.query(query, values);

  return rows.length > 0;
};

const checkSupplierGstinExists = async (gstin, excludeId = null) => {
  const normalizedGstin = gstin?.trim().toUpperCase();

  if (!normalizedGstin) {
    return false;
  }

  const values = [normalizedGstin];

  let query = `
    SELECT id, gstin
    FROM suppliers
    WHERE UPPER(TRIM(gstin)) = UPPER(TRIM($1))
  `;

  if (excludeId) {
    values.push(excludeId);
    query += ` AND id <> $2`;
  }

  query += ` LIMIT 1`;

  const { rows } = await pool.query(query, values);

  return rows.length > 0;
};

module.exports = {
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  supplierHasPurchases,
  getSupplierSummary,
  checkSupplierNameExists,
  checkSupplierGstinExists,
};
