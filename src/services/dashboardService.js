const pool = require("../config/db.js");

/* =========================================================
   DASHBOARD
========================================================= */

const getDashboardData = async () => {
  const [
    summaryResult,
    productionVsSalesResult,
    finishedStockResult,
    materialConsumptionResult,
    lowStockResult,
    recentProductionResult,
  ] = await Promise.all([
    /* =====================================================
       1. SUMMARY / KPI
    ===================================================== */
    pool.query(`
  WITH raw_material_items AS (
    SELECT
      COUNT(*) AS count

    FROM raw_materials

    WHERE is_active = TRUE
  ),

  finished_stock AS (
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN sm.direction = 'IN'
              THEN sm.quantity

            WHEN sm.direction = 'OUT'
              THEN -sm.quantity

            ELSE 0
          END
        ),
        0
      ) AS quantity

    FROM stock_movements sm

    WHERE sm.item_type = 'PRODUCT'
  ),

  today_production AS (
    SELECT
      COALESCE(
        SUM(produced_quantity),
        0
      ) AS quantity

    FROM production_batches

    WHERE production_date = CURRENT_DATE
  ),

  today_sales AS (
    SELECT
      COALESCE(
        SUM(total_amount),
        0
      ) AS amount

    FROM sales

    WHERE sale_date = CURRENT_DATE
  ),

  today_wastage AS (
  SELECT
    COALESCE(
      SUM(planned_quantity),
      0
    ) AS planned,

    COALESCE(
      SUM(produced_quantity),
      0
    ) AS produced,

    COALESCE(
      SUM(wastage_quantity),
      0
    ) AS wastage

  FROM production_batches

  WHERE production_date = CURRENT_DATE
),

  low_raw_material AS (
    SELECT
      COUNT(*) AS count

    FROM (
      SELECT
        rm.id,
        rm.minimum_stock,

        COALESCE(
          SUM(
            CASE
              WHEN sm.direction = 'IN'
                THEN sm.quantity

              WHEN sm.direction = 'OUT'
                THEN -sm.quantity

              ELSE 0
            END
          ),
          0
        ) AS current_stock

      FROM raw_materials rm

      LEFT JOIN stock_movements sm
        ON sm.item_type = 'RAW_MATERIAL'
        AND sm.item_id = rm.id

      WHERE rm.is_active = TRUE

      GROUP BY
        rm.id,
        rm.minimum_stock
    ) stock

    WHERE current_stock <= minimum_stock
  ),

  low_products AS (
    SELECT
      COUNT(*) AS count

    FROM (
      SELECT
        p.id,
        p.minimum_stock,

        COALESCE(
          SUM(
            CASE
              WHEN sm.direction = 'IN'
                THEN sm.quantity

              WHEN sm.direction = 'OUT'
                THEN -sm.quantity

              ELSE 0
            END
          ),
          0
        ) AS current_stock

      FROM products p

      LEFT JOIN stock_movements sm
        ON sm.item_type = 'PRODUCT'
        AND sm.item_id = p.id

      WHERE p.is_active = TRUE

      GROUP BY
        p.id,
        p.minimum_stock
    ) stock

    WHERE current_stock <= minimum_stock
  )

  SELECT
    (
      SELECT count
      FROM raw_material_items
    ) AS raw_material_items,

    (
      SELECT quantity
      FROM today_production
    ) AS today_production,

    (
      SELECT quantity
      FROM finished_stock
    ) AS finished_stock,

    (
      SELECT count
      FROM low_raw_material
    )
    +
    (
      SELECT count
      FROM low_products
    ) AS low_stock_items,

    (
      SELECT amount
      FROM today_sales
    ) AS today_sales,

    (
  SELECT
    CASE
      WHEN planned <= 0 THEN 0

      ELSE LEAST(
        ROUND(
          (produced / planned) * 100,
          2
        ),
        100
      )
    END
  FROM today_wastage
) AS production_efficiency
`),

    /* =====================================================
       2. PRODUCTION VS SALES
          Initial dashboard = last 7 days
    ===================================================== */

    pool.query(`
      SELECT
        d.date,

        COALESCE(
          production.production,
          0
        ) AS production,

        COALESCE(
          sales.sales,
          0
        ) AS sales

      FROM (
        SELECT
          CURRENT_DATE - i AS date

        FROM generate_series(
          0,
          6
        ) AS i
      ) d


      LEFT JOIN (
        SELECT
          production_date AS date,

          SUM(
            produced_quantity
          ) AS production

        FROM production_batches

        WHERE production_date >=
          CURRENT_DATE - 6

        GROUP BY
          production_date
      ) production

        ON production.date = d.date


      LEFT JOIN (
        SELECT
          s.sale_date AS date,

          SUM(
            si.quantity
          ) AS sales

        FROM sales s

        INNER JOIN sale_items si
          ON si.sale_id = s.id

        WHERE s.sale_date >=
          CURRENT_DATE - 6

        GROUP BY
          s.sale_date
      ) sales

        ON sales.date = d.date


      ORDER BY
        d.date ASC
    `),

    /* =====================================================
       3. FINISHED STOCK
    ===================================================== */

    pool.query(`
      SELECT
        p.id,
        p.code,
        p.name,
        p.unit,

        COALESCE(
          SUM(
            CASE
              WHEN sm.direction = 'IN'
                THEN sm.quantity

              WHEN sm.direction = 'OUT'
                THEN -sm.quantity

              ELSE 0
            END
          ),
          0
        ) AS quantity

      FROM products p

      LEFT JOIN stock_movements sm
        ON sm.item_type = 'PRODUCT'
        AND sm.item_id = p.id

      WHERE p.is_active = TRUE

      GROUP BY
        p.id,
        p.code,
        p.name,
        p.unit

      HAVING
        COALESCE(
          SUM(
            CASE
              WHEN sm.direction = 'IN'
                THEN sm.quantity

              WHEN sm.direction = 'OUT'
                THEN -sm.quantity

              ELSE 0
            END
          ),
          0
        ) > 0

      ORDER BY
        quantity DESC

      LIMIT 6
    `),

    /* =====================================================
       4. TODAY'S RAW MATERIAL CONSUMPTION
    ===================================================== */

    pool.query(`
      SELECT
        rm.id,
        rm.code,
        rm.name,
        rm.unit,

        COALESCE(
          SUM(pm.actual_quantity),
          0
        ) AS quantity

      FROM raw_materials rm

      INNER JOIN production_materials pm
        ON pm.raw_material_id = rm.id

      INNER JOIN production_batches pb
        ON pb.id = pm.production_batch_id

      WHERE
        pb.production_date = CURRENT_DATE

      GROUP BY
        rm.id,
        rm.code,
        rm.name,
        rm.unit

      ORDER BY
        quantity DESC

      LIMIT 6
    `),

    /* =====================================================
       5. LOW STOCK ITEMS
    ===================================================== */

    pool.query(`
      SELECT
        rm.id,
        rm.code,
        rm.name,
        rm.unit,
        rm.minimum_stock,

        COALESCE(
          SUM(
            CASE
              WHEN sm.direction = 'IN'
                THEN sm.quantity

              WHEN sm.direction = 'OUT'
                THEN -sm.quantity

              ELSE 0
            END
          ),
          0
        ) AS current_stock

      FROM raw_materials rm

      LEFT JOIN stock_movements sm
        ON sm.item_type = 'RAW_MATERIAL'
        AND sm.item_id = rm.id

      WHERE rm.is_active = TRUE

      GROUP BY
        rm.id,
        rm.code,
        rm.name,
        rm.unit,
        rm.minimum_stock

      HAVING
        COALESCE(
          SUM(
            CASE
              WHEN sm.direction = 'IN'
                THEN sm.quantity

              WHEN sm.direction = 'OUT'
                THEN -sm.quantity

              ELSE 0
            END
          ),
          0
        ) <= rm.minimum_stock

      ORDER BY current_stock ASC
      LIMIT 6
    `),

    /* =====================================================
       6. RECENT PRODUCTION
    ===================================================== */

    pool.query(`
      SELECT
        pb.id,
        pb.batch_no,
        pb.production_date,
        pb.produced_quantity,
        pb.created_at,

        p.name AS product_name,
        p.unit

      FROM production_batches pb

      INNER JOIN products p
        ON p.id = pb.product_id

      ORDER BY pb.created_at DESC
      LIMIT 6
    `),
  ]);

  const summary = summaryResult.rows[0] || {};

  return {
    summary: {
    //  rawMaterialStock: Number(summary.raw_material_stock || 0),
        rawMaterialItems: Number(summary.raw_material_items || 0),
        todayProduction: Number(summary.today_production || 0),
        finishedStock: Number(summary.finished_stock || 0),
        lowStockItems: Number(summary.low_stock_items || 0),
        todaySales: Number(summary.today_sales || 0),
    //  todayWastage: Number(summary.today_wastage || 0),
        productionEfficiency: Number(summary.production_efficiency || 0),
    },

    productionVsSales: productionVsSalesResult.rows.map((row) => ({
      date: row.date,
      production: Number(row.production || 0),
      sales: Number(row.sales || 0),
    })),

    finishedStock: finishedStockResult.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit,
      quantity: Number(row.quantity || 0),
    })),

    materialConsumption: materialConsumptionResult.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit,
      quantity: Number(row.quantity || 0),
    })),

    lowStockItems: lowStockResult.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit,
      currentStock: Number(row.current_stock || 0),
      minimumStock: Number(row.minimum_stock || 0),
    })),

    recentProduction: recentProductionResult.rows.map((row) => ({
      id: row.id,
      batchNo: row.batch_no,
      productName: row.product_name,
      productionDate: row.production_date,
      producedQuantity: Number(row.produced_quantity || 0),
      unit: row.unit,
      createdAt: row.created_at,
    })),
  };
};

const getProductionVsSalesData = async (days) => {
  const allowedDays = [7, 15, 30, 60, 90];
  const selectedDays = allowedDays.includes(Number(days)) ? Number(days) : 7;
  const result = await pool.query(
    `
      SELECT
        d.date,
        COALESCE(production.production, 0) AS production,
        COALESCE(sales.sales, 0) AS sales

      FROM (
        SELECT
          CURRENT_DATE - i AS date
        FROM generate_series(0,$1 - 1) AS i
      ) d
      LEFT JOIN (
        SELECT
          production_date AS date,
          SUM(produced_quantity) AS production
        FROM production_batches
        WHERE production_date >= CURRENT_DATE - ($1 - 1)
        GROUP BY production_date
      ) production
        ON production.date = d.date
      LEFT JOIN (
        SELECT
          s.sale_date AS date,
          SUM(si.quantity) AS sales
        FROM sales s
        INNER JOIN sale_items si
          ON si.sale_id = s.id
        WHERE s.sale_date >= CURRENT_DATE - ($1 - 1)
        GROUP BY s.sale_date
      ) sales
        ON sales.date = d.date
      ORDER BY d.date ASC
    `,
    [selectedDays],
  );

  return result.rows.map((row) => ({
    date: row.date,

    production: Number(row.production || 0),

    sales: Number(row.sales || 0),
  }));
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getDashboardData,
  getProductionVsSalesData,
};
