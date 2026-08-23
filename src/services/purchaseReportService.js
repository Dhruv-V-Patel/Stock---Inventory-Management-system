const pool = require("../config/db");

const toNumber = (value) => Number(value || 0);

const getPurchaseReport = async ({
  search = "",
  supplier_id = "",
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

  if (supplier_id) {
    where.push(
      `p.supplier_id = ${addParam(Number(supplier_id))}`,
    );
  }

  if (payment_status) {
    where.push(
      `p.payment_status = ${addParam(
        String(payment_status).toUpperCase(),
      )}`,
    );
  }

  if (from_date) {
    where.push(
      `p.purchase_date >= ${addParam(from_date)}::date`,
    );
  }

  if (to_date) {
    where.push(
      `p.purchase_date <= ${addParam(to_date)}::date`,
    );
  }

  if (search) {
    const searchParam = addParam(`%${search.trim()}%`);

    where.push(`
      (
        p.purchase_no ILIKE ${searchParam}
        OR COALESCE(p.invoice_no, '') ILIKE ${searchParam}
        OR s.name ILIKE ${searchParam}
      )
    `);
  }

  const purchasesQuery = `
  SELECT
    p.id,
    p.purchase_no,
    p.supplier_id,

    s.name AS supplier_name,
    s.mobile AS supplier_mobile,
    s.gstin AS supplier_gstin,

    p.purchase_date::text AS purchase_date,
    p.invoice_no,
    p.invoice_date::text AS invoice_date,

    p.vehicle_no,
    p.driver_name,
    p.driver_mobile,

    p.subtotal,
    p.discount,
    p.tax_amount,
    p.freight_amount,
    p.total_amount,

COALESCE(
  (
    SELECT SUM(pr.total_amount)
    FROM purchase_returns pr
    WHERE pr.purchase_id = p.id
  ),
  0
)::numeric AS purchase_return_amount,

 GREATEST(
      0,
      p.total_amount - COALESCE(
        (
          SELECT SUM(pr.total_amount)
          FROM purchase_returns pr
          WHERE pr.purchase_id = p.id
        ),
        0
      )
    ) AS net_purchase_amount,

    p.payment_status,
    p.remarks,

    COUNT(DISTINCT pi.id)::INTEGER AS item_count,

    COALESCE(pay.paid_amount, 0)::numeric AS paid_amount

  FROM purchases p

  INNER JOIN suppliers s
    ON s.id = p.supplier_id

  LEFT JOIN purchase_items pi
    ON pi.purchase_id = p.id

  LEFT JOIN (
    SELECT
      purchase_id,

      SUM(amount)::numeric AS paid_amount

    FROM payments

    WHERE payment_type = 'SUPPLIER'

    GROUP BY purchase_id
  ) pay
    ON pay.purchase_id = p.id

  WHERE ${where.join(" AND ")}

  GROUP BY
    p.id,
    p.purchase_no,
    p.supplier_id,

    s.name,
    s.mobile,
    s.gstin,

    p.purchase_date,
    p.invoice_no,
    p.invoice_date,

    p.vehicle_no,
    p.driver_name,
    p.driver_mobile,

    p.subtotal,
    p.discount,
    p.tax_amount,
    p.freight_amount,
    p.total_amount,

    p.payment_status,
    p.remarks,

    pay.paid_amount

  ORDER BY
    p.purchase_date DESC,
    p.id DESC
`;
  const { rows } = await pool.query(
    purchasesQuery,
    params,
  );

  const normalizedRows = rows.map((row) => ({
    ...row,

    subtotal: toNumber(row.subtotal),
    discount: toNumber(row.discount),
    tax_amount: toNumber(row.tax_amount),
    freight_amount: toNumber(row.freight_amount),
    total_amount: toNumber(row.total_amount),
    purchase_return_amount: toNumber(row.purchase_return_amount),

    net_purchase_amount: Math.max(
      0,
      toNumber(row.total_amount) -
        toNumber(row.purchase_return_amount),
    ),

    paid_amount: toNumber(row.paid_amount),

    due_amount: Math.max(
      0,
      toNumber(row.net_purchase_amount) -
        toNumber(row.paid_amount),
    ),

    item_count: Number(row.item_count || 0),
  }));

  /*
   * Summary
   */
  const summary = normalizedRows.reduce(
    (acc, row) => {
      acc.totalPurchases += 1;
      acc.purchaseValue += row.total_amount;
      acc.purchaseReturnValue += row.purchase_return_amount;
      acc.netPurchaseValue += row.net_purchase_amount;
      acc.paidAmount += row.paid_amount;
      acc.pendingAmount += row.due_amount;
      acc.totalItems += row.item_count;

      return acc;
    },
    {
      totalPurchases: 0,
      purchaseValue: 0,
      purchaseReturnValue: 0,
      netPurchaseValue: 0,
      paidAmount: 0,
      pendingAmount: 0,
      totalItems: 0,
    },
  );

  /*
   * Supplier-wise purchase
   */
  // const supplierQuery = `
  //   SELECT
  //     s.id,
  //     s.name AS supplier_name,

  //     COUNT(DISTINCT p.id)::INTEGER AS purchase_count,

  //     COUNT(pi.id)::INTEGER AS item_count,

  //     COALESCE(
  //       SUM(DISTINCT p.subtotal),
  //       0
  //     )::numeric AS subtotal,

  //     COALESCE(
  //       SUM(DISTINCT p.discount),
  //       0
  //     )::numeric AS discount,

  //     COALESCE(
  //       SUM(DISTINCT p.tax_amount),
  //       0
  //     )::numeric AS tax_amount,

  //     COALESCE(
  //       SUM(DISTINCT p.freight_amount),
  //       0
  //     )::numeric AS freight_amount,

  //     COALESCE(
  //       SUM(DISTINCT p.total_amount),
  //       0
  //     )::numeric AS total_amount

  //   FROM suppliers s

  //   INNER JOIN purchases p
  //     ON p.supplier_id = s.id

  //   LEFT JOIN purchase_items pi
  //     ON pi.purchase_id = p.id

  //   WHERE ${where
  //     .filter(
  //       (condition) =>
  //         !condition.includes("s.name ILIKE") &&
  //         !condition.includes("p.purchase_no ILIKE") &&
  //         !condition.includes("p.invoice_no ILIKE"),
  //     )
  //     .join(" AND ")}

  //   GROUP BY
  //     s.id,
  //     s.name

  //   ORDER BY
  //     total_amount DESC,
  //     s.name ASC
  // `;

  /*
   * Supplier query needs its own clean params because
   * search conditions are purchase-level.
   */
  const supplierParams = [];
  const supplierWhere = ["1 = 1"];

  const addSupplierParam = (value) => {
    supplierParams.push(value);
    return `$${supplierParams.length}`;
  };

  if (supplier_id) {
    supplierWhere.push(
      `p.supplier_id = ${addSupplierParam(
        Number(supplier_id),
      )}`,
    );
  }

  if (payment_status) {
    supplierWhere.push(
      `p.payment_status = ${addSupplierParam(
        String(payment_status).toUpperCase(),
      )}`,
    );
  }

  if (from_date) {
    supplierWhere.push(
      `p.purchase_date >= ${addSupplierParam(
        from_date,
      )}::date`,
    );
  }

  if (to_date) {
    supplierWhere.push(
      `p.purchase_date <= ${addSupplierParam(
        to_date,
      )}::date`,
    );
  }

  /*
   * If search contains supplier name / purchase number /
   * invoice number, first find matching purchase IDs.
   */
  if (search) {
    const searchParam = addSupplierParam(
      `%${search.trim()}%`,
    );

    supplierWhere.push(`
      EXISTS (
        SELECT 1
        FROM purchases px
        INNER JOIN suppliers sx
          ON sx.id = px.supplier_id
        WHERE px.id = p.id
          AND (
            px.purchase_no ILIKE ${searchParam}
            OR COALESCE(px.invoice_no, '') ILIKE ${searchParam}
            OR sx.name ILIKE ${searchParam}
          )
      )
    `);
  }

  const supplierResult = await pool.query(
    `
      SELECT
        s.id,
        s.name AS supplier_name,

        COUNT(DISTINCT p.id)::INTEGER AS purchase_count,

        COALESCE(
          SUM(pi.item_count),
          0
        )::INTEGER AS item_count,

        COALESCE(
          SUM(p.subtotal),
          0
        )::numeric AS subtotal,

        COALESCE(
          SUM(p.discount),
          0
        )::numeric AS discount,

        COALESCE(
          SUM(p.tax_amount),
          0
        )::numeric AS tax_amount,

        COALESCE(
          SUM(p.freight_amount),
          0
        )::numeric AS freight_amount,

        COALESCE(
          SUM(p.total_amount),
          0
        )::numeric AS total_amount,

        COALESCE(
          SUM(
            COALESCE(pr.total_return, 0)
          ),
          0
        )::numeric AS purchase_return_amount,

        COALESCE(
          SUM(
            GREATEST(
              p.total_amount -
              COALESCE(pr.total_return, 0),
              0
            )
          ),
          0
        )::numeric AS net_purchase_amount

      FROM suppliers s

      INNER JOIN purchases p
        ON p.supplier_id = s.id

      LEFT JOIN (
        SELECT
          purchase_id,
          COUNT(*)::INTEGER AS item_count
        FROM purchase_items
        GROUP BY purchase_id
      ) pi
        ON pi.purchase_id = p.id

      LEFT JOIN (
        SELECT
          purchase_id,
          SUM(total_amount)::numeric AS total_return
        FROM purchase_returns
        GROUP BY purchase_id
      ) pr
        ON pr.purchase_id = p.id

      WHERE ${supplierWhere.join(" AND ")}

      GROUP BY
        s.id,
        s.name

      ORDER BY
        total_amount DESC,
        s.name ASC
    `,
    supplierParams,
  );

  const suppliers = supplierResult.rows.map(
    (row) => ({
      ...row,
      purchase_count: Number(
        row.purchase_count || 0,
      ),
      item_count: Number(row.item_count || 0),
      subtotal: toNumber(row.subtotal),
      discount: toNumber(row.discount),
      tax_amount: toNumber(row.tax_amount),
      freight_amount: toNumber(
        row.freight_amount,
      ),
      total_amount: toNumber(
        row.total_amount,
      ),
        purchase_return_amount: toNumber(
      row.purchase_return_amount,
    ),

    net_purchase_amount: toNumber(
      row.net_purchase_amount,
    ),
    }),
  );


  const suppliersResult = await pool.query(`
    SELECT
      id,
      name
    FROM suppliers
    WHERE is_active = TRUE
    ORDER BY name ASC
  `);

  return {
    summary,
    rows: normalizedRows,
    supplierWise: suppliers,
    suppliers: suppliersResult.rows,
  };
};

module.exports = {
  getPurchaseReport,
};