const pool = require("../config/db");

/* ========================================
   GET ALL BOMS
======================================== */

const getAllBoms = async () => {
  const result = await pool.query(`
    SELECT
      pb.id,
      pb.product_id,
      pb.name,
      pb.is_active,
      pb.created_at,

      p.code AS product_code,
      p.name AS product_name,
      p.unit AS product_unit,

      COALESCE(
        json_agg(
          json_build_object(
            'id', pbi.id,
            'raw_material_id', pbi.raw_material_id,
            'raw_material_code', rm.code,
            'raw_material_name', rm.name,
            'quantity', pbi.quantity,
            'unit', pbi.unit
          )
          ORDER BY pbi.id
        ) FILTER (WHERE pbi.id IS NOT NULL),
        '[]'::json
      ) AS items

    FROM product_boms pb

    INNER JOIN products p
      ON p.id = pb.product_id

    LEFT JOIN product_bom_items pbi
      ON pbi.bom_id = pb.id

    LEFT JOIN raw_materials rm
      ON rm.id = pbi.raw_material_id

    GROUP BY
      pb.id,
      p.id

    ORDER BY
      pb.id DESC
  `);

  return result.rows;
};


/* ========================================
   GET BOM BY ID
======================================== */

const getBomById = async (id) => {
  const result = await pool.query(
    `
    SELECT
      pb.id,
      pb.product_id,
      pb.name,
      pb.is_active,
      pb.created_at,

      p.code AS product_code,
      p.name AS product_name,
      p.unit AS product_unit,

      COALESCE(
        json_agg(
          json_build_object(
            'id', pbi.id,
            'raw_material_id', pbi.raw_material_id,
            'raw_material_code', rm.code,
            'raw_material_name', rm.name,
            'quantity', pbi.quantity,
            'unit', pbi.unit
          )
          ORDER BY pbi.id
        ) FILTER (WHERE pbi.id IS NOT NULL),
        '[]'::json
      ) AS items

    FROM product_boms pb

    INNER JOIN products p
      ON p.id = pb.product_id

    LEFT JOIN product_bom_items pbi
      ON pbi.bom_id = pb.id

    LEFT JOIN raw_materials rm
      ON rm.id = pbi.raw_material_id

    WHERE pb.id = $1

    GROUP BY
      pb.id,
      p.id
    `,
    [id]
  );

  return result.rows[0] || null;
};


/* ========================================
   CREATE BOM
======================================== */

const createBom = async ({
  productId,
  name,
  isActive,
  items,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* ---------- PRODUCT ---------- */

    const productResult = await client.query(
      `
      SELECT
        id,
        unit,
        is_active
      FROM products
      WHERE id = $1
      `,
      [productId]
    );

    if (!productResult.rows.length) {
      const error = new Error("Product not found.");
      error.statusCode = 404;
      throw error;
    }

    const product = productResult.rows[0];

    if (!product.is_active) {
      const error = new Error(
        "Cannot create BOM for an inactive product."
      );

      error.statusCode = 400;
      throw error;
    }

    /* ---------- RAW MATERIALS ---------- */

    const materialIds = items.map(
      (item) => Number(item.raw_material_id)
    );

    const materialResult = await client.query(
      `
      SELECT
        id,
        code,
        name,
        unit,
        is_active
      FROM raw_materials
      WHERE id = ANY($1::bigint[])
      `,
      [materialIds]
    );

    if (
      materialResult.rows.length !==
      materialIds.length
    ) {
      const error = new Error(
        "One or more raw materials were not found."
      );

      error.statusCode = 400;
      throw error;
    }

    const materialMap = new Map(
      materialResult.rows.map((material) => [
        String(material.id),
        material,
      ])
    );

    for (const item of items) {
      const material = materialMap.get(
        String(item.raw_material_id)
      );

      if (!material.is_active) {
        const error = new Error(
          `Raw material "${material.name}" is inactive.`
        );

        error.statusCode = 400;
        throw error;
      }
    }

    /* ---------- CREATE BOM ---------- */

    const bomResult = await client.query(
      `
      INSERT INTO product_boms (
        product_id,
        name,
        is_active
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        product_id,
        name,
        is_active,
        created_at
      `,
      [
        productId,
        name,
        isActive,
      ]
    );

    const bom = bomResult.rows[0];

    /* ---------- CREATE ITEMS ---------- */

    for (const item of items) {
      const material = materialMap.get(
        String(item.raw_material_id)
      );

      await client.query(
        `
        INSERT INTO product_bom_items (
          bom_id,
          raw_material_id,
          quantity,
          unit
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          bom.id,
          item.raw_material_id,
          item.quantity,
          material.unit,
        ]
      );
    }

    await client.query("COMMIT");

    return getBomById(bom.id);
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};


/* ========================================
   UPDATE BOM
======================================== */

const updateBom = async ({
  id,
  productId,
  name,
  isActive,
  items,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* ---------- BOM CHECK ---------- */

    const bomResult = await client.query(
      `
      SELECT id
      FROM product_boms
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (!bomResult.rows.length) {
      const error = new Error(
        "Product BOM not found."
      );

      error.statusCode = 404;
      throw error;
    }

    /* ---------- PRODUCT ---------- */

    const productResult = await client.query(
      `
      SELECT
        id,
        is_active
      FROM products
      WHERE id = $1
      `,
      [productId]
    );

    if (!productResult.rows.length) {
      const error = new Error(
        "Product not found."
      );

      error.statusCode = 404;
      throw error;
    }

    if (!productResult.rows[0].is_active) {
      const error = new Error(
        "Cannot use an inactive product."
      );

      error.statusCode = 400;
      throw error;
    }

    /* ---------- MATERIALS ---------- */

    const materialIds = items.map(
      (item) => Number(item.raw_material_id)
    );

    const materialResult = await client.query(
      `
      SELECT
        id,
        name,
        unit,
        is_active
      FROM raw_materials
      WHERE id = ANY($1::bigint[])
      `,
      [materialIds]
    );

    if (
      materialResult.rows.length !==
      materialIds.length
    ) {
      const error = new Error(
        "One or more raw materials were not found."
      );

      error.statusCode = 400;
      throw error;
    }

    const materialMap = new Map(
      materialResult.rows.map((material) => [
        String(material.id),
        material,
      ])
    );

    for (const item of items) {
      const material = materialMap.get(
        String(item.raw_material_id)
      );

      if (!material.is_active) {
        const error = new Error(
          `Raw material "${material.name}" is inactive.`
        );

        error.statusCode = 400;
        throw error;
      }
    }

    /* ---------- UPDATE BOM ---------- */

    await client.query(
      `
      UPDATE product_boms
      SET
        product_id = $1,
        name = $2,
        is_active = $3
      WHERE id = $4
      `,
      [
        productId,
        name,
        isActive,
        id,
      ]
    );

    /* ---------- REPLACE ITEMS ---------- */

    await client.query(
      `
      DELETE FROM product_bom_items
      WHERE bom_id = $1
      `,
      [id]
    );

    for (const item of items) {
      const material = materialMap.get(
        String(item.raw_material_id)
      );

      await client.query(
        `
        INSERT INTO product_bom_items (
          bom_id,
          raw_material_id,
          quantity,
          unit
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          id,
          item.raw_material_id,
          item.quantity,
          material.unit,
        ]
      );
    }

    await client.query("COMMIT");

    return getBomById(id);
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};


/* ========================================
   DELETE BOM
======================================== */

const deleteBom = async (id) => {
  const result = await pool.query(
    `
    DELETE FROM product_boms
    WHERE id = $1
    RETURNING id
    `,
    [id]
  );

  if (!result.rows.length) {
    const error = new Error(
      "Product BOM not found."
    );

    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
};


/* ========================================
   EXPORT
======================================== */

module.exports = {
  getAllBoms,
  getBomById,
  createBom,
  updateBom,
  deleteBom,
};