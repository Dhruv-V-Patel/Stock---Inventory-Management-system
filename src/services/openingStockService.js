const pool = require("../config/db");
const { createAuditLog } = require("./auditLogService");

const normalizeItemType = (value) => {
    const type = String(value ?? "").trim().toUpperCase();

    if (!["PRODUCT", "RAW_MATERIAL"].includes(type)) {
        const error = new Error("Item type must be PRODUCT or RAW_MATERIAL.");
        error.statusCode = 400;
        throw error;
    }

    return type;
};

const normalizeDate = (value) => {
    const date = String(value ?? "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const error = new Error("Opening date must be in YYYY-MM-DD format.");
        error.statusCode = 400;
        throw error;
    }

    return date;
};

const normalizeNonNegativeNumber = (value, fieldName) => {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        const error = new Error(`${fieldName} must be zero or greater.`);
        error.statusCode = 400;
        throw error;
    }

    return number;
};

const getItem = async (client, itemType, itemId) => {
    const table = itemType === "PRODUCT" ? "products" : "raw_materials";

    const { rows } = await client.query(
        `
            SELECT
                id,
                code,
                name,
                unit,
                is_active
            FROM ${table}
            WHERE id = $1
        `,
        [itemId]
    );

    if (!rows.length) {
        const error = new Error(
            `${itemType === "PRODUCT" ? "Product" : "Raw material"} not found.`
        );
        error.statusCode = 404;
        throw error;
    }

    if (!rows[0].is_active) {
        const error = new Error(
            `Selected ${itemType === "PRODUCT" ? "product" : "raw material"} is inactive.`
        );
        error.statusCode = 400;
        throw error;
    }

    return rows[0];
};

const getOpeningStockById = async (client, id) => {
    const { rows } = await client.query(
        `
            SELECT
                os.id,
                os.item_type,
                os.item_id,
                os.opening_date::text AS opening_date,
                os.quantity,
                os.rate,
                os.remarks,
                os.created_by,
                os.created_at,
                os.updated_at,

                CASE
                    WHEN os.item_type = 'PRODUCT' THEN p.code
                    ELSE rm.code
                END AS item_code,

                CASE
                    WHEN os.item_type = 'PRODUCT' THEN p.name
                    ELSE rm.name
                END AS item_name,

                CASE
                    WHEN os.item_type = 'PRODUCT' THEN p.unit
                    ELSE rm.unit
                END AS unit

            FROM opening_stock os

            LEFT JOIN products p
                ON os.item_type = 'PRODUCT'
                AND p.id = os.item_id

            LEFT JOIN raw_materials rm
                ON os.item_type = 'RAW_MATERIAL'
                AND rm.id = os.item_id

            WHERE os.id = $1
        `,
        [id]
    );

    return rows[0] || null;
};

const listOpeningStock = async ({
    openingDate = "",
    itemType = "",
    search = "",
} = {}) => {
    const values = [];
    const where = [];

    if (openingDate) {
        values.push(openingDate);
        where.push(`os.opening_date = $${values.length}::date`);
    }

    if (itemType) {
        values.push(normalizeItemType(itemType));
        where.push(`os.item_type = $${values.length}`);
    }

    if (search?.trim()) {
        values.push(`%${search.trim()}%`);
        const index = values.length;

        where.push(`
            (
                COALESCE(p.code, rm.code, '') ILIKE $${index}
                OR COALESCE(p.name, rm.name, '') ILIKE $${index}
            )
        `);
    }

    const query = `
        SELECT
            os.id,
            os.item_type,
            os.item_id,
            os.opening_date::text AS opening_date,
            os.quantity AS opening_stock,
            os.rate,
            os.remarks,

            CASE
                WHEN os.item_type = 'PRODUCT' THEN p.code
                ELSE rm.code
            END AS item_code,

            CASE
                WHEN os.item_type = 'PRODUCT' THEN p.name
                ELSE rm.name
            END AS item_name,

            CASE
                WHEN os.item_type = 'PRODUCT' THEN p.unit
                ELSE rm.unit
            END AS unit

        FROM opening_stock os

        LEFT JOIN products p
            ON os.item_type = 'PRODUCT'
            AND p.id = os.item_id

        LEFT JOIN raw_materials rm
            ON os.item_type = 'RAW_MATERIAL'
            AND rm.id = os.item_id

        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}

        ORDER BY
            os.item_type ASC,
            item_name ASC,
            os.id ASC;
    `;

    const { rows } = await pool.query(query, values);

    return rows;
};

const listItemsForOpeningStock = async ({
    itemType = "",
    search = "",
    openingDate = "",
} = {}) => {
    const values = [];
    const where = [];

    if (openingDate) {
        values.push(openingDate);
    }

    if (search?.trim()) {
        values.push(`%${search.trim()}%`);
    }

    const searchIndex = openingDate ? 2 : 1;

    if (search?.trim()) {
        where.push(`
            (
                i.code ILIKE $${searchIndex}
                OR i.name ILIKE $${searchIndex}
            )
        `);
    }

    const buildQuery = (type, table) => {
        const activeWhere = ["i.is_active = TRUE", ...where];

        return `
            SELECT
                i.id AS item_id,
                '${type}' AS item_type,
                i.code AS item_code,
                i.name AS item_name,
                i.unit,
                COALESCE(os.quantity, 0) AS opening_stock,
                COALESCE(os.rate, 0) AS rate,
                os.id,
                os.opening_date::text AS opening_date,
                os.remarks
            FROM ${table} i
            LEFT JOIN opening_stock os
                ON os.item_type = '${type}'
                AND os.item_id = i.id
                ${openingDate ? "AND os.opening_date = $1::date" : ""}
            WHERE ${activeWhere.join(" AND ")}
        `;
    };

    let query;

    if (itemType === "PRODUCT") {
        query = buildQuery("PRODUCT", "products");
    } else if (itemType === "RAW_MATERIAL") {
        query = buildQuery("RAW_MATERIAL", "raw_materials");
    } else {
        query = `
            SELECT * FROM (
                ${buildQuery("PRODUCT", "products")}
                UNION ALL
                ${buildQuery("RAW_MATERIAL", "raw_materials")}
            ) items
            ORDER BY item_type, item_name;
        `;
    }

    const { rows } = await pool.query(query, values);

    return rows;
};

const createOrUpdateOpeningStock = async ({
    id = null,
    itemType,
    itemId,
    openingDate,
    quantity,
    rate,
    remarks = null,
    userId = null,
    ipAddress = null,
}) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const normalizedType = normalizeItemType(itemType);
        const normalizedItemId = Number(itemId);
        const normalizedDate = normalizeDate(openingDate);
        const normalizedQuantity = normalizeNonNegativeNumber(
            quantity,
            "Opening stock"
        );
        const normalizedRate = normalizeNonNegativeNumber(rate, "Rate");

        if (!Number.isInteger(normalizedItemId) || normalizedItemId <= 0) {
            const error = new Error("Valid item ID is required.");
            error.statusCode = 400;
            throw error;
        }

        const item = await getItem(
            client,
            normalizedType,
            normalizedItemId
        );

        let existingResult;

        if (id) {
            existingResult = await client.query(
                `
                    SELECT *
                    FROM opening_stock
                    WHERE id = $1
                    FOR UPDATE
                `,
                [id]
            );
        } else {
            existingResult = await client.query(
                `
                    SELECT *
                    FROM opening_stock
                    WHERE item_type = $1
                      AND item_id = $2
                    FOR UPDATE
                `,
                [normalizedType, normalizedItemId]
            );
        }

        const existing = existingResult.rows[0] || null;
        const oldData = existing
            ? await getOpeningStockById(client, existing.id)
            : null;

        if (
            existing &&
            (
                existing.item_type !== normalizedType ||
                Number(existing.item_id) !== normalizedItemId
            )
        ) {
            const error = new Error(
                "Opening stock item cannot be changed during edit."
            );
            error.statusCode = 400;
            throw error;
        }

        let openingStockId;

        if (existing) {
            openingStockId = existing.id;

            await client.query(
                `
                    UPDATE opening_stock
                    SET
                        opening_date = $1::date,
                        quantity = $2,
                        rate = $3,
                        remarks = $4,
                        updated_at = NOW()
                    WHERE id = $5
                `,
                [
                    normalizedDate,
                    normalizedQuantity,
                    normalizedRate,
                    remarks,
                    openingStockId,
                ]
            );
        } else {
            const result = await client.query(
                `
                    INSERT INTO opening_stock (
                        item_type,
                        item_id,
                        opening_date,
                        quantity,
                        rate,
                        remarks,
                        created_by
                    )
                    VALUES ($1, $2, $3::date, $4, $5, $6, $7)
                    RETURNING id
                `,
                [
                    normalizedType,
                    normalizedItemId,
                    normalizedDate,
                    normalizedQuantity,
                    normalizedRate,
                    remarks,
                    userId || null,
                ]
            );

            openingStockId = result.rows[0].id;
        }

        /*
         * Keep opening stock represented in stock_movements.
         *
         * There is intentionally one OPENING_STOCK movement per item.
         * On edit, remove the old movement and create the new one.
         * This keeps current stock calculation compatible with the
         * existing production/purchase/sales stock logic.
         */
        await client.query(
            `
                DELETE FROM stock_movements
                WHERE reference_type = 'OPENING_STOCK'
                  AND reference_id = $1
            `,
            [openingStockId]
        );

        if (normalizedQuantity > 0) {
            await client.query(
                `
                    INSERT INTO stock_movements (
                        item_type,
                        item_id,
                        direction,
                        quantity,
                        movement_type,
                        reference_type,
                        reference_id,
                        movement_date,
                        remarks,
                        created_by
                    )
                    VALUES (
                        $1,
                        $2,
                        'IN',
                        $3,
                        'OPENING_STOCK',
                        'OPENING_STOCK',
                        $4,
                        $5::date,
                        $6,
                        $7
                    )
                `,
                [
                    normalizedType,
                    normalizedItemId,
                    normalizedQuantity,
                    openingStockId,
                    normalizedDate,
                    remarks || `Opening stock for ${item.name}`,
                    userId || null,
                ]
            );
        }

        const newData = await getOpeningStockById(
            client,
            openingStockId
        );

        await client.query("COMMIT");

        await createAuditLog({
            userId: userId || null,
            module: "OPENING STOCK",
            action: existing ? "UPDATE" : "CREATE",
            recordId: Number(openingStockId),
            oldData,
            newData,
            ipAddress: ipAddress || null,
        });

        return newData;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const deleteOpeningStock = async ({
    id,
    userId = null,
    ipAddress = null,
}) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const existing = await client.query(
            `
                SELECT *
                FROM opening_stock
                WHERE id = $1
                FOR UPDATE
            `,
            [id]
        );

        if (!existing.rows.length) {
            const error = new Error("Opening stock not found.");
            error.statusCode = 404;
            throw error;
        }

        const oldData = await getOpeningStockById(client, id);

        await client.query(
            `
                DELETE FROM stock_movements
                WHERE reference_type = 'OPENING_STOCK'
                  AND reference_id = $1
            `,
            [id]
        );

        await client.query(
            `
                DELETE FROM opening_stock
                WHERE id = $1
            `,
            [id]
        );

        await client.query("COMMIT");

        await createAuditLog({
            userId: userId || null,
            module: "OPENING_STOCK",
            action: "DELETE",
            recordId: Number(id),
            oldData,
            newData: null,
            ipAddress: ipAddress || null,
        });

        return {
            id: Number(id),
            message: "Opening stock deleted successfully.",
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    listOpeningStock,
    listItemsForOpeningStock,
    createOrUpdateOpeningStock,
    deleteOpeningStock,
};
