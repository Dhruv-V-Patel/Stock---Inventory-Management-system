const pool = require("../config/db");

const normalizeCustomer = (row) => ({
  ...row,
  is_active: Boolean(row.is_active),
  total_sales: Number(row.total_sales ?? 0),
  sales_return_amount: Number(row.sales_return_amount ?? 0),

  net_sales_amount: Number(row.net_sales_amount ?? row.total_sales ?? 0),

  paid_amount: Number(row.paid_amount ?? 0),
  due_amount: Number(row.due_amount ?? 0),
});

const listCustomers = async ({ search = "", status = "" } = {}) => {
  const values = [];
  const conditions = [];

  if (search) {
    values.push(`%${search.trim()}%`);
    const index = values.length;

    conditions.push(`
      (
        c.name ILIKE $${index}
        OR c.contact_person ILIKE $${index}
        OR c.mobile ILIKE $${index}
        OR c.gstin ILIKE $${index}
        OR c.payment_terms ILIKE $${index}
        OR c.address ILIKE $${index}
      )
    `);
  }

  if (status === "active" || status === "inactive") {
    values.push(status === "active");
    conditions.push(`c.is_active = $${values.length}`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const { rows } = await pool.query(
    `
      SELECT
        c.id,
        c.name,
        c.contact_person,
        c.mobile,
        c.gstin,
        c.address,
        c.payment_terms,
        c.is_active,
        c.created_at,
        c.updated_at,

       COALESCE(s.total_sales, 0)::numeric AS total_sales,

COALESCE(
  s.sales_return_amount,
  0
)::numeric AS sales_return_amount,

COALESCE(
  s.net_sales_amount,
  0
)::numeric AS net_sales_amount,

COALESCE(
  p.paid_amount,
  0
)::numeric AS paid_amount,

GREATEST(
  COALESCE(s.net_sales_amount, 0) -
  COALESCE(p.paid_amount, 0),
  0
)::numeric AS due_amount

      FROM customers c

  LEFT JOIN (
  SELECT
    s.customer_id,

    SUM(s.total_amount) AS total_sales,

    COALESCE(
      SUM(sr.return_amount),
      0
    ) AS sales_return_amount,

    SUM(
      GREATEST(
        s.total_amount -
        COALESCE(sr.return_amount, 0),
        0
      )
    ) AS net_sales_amount

  FROM sales s

  LEFT JOIN (
    SELECT
      sr.sale_id,

      COALESCE(
        SUM(sri.amount),
        0
      ) AS return_amount

    FROM sales_returns sr

    INNER JOIN sales_return_items sri
      ON sri.sales_return_id = sr.id

    GROUP BY sr.sale_id
  ) sr
    ON sr.sale_id = s.id

  GROUP BY s.customer_id
) s
  ON s.customer_id = c.id


      LEFT JOIN (
        SELECT
          customer_id,
          SUM(amount) AS paid_amount
        FROM payments
        WHERE payment_type = 'CUSTOMER'
          AND customer_id IS NOT NULL
        GROUP BY customer_id
      ) p ON p.customer_id = c.id

      ${whereClause}

      ORDER BY c.name ASC, c.id ASC
    `,
    values,
  );

  return rows.map(normalizeCustomer);
};

const getCustomerById = async (id) => {
  const { rows } = await pool.query(
    `
      SELECT
        c.id,
        c.name,
        c.contact_person,
        c.mobile,
        c.gstin,
        c.address,
        c.payment_terms,
        c.is_active,
        c.created_at,
        c.updated_at,

       COALESCE(s.total_sales, 0)::numeric AS total_sales,

      COALESCE(s.sales_return_amount,0)::numeric AS sales_return_amount,

      COALESCE(s.net_sales_amount, 0)::numeric AS net_sales_amount,

      COALESCE(p.paid_amount, 0)::numeric AS paid_amount,

      GREATEST(
        COALESCE(s.net_sales_amount, 0) -
        COALESCE(p.paid_amount, 0),
        0
      )::numeric AS due_amount

      FROM customers c

LEFT JOIN (
  SELECT
    s.customer_id,

    SUM(s.total_amount) AS total_sales,

    COALESCE(
      SUM(sr.return_amount),
      0
    ) AS sales_return_amount,

    SUM(
      GREATEST(
        s.total_amount -
        COALESCE(sr.return_amount, 0),
        0
      )
    ) AS net_sales_amount

  FROM sales s

  LEFT JOIN (
    SELECT
      sr.sale_id,

      COALESCE(
        SUM(sri.amount),
        0
      ) AS return_amount

    FROM sales_returns sr

    INNER JOIN sales_return_items sri
      ON sri.sales_return_id = sr.id

    GROUP BY sr.sale_id
  ) sr
    ON sr.sale_id = s.id

  GROUP BY s.customer_id
) s
  ON s.customer_id = c.id

      LEFT JOIN (
        SELECT customer_id, SUM(amount) AS paid_amount
        FROM payments
        WHERE payment_type = 'CUSTOMER'
          AND customer_id IS NOT NULL
        GROUP BY customer_id
      ) p ON p.customer_id = c.id

      WHERE c.id = $1
    `,
    [id],
  );

  if (!rows[0]) return null;

  const customer = normalizeCustomer(rows[0]);

  const [salesResult, paymentsResult] = await Promise.all([
    pool.query(
      `
      SELECT
  s.id,
  s.sale_no,
  s.sale_date,
  s.total_amount,
  s.payment_status,
  s.remarks,

  COALESCE(
    (
      SELECT SUM(sri.amount)
      FROM sales_returns sr

      INNER JOIN sales_return_items sri
        ON sri.sales_return_id = sr.id

      WHERE sr.sale_id = s.id
    ),
    0
  ) AS return_amount,

  GREATEST(
    s.total_amount -

    COALESCE(
      (
        SELECT SUM(sri.amount)
        FROM sales_returns sr

        INNER JOIN sales_return_items sri
          ON sri.sales_return_id = sr.id

        WHERE sr.sale_id = s.id
      ),
      0
    ),

    0
  ) AS net_total

FROM sales s

WHERE s.customer_id = $1

ORDER BY
  s.sale_date DESC,
  s.id DESC

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
          sale_id,
          remarks
        FROM payments
        WHERE payment_type = 'CUSTOMER'
          AND customer_id = $1
        ORDER BY payment_date DESC, id DESC
        LIMIT 10
      `,
      [id],
    ),
  ]);

  return {
    ...customer,
    recent_sales: salesResult.rows.map((sale) => ({
      ...sale,
      total_amount: Number(sale.total_amount ?? 0),
      sales_return_amount: Number(sale.return_amount ?? 0),
      net_sales_amount: Number(
        sale.net_total ??
          Math.max(
            0,
            Number(sale.total_amount ?? 0) - Number(sale.return_amount ?? 0),
          ),
      ),
    })),
    recent_payments: paymentsResult.rows.map((payment) => ({
      ...payment,
      amount: Number(payment.amount ?? 0),
    })),
  };
};

const createCustomer = async (payload) => {
  const {
    name,
    contact_person = null,
    mobile = null,
    gstin = null,
    address = null,
    payment_terms = null,
    is_active = true,
  } = payload;

  const { rows } = await pool.query(
    `
      INSERT INTO customers (
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

  return normalizeCustomer(rows[0]);
};

const updateCustomer = async (id, payload) => {
  const {
    name,
    contact_person = null,
    mobile = null,
    gstin = null,
    address = null,
    payment_terms = null,
    is_active = true,
  } = payload;

  const { rows } = await pool.query(
    `
      UPDATE customers
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

  return rows[0] ? normalizeCustomer(rows[0]) : null;
};

const customerHasTransactions = async (id) => {
  const { rows } = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1 FROM sales WHERE customer_id = $1
        UNION ALL
        SELECT 1 FROM sales_returns WHERE customer_id = $1
        UNION ALL
        SELECT 1 FROM dispatches WHERE customer_id = $1
        UNION ALL
        SELECT 1 FROM payments
          WHERE customer_id = $1
            AND payment_type = 'CUSTOMER'
      ) AS used
    `,
    [id],
  );

  return Boolean(rows[0]?.used);
};

const deleteCustomer = async (id) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const transactionCheck = await client.query(
      `
        SELECT EXISTS (
          SELECT 1 FROM sales WHERE customer_id = $1
          UNION ALL
          SELECT 1 FROM sales_returns WHERE customer_id = $1
          UNION ALL
          SELECT 1 FROM dispatches WHERE customer_id = $1
          UNION ALL
          SELECT 1 FROM payments
            WHERE customer_id = $1
              AND payment_type = 'CUSTOMER'
        ) AS used
      `,
      [id],
    );

    if (transactionCheck.rows[0]?.used) {
      const error = new Error(
        "This customer is already used in transactions and cannot be deleted. Set the customer inactive instead.",
      );
      error.code = "CUSTOMER_IN_USE";
      throw error;
    }

    const result = await client.query(
      `DELETE FROM customers WHERE id = $1 RETURNING id`,
      [id],
    );

    if (!result.rowCount) {
      const error = new Error("Customer not found.");
      error.code = "NOT_FOUND";
      throw error;
    }

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getCustomerSummary = async () => {
  const { rows } = await pool.query(`
     SELECT
      (
        SELECT COUNT(*)
        FROM customers
      )::int AS total,

      (
        SELECT COUNT(*)
        FROM customers
        WHERE is_active = true
      )::int AS active,

      (
        SELECT COUNT(*)
        FROM customers
        WHERE gstin IS NOT NULL
          AND TRIM(gstin) <> ''
      )::int AS with_gstin,

      /* Outstanding = Net Sales - Received */
      GREATEST(
        0,(
          COALESCE(
            (
              SELECT SUM(s.total_amount)
              FROM sales s
            ),0
          )
          -
          COALESCE(
            (
              SELECT SUM(sri.amount)
              FROM sales_returns sr

              INNER JOIN sales_return_items sri
                ON sri.sales_return_id = sr.id
            ),0
          )
        )
        -
        COALESCE(
          (
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.payment_type = 'CUSTOMER'
          ), 0
        )
      )::numeric AS due_amount
  `);

  const row = rows[0] || {};

  return {
    total: Number(row.total || 0),
    active: Number(row.active || 0),
    with_gstin: Number(row.with_gstin || 0),
    due_amount: Number(row.due_amount || 0),
  };
};

const checkCustomerNameExists = async (name, excludeId = null) => {
  const values = [name.trim()];
  let query = `
    SELECT id
    FROM customers
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

const checkCustomerGstinExists = async (gstin, excludeId = null) => {
  const normalizedGstin = gstin?.trim().toUpperCase();

  if (!normalizedGstin) return false;

  const values = [normalizedGstin];

  let query = `
    SELECT id
    FROM customers
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
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  customerHasTransactions,
  getCustomerSummary,
  checkCustomerNameExists,
  checkCustomerGstinExists,
};
