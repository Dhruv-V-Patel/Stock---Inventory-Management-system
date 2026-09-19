const pool = require("../config/db");

const formatCategoryName = (value) => {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase());
};

const mapRawMaterial = (row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
    category: row.category,
    unit: row.unit,
    minimum_stock: row.minimum_stock,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const listRawMaterials = async ({ search = "", category = "", status = "" } = {}) => {
    const values = [];
    const where = [];

    if (search?.trim()) {
        values.push(`%${search.trim()}%`);
        const index = values.length;

        where.push(`
            (
                rm.code ILIKE $${index}
                OR rm.name ILIKE $${index}
                OR COALESCE(rm.category, '') ILIKE $${index}
            )
        `);
    }

    if (category?.trim()) {
        values.push(category.trim());
        where.push(`rm.category = $${values.length}`);
    }

    if (status === "active") {
        where.push("rm.is_active = TRUE");
    }

    if (status === "inactive") {
        where.push("rm.is_active = FALSE");
    }

    const query = `
        SELECT
            rm.id,
            rm.code,
            rm.name,
            rm.category,
            rm.unit,
            rm.minimum_stock,
            rm.is_active,
            rm.created_at,
            rm.updated_at,

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

        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}

        GROUP BY
            rm.id,
            rm.code,
            rm.name,
            rm.category,
            rm.unit,
            rm.minimum_stock,
            rm.is_active,
            rm.created_at,
            rm.updated_at

        ORDER BY
            rm.is_active DESC,
            rm.name ASC;
    `;

    const { rows } = await pool.query(query, values);

    return rows.map((row) => ({
        ...mapRawMaterial(row),
        current_stock: row.current_stock
    }));
};

const getRawMaterialById = async (id) => {
    const query = `
        SELECT
            rm.id,
            rm.code,
            rm.name,
            rm.category,
            rm.unit,
            rm.minimum_stock,
            rm.is_active,
            rm.created_at,
            rm.updated_at,
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
            rm.minimum_stock,
            rm.is_active,
            rm.created_at,
            rm.updated_at;
    `;

    const { rows } = await pool.query(query, [id]);

    return rows[0]
        ? {
            ...mapRawMaterial(rows[0]),
            current_stock: rows[0].current_stock
        }
        : null;
};

const getNextRawMaterialCode = async () => {
    const query = `
        SELECT
            COALESCE(
                MAX(
                    CAST(
                        SUBSTRING(code FROM '^RM-([0-9]+)$')
                        AS INTEGER
                    )
                ),
                0
            ) + 1 AS next_number
        FROM raw_materials
        WHERE code ~ '^RM-[0-9]+$';
    `;

    const { rows } = await pool.query(query);

    const nextNumber = Number(rows[0]?.next_number || 1);

    return `RM-${String(nextNumber).padStart(3, "0")}`;
};

const getRawMaterialSummary = async () => {
    const query = `
        SELECT
            COUNT(*)::INTEGER AS total_materials,
            COUNT(*) FILTER (WHERE is_active = TRUE)::INTEGER AS active_materials,
            COUNT(*) FILTER (WHERE is_active = FALSE)::INTEGER AS inactive_materials,
            COUNT(DISTINCT NULLIF(TRIM(category), ''))::INTEGER AS total_categories
        FROM raw_materials;
    `;

    const { rows } = await pool.query(query);

    return rows[0];
};

const createRawMaterial = async ({
    code,
    name,
    category = null,
    unit,
    minimum_stock = 0,
    is_active = true
}) => {
    const query = `
        INSERT INTO raw_materials (
            code,
            name,
            category,
            unit,
            minimum_stock,
            is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
            id,
            code,
            name,
            category,
            unit,
            minimum_stock,
            is_active,
            created_at,
            updated_at;
    `;

    const formattedCategory = formatCategoryName(category);

    const { rows } = await pool.query(query, [
        code,
        name,
        formattedCategory,
        unit,
        minimum_stock,
        is_active
    ]);

    return mapRawMaterial(rows[0]);
};

const updateRawMaterial = async (
    id,
    {
        code,
        name,
        category = null,
        unit,
        minimum_stock = 0,
        is_active = true
    }
) => {
    const query = `
        UPDATE raw_materials
        SET
            code = $1,
            name = $2,
            category = $3,
            unit = $4,
            minimum_stock = $5,
            is_active = $6,
            updated_at = NOW()
        WHERE id = $7
        RETURNING
            id,
            code,
            name,
            category,
            unit,
            minimum_stock,
            is_active,
            created_at,
            updated_at;
    `;

    const formattedCategory = formatCategoryName(category);

    const { rows } = await pool.query(query, [
        code,
        name,
        formattedCategory,
        unit,
        minimum_stock,
        is_active,
        id
    ]);

    return rows[0] ? mapRawMaterial(rows[0]) : null;
};

// const deactivateRawMaterial = async (id) => {
//     const query = `
//         UPDATE raw_materials
//         SET
//             is_active = FALSE,
//             updated_at = NOW()
//         WHERE id = $1
//         RETURNING
//             id,
//             code,
//             name,
//             category,
//             unit,
//             minimum_stock,
//             is_active,
//             created_at,
//             updated_at;
//     `;

//     const { rows } = await pool.query(query, [id]);

//     return rows[0] ? mapRawMaterial(rows[0]) : null;
// };

const deleteRawMaterial = async (id) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Lock material
        const materialResult = await client.query(
            `
                SELECT
                    id,
                    code,
                    name,
                    category,
                    unit,
                    minimum_stock,
                    is_active,
                    created_at,
                    updated_at
                FROM raw_materials
                WHERE id = $1
                FOR UPDATE
            `,
            [id]
        );

        if (materialResult.rowCount === 0) {
            const error = new Error("Raw material not found.");
            error.statusCode = 404;
            throw error;
        }

        const material = materialResult.rows[0];

        // Check all references
        const referenceResult = await client.query(
            `
                SELECT
                    EXISTS (
                        SELECT 1
                        FROM purchase_items
                        WHERE raw_material_id = $1
                    ) AS purchase_reference,

                    EXISTS (
                        SELECT 1
                        FROM purchase_return_items
                        WHERE raw_material_id = $1
                    ) AS purchase_return_reference,

                    EXISTS (
                        SELECT 1
                        FROM product_bom_items
                        WHERE raw_material_id = $1
                    ) AS bom_reference,

                    EXISTS (
                        SELECT 1
                        FROM production_materials
                        WHERE raw_material_id = $1
                    ) AS production_reference,

                    EXISTS (
                        SELECT 1
                        FROM stock_movements
                        WHERE item_type = 'RAW_MATERIAL'
                          AND item_id = $1
                    ) AS stock_reference
            `,
            [id]
        );

        const references = referenceResult.rows[0];

        const usedIn = [];

        if (references.purchase_reference) {
            usedIn.push("Purchase");
        }

        if (references.purchase_return_reference) {
            usedIn.push("Purchase Return");
        }

        if (references.bom_reference) {
            usedIn.push("BOM");
        }

        if (references.production_reference) {
            usedIn.push("Production");
        }

        if (references.stock_reference) {
            usedIn.push("Stock Movement");
        }

        // Block delete if used anywhere
        if (usedIn.length > 0) {
            const error = new Error(
                `Cannot delete "${material.name}". This raw material is already used in: ${usedIn.join(", ")}.`
            );

            error.statusCode = 409;
            error.code = "RAW_MATERIAL_IN_USE";
            error.usedIn = usedIn;

            throw error;
        }

        // Permanent delete
        await client.query(
            `
                DELETE FROM raw_materials
                WHERE id = $1
            `,
            [id]
        );

        await client.query("COMMIT");

        return mapRawMaterial(material);

    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    listRawMaterials,
    getRawMaterialById,
    getRawMaterialSummary,
    createRawMaterial,
    updateRawMaterial,
    // deactivateRawMaterial,
    deleteRawMaterial,
    getNextRawMaterialCode,
};
