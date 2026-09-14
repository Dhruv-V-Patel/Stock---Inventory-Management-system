const pool = require("../config/db");

const toNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  const date = String(value).trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

const getStockReport = async (filters = {}) => {
  const itemType = ["RAW_MATERIAL", "PRODUCT"].includes(filters.item_type)
    ? filters.item_type
    : null;

  const status = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"].includes(
    filters.status,
  )
    ? filters.status
    : null;

  const search = String(filters.search || "").trim();
  const category = String(filters.category || "").trim();

  const fromDate = normalizeDate(filters.from_date);
  const toDate = normalizeDate(filters.to_date);

  const params = [];

  const addParam = (value) => {
    params.push(value);

    return `$${params.length}`;
  };

  // const itemTypeSql = itemType
  //     ? `AND x.item_type = ${addParam(itemType)}`
  //     : "";

  // const categorySql = category
  //     ? `AND x.category = ${addParam(category)}`
  //     : "";

  // const searchSql = search
  //     ? `
  //         AND (
  //             x.item_name ILIKE ${addParam(`%${search}%`)}
  //             OR x.item_code ILIKE ${addParam(`%${search}%`)}
  //         )
  //     `
  //     : "";

  const itemTypeSql = itemType ? `AND item_type = ${addParam(itemType)}` : "";

  const categorySql = category
    ? `AND category ILIKE ${addParam(`%${category}%`)}`
    : "";

  const searchSql = search
    ? `
        AND (
            item_name ILIKE ${addParam(`%${search}%`)}
            OR item_code ILIKE ${addParam(`%${search}%`)}
        )
    `
    : "";

  const fromExpression = fromDate
    ? addParam(`${fromDate} 00:00:00`)
    : "'0001-01-01 00:00:00'::timestamp";

  const toExpression = toDate ? addParam(`${toDate} 23:59:59.999`) : "NOW()";

  const result = await pool.query(
    `
        WITH items AS (

            SELECT
                'RAW_MATERIAL'::VARCHAR AS item_type,

                rm.id,

                rm.code AS item_code,

                rm.name AS item_name,

                rm.category AS category,

                rm.unit,

                rm.minimum_stock

            FROM raw_materials rm

            WHERE rm.is_active = TRUE


            UNION ALL

            SELECT
                'PRODUCT'::VARCHAR AS item_type,

                p.id,

                p.code AS item_code,

                p.name AS item_name,

                pc.name AS category,

                p.unit,

                p.minimum_stock

            FROM products p

            LEFT JOIN product_categories pc
                ON pc.id = p.category_id

            WHERE p.is_active = TRUE
        ),

        stock_data AS (

            SELECT
                i.*,
                COALESCE(
                    (
                        SELECT
                            SUM(
                                CASE
                                    WHEN sm.direction = 'IN'
                                        THEN sm.quantity

                                    WHEN sm.direction = 'OUT'
                                        THEN -sm.quantity

                                    ELSE 0
                                END
                            )

                        FROM stock_movements sm

                        WHERE
                            sm.item_type = i.item_type
                            AND sm.item_id = i.id

                            AND sm.movement_date <
                                ${fromExpression}
                    ),
                    0
                ) AS opening_stock,


                /*
                 * Stock IN
                 */
                COALESCE(
                    (
                        SELECT
                            SUM(sm.quantity)

                        FROM stock_movements sm

                        WHERE
                            sm.item_type = i.item_type
                            AND sm.item_id = i.id

                            AND sm.direction = 'IN'

                            AND sm.movement_date >=
                                ${fromExpression}

                            AND sm.movement_date <=
                                ${toExpression}
                    ),
                    0
                ) AS stock_in,


                /*
                 * Stock OUT
                 */
                COALESCE(
                    (
                        SELECT
                            SUM(sm.quantity)

                        FROM stock_movements sm

                        WHERE
                            sm.item_type = i.item_type
                            AND sm.item_id = i.id

                            AND sm.direction = 'OUT'

                            AND sm.movement_date >=
                                ${fromExpression}

                            AND sm.movement_date <=
                                ${toExpression}
                    ),
                    0
                ) AS stock_out

            FROM items i
        ),

        final_data AS (

            SELECT
                stock_data.*,

                (
                    opening_stock
                    + stock_in
                    - stock_out
                ) AS closing_stock

            FROM stock_data
        ),

        with_status AS (

            SELECT
                final_data.*,

                CASE
                    WHEN closing_stock <= 0
                        THEN 'OUT_OF_STOCK'

                    WHEN minimum_stock > 0
                        AND closing_stock <= minimum_stock
                        THEN 'LOW_STOCK'

                    ELSE 'IN_STOCK'
                END AS stock_status

            FROM final_data
        )

        SELECT *
        FROM with_status ws

        WHERE 1 = 1

        ${itemTypeSql}

        ${categorySql}

        ${searchSql}

        ORDER BY
            ws.item_type,
        ws.item_name ASC
        `,
    params,
  );

  let rows = result.rows.map((row) => ({
    item_type: row.item_type,
    id: Number(row.id),
    item_code: row.item_code,
    item_name: row.item_name,
    category: row.category || "",
    unit: row.unit,
    minimum_stock: toNumber(row.minimum_stock),
    opening_stock: toNumber(row.opening_stock),
    stock_in: toNumber(row.stock_in),
    stock_out: toNumber(row.stock_out),
    closing_stock: toNumber(row.closing_stock),
    stock_status: row.stock_status,
  }));

  if (status) {
    rows = rows.filter((row) => row.stock_status === status);
  }

  const summary = {
    totalItems: rows.length,
    rawMaterials: rows.filter((row) => row.item_type === "RAW_MATERIAL").length,
    products: rows.filter((row) => row.item_type === "PRODUCT").length,
    lowStock: rows.filter((row) => row.stock_status === "LOW_STOCK").length,
    outOfStock: rows.filter((row) => row.stock_status === "OUT_OF_STOCK")
      .length,
  };

  return {
    summary,
    rows,
  };
};

const getItemMovements = async (itemType, itemId, options = {}) => {
  if (!["RAW_MATERIAL", "PRODUCT"].includes(itemType)) {
    const error = new Error("Invalid item type.");

    error.statusCode = 400;

    throw error;
  }

  const id = Number(itemId);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid item id.");

    error.statusCode = 400;

    throw error;
  }

  const fromDate = normalizeDate(options.from_date);
  const toDate = normalizeDate(options.to_date);

  const requestedLimit = Number(options.limit);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50000)
    : 100;

  const params = [itemType, id];

  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const dateSql = `
        ${fromDate ? `AND sm.movement_date >= ${addParam(`${fromDate} 00:00:00`)}` : ""}
        ${toDate ? `AND sm.movement_date <= ${addParam(`${toDate} 23:59:59.999`)}` : ""}
  `;

  const limitParam = addParam(limit);

  const result = await pool.query(
    `
        SELECT
            sm.id,
            sm.item_id,
            sm.item_type,
            sm.direction,
            sm.quantity,
            sm.movement_type,
            sm.reference_type,
            sm.reference_id,
            sm.movement_date,
            sm.remarks

        FROM stock_movements sm

        WHERE
            sm.item_type = $1
            AND sm.item_id = $2
            ${dateSql}

        ORDER BY
            sm.movement_date DESC,
            sm.id DESC

        LIMIT ${limitParam}
        `,
    params,
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    item_id: Number(row.item_id),
    item_type: row.item_type,
    direction: row.direction,
    quantity: toNumber(row.quantity),
    movement_type: row.movement_type,
    reference_type: row.reference_type,
    reference_id: row.reference_id ? Number(row.reference_id) : null,
    movement_date: row.movement_date,
    remarks: row.remarks || "",
  }));
};

module.exports = {
  getStockReport,
  getItemMovements,
};
