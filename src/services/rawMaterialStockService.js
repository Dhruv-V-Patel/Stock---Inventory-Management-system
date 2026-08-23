const pool = require("../config/db");

/*
 * Raw Material Stock
 *
 * Current stock is NOT stored in raw_materials.
 * It is calculated from stock_movements:
 *
 * IN  -> +
 * OUT -> -
 *
 * Only RAW_MATERIAL movements are included.
 */

const getRawMaterialStock = async () => {
    const query = `
        SELECT
            rm.id,
            rm.code,
            rm.name,
            rm.category,
            rm.unit,
            rm.minimum_stock,

            COALESCE(
                SUM(
                    CASE
                        WHEN sm.direction = 'IN' THEN sm.quantity
                        WHEN sm.direction = 'OUT' THEN -sm.quantity
                        ELSE 0
                    END
                ),
                0
            ) AS current_stock,

            CASE
                WHEN COALESCE(
                    SUM(
                        CASE
                            WHEN sm.direction = 'IN' THEN sm.quantity
                            WHEN sm.direction = 'OUT' THEN -sm.quantity
                            ELSE 0
                        END
                    ),
                    0
                ) <= 0
                    THEN 'out_of_stock'

                WHEN COALESCE(
                    SUM(
                        CASE
                            WHEN sm.direction = 'IN' THEN sm.quantity
                            WHEN sm.direction = 'OUT' THEN -sm.quantity
                            ELSE 0
                        END
                    ),
                    0
                ) <= rm.minimum_stock
                    THEN 'low_stock'

                ELSE 'in_stock'
            END AS stock_status

        FROM raw_materials rm

        LEFT JOIN stock_movements sm
            ON sm.item_type = 'RAW_MATERIAL'
            AND sm.item_id = rm.id

        WHERE rm.is_active = TRUE

        GROUP BY
            rm.id,
            rm.code,
            rm.name,
            rm.category,
            rm.unit,
            rm.minimum_stock

        ORDER BY
            CASE
                WHEN COALESCE(
                    SUM(
                        CASE
                            WHEN sm.direction = 'IN' THEN sm.quantity
                            WHEN sm.direction = 'OUT' THEN -sm.quantity
                            ELSE 0
                        END
                    ),
                    0
                ) <= 0 THEN 1

                WHEN COALESCE(
                    SUM(
                        CASE
                            WHEN sm.direction = 'IN' THEN sm.quantity
                            WHEN sm.direction = 'OUT' THEN -sm.quantity
                            ELSE 0
                        END
                    ),
                    0
                ) <= rm.minimum_stock THEN 2

                ELSE 3
            END,
            rm.name ASC;
    `;

    const { rows } = await pool.query(query);
    return rows;
};

const getRawMaterialStockById = async (id) => {
    const query = `
        SELECT
            rm.id,
            rm.code,
            rm.name,
            rm.category,
            rm.unit,
            rm.minimum_stock,
            COALESCE(
                SUM(
                    CASE
                        WHEN sm.direction = 'IN' THEN sm.quantity
                        WHEN sm.direction = 'OUT' THEN -sm.quantity
                        ELSE 0
                    END
                ),
                0
            ) AS current_stock
        FROM raw_materials rm
        LEFT JOIN stock_movements sm
            ON sm.item_type = 'RAW_MATERIAL'
            AND sm.item_id = rm.id
        WHERE rm.id = $1
        GROUP BY
            rm.id,
            rm.code,
            rm.name,
            rm.category,
            rm.unit,
            rm.minimum_stock;
    `;

    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
};

const getRawMaterialStockMovements = async (id) => {
    const query = `
        SELECT
            id,
            direction,
            quantity,
            movement_type,
            reference_type,
            reference_id,
            movement_date,
            remarks
        FROM stock_movements
        WHERE item_type = 'RAW_MATERIAL'
          AND item_id = $1
        ORDER BY movement_date DESC, id DESC;
    `;

    const { rows } = await pool.query(query, [id]);
    return rows;
};

const getRawMaterialStockSummary = async () => {
    const query = `
        WITH stock AS (
            SELECT
                rm.id,
                rm.minimum_stock,
                COALESCE(
                    SUM(
                        CASE
                            WHEN sm.direction = 'IN' THEN sm.quantity
                            WHEN sm.direction = 'OUT' THEN -sm.quantity
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
            GROUP BY rm.id, rm.minimum_stock
        )
        SELECT
            COUNT(*)::INTEGER AS total_materials,
            COUNT(*) FILTER (
                WHERE current_stock > minimum_stock
            )::INTEGER AS in_stock,
            COUNT(*) FILTER (
                WHERE current_stock > 0
                  AND current_stock <= minimum_stock
            )::INTEGER AS low_stock,
            COUNT(*) FILTER (
                WHERE current_stock <= 0
            )::INTEGER AS out_of_stock
        FROM stock;
    `;

    const { rows } = await pool.query(query);
    return rows[0];
};

module.exports = {
    getRawMaterialStock,
    getRawMaterialStockById,
    getRawMaterialStockMovements,
    getRawMaterialStockSummary,
};
