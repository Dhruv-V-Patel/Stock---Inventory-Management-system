const pool = require("../config/db");

const toNumber = (value) => Number(value || 0);

const getSaleReport = async ({
  search = "",
  customer_id = "",
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

  if (customer_id) {
    const id = Number(customer_id);

    if (!Number.isInteger(id) || id <= 0) {
      throw Object.assign(new Error("Invalid customer filter."), {
        statusCode: 400,
      });
    }

    where.push(`s.customer_id = ${addParam(id)}`);
  }

  if (payment_status) {
    const status = String(payment_status).toUpperCase();

    if (!["PENDING", "PARTIAL", "PAID"].includes(status)) {
      throw Object.assign(new Error("Invalid payment status."), {
        statusCode: 400,
      });
    }

    where.push(`s.payment_status = ${addParam(status)}`);
  }

  if (from_date) {
    where.push(`s.sale_date >= ${addParam(from_date)}::date`);
  }

  if (to_date) {
    where.push(`s.sale_date <= ${addParam(to_date)}::date`);
  }

  if (search) {
    const searchParam = addParam(`%${String(search).trim()}%`);

    where.push(`
      (
        s.sale_no ILIKE ${searchParam}
        OR c.name ILIKE ${searchParam}
      )
    `);
  }

  /*
   * The supplied sales schema does not contain invoice_no or freight_amount.
   *
   * For compatibility:
   * - invoice_no is exposed as sale_no.
   * - freight_amount is exposed as 0.
   *
   * This keeps the Sales Report visually identical to Purchase Report
   * without inventing database columns.
   *
   * Payments are aggregated BEFORE joining sale_items so multiple items
   * never duplicate the paid amount.
   */
  const salesQuery = `
    SELECT
      s.id,
      s.sale_no,
      s.customer_id,
      c.name AS customer_name,
      c.mobile AS customer_mobile,
      c.gstin AS customer_gstin,
      c.address AS customer_address,

      s.sale_date::text AS sale_date,

      s.vehicle_no,
      s.driver_name,
      s.driver_mobile,

      s.subtotal,
      s.discount,
      s.tax_amount,
      0::numeric AS freight_amount,
      s.total_amount,

        COALESCE(
      (
        SELECT SUM(sri.amount)
        FROM sales_returns sr
        INNER JOIN sales_return_items sri
          ON sri.sales_return_id = sr.id
        WHERE sr.sale_id = s.id
      ),
      0
    )::numeric AS sales_return_amount,

    GREATEST(
      0,
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
      )
    )::numeric AS net_sales_amount,

      s.payment_status,
      s.remarks,

      COUNT(DISTINCT si.id)::INTEGER AS item_count,

      COALESCE(pay.paid_amount, 0)::numeric AS paid_amount

    FROM sales s

    INNER JOIN customers c
      ON c.id = s.customer_id

    LEFT JOIN sale_items si
      ON si.sale_id = s.id

    LEFT JOIN (
      SELECT
        sale_id,
        SUM(amount)::numeric AS paid_amount
      FROM payments
      WHERE payment_type = 'CUSTOMER'
        AND sale_id IS NOT NULL
      GROUP BY sale_id
    ) pay
      ON pay.sale_id = s.id

    WHERE ${where.join(" AND ")}

    GROUP BY
      s.id,
      s.sale_no,
      s.customer_id,

      c.name,
      c.mobile,
      c.gstin,
      c.address,

      s.sale_date,
      s.vehicle_no,
      s.driver_name,
      s.driver_mobile,

      s.subtotal,
      s.discount,
      s.tax_amount,
      s.total_amount,

      s.payment_status,
      s.remarks,

      pay.paid_amount

    ORDER BY
      s.sale_date DESC,
      s.id DESC
  `;

  const { rows } = await pool.query(salesQuery, params);

  const normalizedRows = rows.map((row) => ({
    ...row,
    invoice_no: row.sale_no,
    subtotal: toNumber(row.subtotal),
    discount: toNumber(row.discount),
    tax_amount: toNumber(row.tax_amount),
    freight_amount: 0,
    total_amount: toNumber(row.total_amount),
    sales_return_amount: toNumber(row.sales_return_amount),

    net_sales_amount: Math.max(
      0,
      toNumber(row.total_amount) - toNumber(row.sales_return_amount),
    ),
    paid_amount: toNumber(row.paid_amount),
    due_amount: Math.max(
      0,
      toNumber(row.net_sales_amount) - toNumber(row.paid_amount),
    ),
    item_count: Number(row.item_count || 0),
  }));

  const summary = normalizedRows.reduce(
    (acc, row) => {
      acc.totalSales += 1;
      acc.salesValue += row.total_amount;
      acc.salesReturnValue += row.sales_return_amount;
      acc.netSalesValue += row.net_sales_amount;
      acc.paidAmount += row.paid_amount;
      acc.pendingAmount += row.due_amount;
      acc.totalItems += row.item_count;
      return acc;
    },
    {
      totalSales: 0,
      salesValue: 0,
      salesReturnValue: 0,
      netSalesValue: 0,
      paidAmount: 0,
      pendingAmount: 0,
      totalItems: 0,
    },
  );

  /*
   * Build customer-wise aggregation from sale-level rows.
   * This guarantees each sale's subtotal/tax/discount is counted once.
   */
  const customerMap = new Map();

  normalizedRows.forEach((row) => {
    const key = Number(row.customer_id);

    const existing = customerMap.get(key) || {
      id: key,
      customer_name: row.customer_name,
      sale_count: 0,
      item_count: 0,
      subtotal: 0,
      discount: 0,
      tax_amount: 0,
      freight_amount: 0,
      total_amount: 0,
      sales_return_amount: 0,
      net_sales_amount: 0,
      paid_amount: 0,
      due_amount: 0,
    };

    existing.sale_count += 1;
    existing.item_count += row.item_count;
    existing.subtotal += row.subtotal;
    existing.discount += row.discount;
    existing.tax_amount += row.tax_amount;
    existing.freight_amount += row.freight_amount;
    existing.total_amount += row.total_amount;
    existing.sales_return_amount += row.sales_return_amount;
    existing.net_sales_amount += row.net_sales_amount;
    existing.paid_amount += row.paid_amount;
    existing.due_amount += row.due_amount;

    customerMap.set(key, existing);
  });

  const customerWise = [...customerMap.values()].sort(
    (a, b) =>
      b.net_sales_amount - a.net_sales_amount ||
      String(a.customer_name || "").localeCompare(
        String(b.customer_name || ""),
      ),
  );

  const customersResult = await pool.query(`
    SELECT
      id,
      name
    FROM customers
    WHERE is_active = TRUE
    ORDER BY name ASC
  `);

  return {
    summary,
    rows: normalizedRows,
    customerWise,
    customers: customersResult.rows,
  };
};

module.exports = {
  getSaleReport,
};
