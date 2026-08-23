const pool = require("../config/db");

const normalizeName = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const name = String(value).trim();

  return name || null;
};

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
};

const mapCategory = (row) => ({
  id: Number(row.id),
  name: row.name,
  is_active: row.is_active,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const listCategories = async () => {
  const result = await pool.query(`
    SELECT
      id,
      name,
      is_active,
      created_at,
      updated_at
    FROM product_categories
    WHERE is_active = TRUE
    ORDER BY name ASC
  `);

  return result.rows.map(mapCategory);
};

const createCategory = async ({
  name,
}) => {
  const categoryName = normalizeName(name);

  if (!categoryName) {
    throw createError(
      "Category name is required.",
      400
    );
  }

  if (categoryName.length > 100) {
    throw createError(
      "Category name cannot exceed 100 characters.",
      400
    );
  }

  const existing = await pool.query(
    `
      SELECT
        id,
        name,
        is_active
      FROM product_categories
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1
    `,
    [categoryName]
  );

  if (existing.rowCount > 0) {
    const category = existing.rows[0];

    if (!category.is_active) {
      const result = await pool.query(
        `
          UPDATE product_categories
          SET
            is_active = TRUE,
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            name,
            is_active,
            created_at,
            updated_at
        `,
        [category.id]
      );

      return mapCategory(result.rows[0]);
    }

    throw createError(
      "Category already exists.",
      409
    );
  }

  const result = await pool.query(
    `
      INSERT INTO product_categories (
        name
      )
      VALUES ($1)
      RETURNING
        id,
        name,
        is_active,
        created_at,
        updated_at
    `,
    [categoryName]
  );

  return mapCategory(result.rows[0]);
};

module.exports = {
  listCategories,
  createCategory,
};