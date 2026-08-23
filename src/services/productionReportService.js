const pool = require("../config/db");

const toNumber = (value) => Number(value || 0);

const getProductionReport = async ({
  search,
  product_id,
  shift,
  from_date,
  to_date,
} = {}) => {
  const params = [];
  const where = ["1 = 1"];

  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (product_id) {
    where.push(
      `pb.product_id = ${addParam(Number(product_id))}`,
    );
  }

  if (shift) {
    where.push(`pb.shift = ${addParam(shift)}`);
  }

  if (from_date) {
    where.push(
      `pb.production_date >= ${addParam(from_date)}::date`,
    );
  }

  if (to_date) {
    where.push(
      `pb.production_date <= ${addParam(to_date)}::date`,
    );
  }

  if (search) {
    const searchParam = addParam(`%${search}%`);

    where.push(`
      (
        pb.batch_no ILIKE ${searchParam}
        OR p.name ILIKE ${searchParam}
        OR p.code ILIKE ${searchParam}
        OR COALESCE(pb.machine, '') ILIKE ${searchParam}
        OR COALESCE(pb.supervisor, '') ILIKE ${searchParam}
      )
    `);
  }

  const query = `
    SELECT
      pb.id,
      pb.batch_no,
      pb.product_id,
      p.code AS product_code,
      p.name AS product_name,
      p.unit AS product_unit,
      pb.production_date::text AS production_date,
      pb.planned_quantity,
      pb.produced_quantity,
      pb.wastage_quantity,
      pb.shift,
      pb.machine,
      pb.supervisor,
      pb.remarks,
      pb.created_at,
      pb.updated_at
    FROM production_batches pb
    INNER JOIN products p
      ON p.id = pb.product_id
    WHERE ${where.join(" AND ")}
    ORDER BY
      pb.production_date DESC,
      pb.id DESC
  `;

  const { rows } = await pool.query(query, params);

  const summary = rows.reduce(
    (acc, row) => {
      acc.totalBatches += 1;
      acc.plannedQuantity += toNumber(row.planned_quantity);
      acc.producedQuantity += toNumber(row.produced_quantity);
      acc.wastageQuantity += toNumber(row.wastage_quantity);
      return acc;
    },
    {
      totalBatches: 0,
      plannedQuantity: 0,
      producedQuantity: 0,
      wastageQuantity: 0,
    },
  );

  summary.efficiency =
    summary.plannedQuantity > 0
      ? (summary.producedQuantity /
          summary.plannedQuantity) *
        100
      : 0;

  const productsResult = await pool.query(`
    SELECT
      id,
      code,
      name,
      unit
    FROM products
    WHERE is_active = TRUE
    ORDER BY name ASC
  `);

  const shiftsResult = await pool.query(`
    SELECT DISTINCT shift
    FROM production_batches
    WHERE shift IS NOT NULL
      AND BTRIM(shift) <> ''
    ORDER BY shift ASC
  `);

  return {
    summary,
    rows,
    products: productsResult.rows,
    shifts: shiftsResult.rows.map((row) => row.shift),
  };
};

module.exports = {
  getProductionReport,
};
