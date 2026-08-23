const pool = require("../config/db");

/*
 * Finished Stock business rules
 *
 * 1. PRODUCT + IN
 *    -> Finished stock received
 *
 * 2. PRODUCT + OUT + SALE
 *    -> Actual customer sale
 *    -> Counts as Stock Out
 *
 * 3. PRODUCT + OUT + DISPATCH
 *    -> Actual dispatch
 *    -> Counts as Stock Out
 *
 * 4. PRODUCT + OUT + PRODUCTION_EDIT_ADJUSTMENT
 *    -> Production correction / damage
 *    -> Reduces Available Stock
 *    -> DOES NOT count as Stock Out
 *
 * 5. PRODUCT + OUT + PRODUCTION_DELETE_REVERSAL
 *    -> Production reversal
 *    -> Reduces Available Stock
 *    -> DOES NOT count as Stock Out
 *
 * Important:
 * ------------------------------------------------------------
 * total_out
 *     = ALL PRODUCT OUT movements
 *
 * stock_out
 *     = ONLY SALE / DISPATCH OUT movements
 *
 * This separation is required because an adjustment can reduce
 * physical stock without being a customer sale.
 * ------------------------------------------------------------
 */

const getFinishedStock = async () => {
    const { rows } = await pool.query(`
        WITH movement_totals AS (
            SELECT
                sm.item_id AS product_id,

                /*
                 * ALL stock received
                 */
                COALESCE(
                    SUM(
                        CASE
                            WHEN sm.direction = 'IN'
                            THEN sm.quantity
                            ELSE 0
                        END
                    ),
                    0
                ) AS total_in,

                /*
                 * ALL stock removed from finished stock.
                 *
                 * This includes:
                 * SALE
                 * DISPATCH
                 * PRODUCTION_EDIT_ADJUSTMENT
                 * PRODUCTION_DELETE_REVERSAL
                 * etc.
                 *
                 * Used ONLY for current available stock.
                 */
                COALESCE(
                    SUM(
                        CASE
                            WHEN sm.direction = 'OUT'
                            THEN sm.quantity
                            ELSE 0
                        END
                    ),
                    0
                ) AS total_out,

                /*
                 * Today's ALL IN.
                 *
                 * Used for opening stock calculation.
                 */
                COALESCE(
                    SUM(
                        CASE
                            WHEN sm.direction = 'IN'
                             AND sm.movement_date::date = CURRENT_DATE
                             AND UPPER(COALESCE(sm.reference_type, '')) 
                                NOT IN (
                                    'PRODUCTION_EDIT_ADJUSTMENT',
                                    'PRODUCTION_DELETE_REVERSAL'
                                )
                            THEN sm.quantity
                            ELSE 0
                        END
                    ),
                    0
                ) AS today_total_in,

                /*
                 * Today's ALL OUT.
                 *
                 * Used for opening stock calculation.
                 *
                 * IMPORTANT:
                 * This includes production adjustments/damage,
                 * because those movements also changed physical
                 * stock during today.
                 */
                COALESCE(
                    SUM(
                        CASE
                            WHEN sm.direction = 'OUT'
                             AND sm.movement_date::date = CURRENT_DATE
                            THEN sm.quantity
                            ELSE 0
                        END
                    ),
                    0
                ) AS today_total_out,

                COALESCE(
                    SUM(
                        CASE
                            WHEN sm.direction = 'OUT'
                             AND sm.movement_date::date = CURRENT_DATE
                             AND UPPER(COALESCE(sm.reference_type, ''))
                                 IN ('SALE', 'DISPATCH')
                            THEN sm.quantity
                            ELSE 0
                        END
                    ),
                    0
                ) AS today_stock_out

            FROM stock_movements sm

            WHERE
                sm.item_type = 'PRODUCT'

            GROUP BY
                sm.item_id
        ),

        /*
         * Production wastage / damaged quantity.
         */
        wastage_totals AS (
            SELECT
                pb.product_id,

                COALESCE(
                    SUM(pw.quantity),
                    0
                ) AS damaged_total,

                COALESCE(
                    SUM(
                        CASE
                            WHEN pb.production_date = CURRENT_DATE
                            THEN pw.quantity
                            ELSE 0
                        END
                    ),
                    0
                ) AS damaged_today

            FROM production_wastage pw

            INNER JOIN production_batches pb
                ON pb.id = pw.production_batch_id

            GROUP BY
                pb.product_id
        )

        SELECT
            p.id,
            p.code,
            p.name,

            pc.name AS category,

            p.size,
            p.unit,
            p.minimum_stock,

            /*
             * CURRENT AVAILABLE STOCK
             *
             * ALL OUT movements reduce available stock.
             */
            COALESCE(
                mt.total_in - mt.total_out,
                0
            ) AS current_stock,

            /*
             * OPENING STOCK
             *
             * Today's ALL movements are removed from current stock.
             *
             * Example:
             *
             * Yesterday = 0
             * Today production IN = 10
             * Today damage OUT = 1
             *
             * Current = 9
             *
             * Opening = 9 - 10 + 1
             *         = 0
             */
            COALESCE(
                mt.total_in
                - mt.total_out
                - mt.today_total_in
                + mt.today_total_out,
                0
            ) AS opening_stock,

            /*
             * STOCK IN TODAY
             */
            COALESCE(
                mt.today_total_in,
                0
            ) AS stock_in,

            /*
             * STOCK OUT TODAY
             *
             * ONLY actual SALE / DISPATCH.
             */
            COALESCE(
                mt.today_stock_out,
                0
            ) AS stock_out,

            /*
             * TOTAL DAMAGED
             */
            COALESCE(
                wt.damaged_total,
                0
            ) AS damaged,

            /*
             * DAMAGED TODAY
             */
            COALESCE(
                wt.damaged_today,
                0
            ) AS damaged_today

        FROM products p

        LEFT JOIN product_categories pc
            ON pc.id = p.category_id

        LEFT JOIN movement_totals mt
            ON mt.product_id = p.id

        LEFT JOIN wastage_totals wt
            ON wt.product_id = p.id

        WHERE
            p.is_active = TRUE

        ORDER BY
            p.name ASC,
            p.id DESC
    `);

    return rows.map((row) => {
        const currentStock = Number(
            row.current_stock || 0,
        );

        const minimumStock = Number(
            row.minimum_stock || 0,
        );

        let stockStatus = "in_stock";

        if (currentStock <= 0) {
            stockStatus = "out_of_stock";
        } else if (
            minimumStock > 0 &&
            currentStock <= minimumStock
        ) {
            stockStatus = "low_stock";
        }

        return {
            id: Number(row.id),

            code: row.code,
            name: row.name,

            category: row.category || "",
            size: row.size,
            unit: row.unit,

            minimum_stock: minimumStock,

            opening_stock: Number(
                row.opening_stock || 0,
            ),

            stock_in: Number(
                row.stock_in || 0,
            ),

            stock_out: Number(
                row.stock_out || 0,
            ),

            damaged: Number(
                row.damaged || 0,
            ),

            damaged_today: Number(
                row.damaged_today || 0,
            ),

            current_stock: currentStock,

            stock_status: stockStatus,
        };
    });
};


/*
 * Recent finished-stock movements.
 *
 * NOTE:
 * We intentionally show ALL movements here.
 *
 * Therefore PRODUCTION_EDIT_ADJUSTMENT will still appear
 * in Recent Stock Movements, which is correct.
 */
const getRecentMovements = async (limit = 20) => {
    const parsedLimit = Number(limit);

    const safeLimit =
        Number.isInteger(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 100)
            : 20;

    const { rows } = await pool.query(
        `
            SELECT
                sm.id,
                sm.item_id AS product_id,

                p.name AS product_name,
                p.code AS product_code,
                p.unit,

                sm.direction,
                sm.quantity,
                sm.movement_type,
                sm.reference_type,
                sm.reference_id,
                sm.movement_date,
                sm.remarks

            FROM stock_movements sm

            INNER JOIN products p
                ON p.id = sm.item_id

            WHERE
                sm.item_type = 'PRODUCT'

            ORDER BY
                sm.movement_date DESC,
                sm.id DESC

            LIMIT $1
        `,
        [safeLimit],
    );

    return rows.map((row) => ({
        id: Number(row.id),

        product_id: Number(row.product_id),

        product_name: row.product_name,
        product_code: row.product_code,
        unit: row.unit,

        direction: row.direction,

        quantity: Number(
            row.quantity || 0,
        ),

        movement_type: row.movement_type,
        reference_type: row.reference_type,

        reference_id:
            row.reference_id === null
                ? null
                : Number(row.reference_id),

        movement_date: row.movement_date,
        remarks: row.remarks,
    }));
};


/*
 * Product-wise stock movement history.
 *
 * Shows ALL movements, including production corrections.
 */
const getProductMovements = async (productId) => {
    const id = Number(productId);

    if (!Number.isInteger(id) || id <= 0) {
        const error = new Error(
            "Invalid product id.",
        );

        error.statusCode = 400;

        throw error;
    }

    const { rows } = await pool.query(
        `
            SELECT
                sm.id,
                sm.item_id AS product_id,

                p.name AS product_name,
                p.code AS product_code,
                p.unit,

                sm.direction,
                sm.quantity,
                sm.movement_type,
                sm.reference_type,
                sm.reference_id,
                sm.movement_date,
                sm.remarks

            FROM stock_movements sm

            INNER JOIN products p
                ON p.id = sm.item_id

            WHERE
                sm.item_type = 'PRODUCT'
                AND sm.item_id = $1

            ORDER BY
                sm.movement_date DESC,
                sm.id DESC
        `,
        [id],
    );

    return rows.map((row) => ({
        id: Number(row.id),

        product_id: Number(row.product_id),

        product_name: row.product_name,
        product_code: row.product_code,
        unit: row.unit,

        direction: row.direction,

        quantity: Number(
            row.quantity || 0,
        ),

        movement_type: row.movement_type,
        reference_type: row.reference_type,

        reference_id:
            row.reference_id === null
                ? null
                : Number(row.reference_id),

        movement_date: row.movement_date,
        remarks: row.remarks,
    }));
};


module.exports = {
    getFinishedStock,
    getRecentMovements,
    getProductMovements,
};