const pool = require("../config/db");
/* ---------------------------------- */
/* Helpers                            */
/* ---------------------------------- */

const validationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;

  return error;
};

const notFoundError = (message) => {
  const error = new Error(message);
  error.statusCode = 404;

  return error;
};

const normalizeText = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  return text.length > 0 ? text : null;
};

const parseId = (value) => {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw validationError("Invalid product id.");
  }

  return id;
};

const parseNonNegativeNumber = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw validationError(`${fieldName} must be a valid non-negative number.`);
  }

  return number;
};

const parseBoolean = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === true || value === "true" || value === "1" || value === 1) {
    return true;
  }

  if (value === false || value === "false" || value === "0" || value === 0) {
    return false;
  }

  throw validationError("is_active must be true or false.");
};

/* ---------------------------------- */
/* Validation                         */
/* ---------------------------------- */

const validateProductPayload = (
  body,
  { partial = false } = {},
) => {
  const payload = {};

  /* Code */

  if (!partial || body.code !== undefined) {
    const code = normalizeText(body.code);

    if (!code) {
      throw validationError(
        "Product code is required.",
      );
    }

    if (code.length > 50) {
      throw validationError(
        "Product code cannot exceed 50 characters.",
      );
    }

    payload.code = code;
  }

  /* Name */

  if (!partial || body.name !== undefined) {
    const name = normalizeText(body.name);

    if (!name) {
      throw validationError(
        "Product name is required.",
      );
    }

    if (name.length > 150) {
      throw validationError(
        "Product name cannot exceed 150 characters.",
      );
    }

    payload.name = name;
  }

  /* Category */

  if (!partial || body.category_id !== undefined) {
    const categoryId =
      body.category_id === null ||
      body.category_id === undefined ||
      body.category_id === ""
        ? null
        : Number(body.category_id);

    if (
      categoryId !== null &&
      (!Number.isInteger(categoryId) ||
        categoryId <= 0)
    ) {
      throw validationError(
        "Category is invalid.",
      );
    }

    payload.category_id = categoryId;
  }

  /* Size */

  if (!partial || body.size !== undefined) {
    const size = normalizeText(body.size);

    if (size && size.length > 100) {
      throw validationError(
        "Size / specification cannot exceed 100 characters.",
      );
    }

    payload.size = size;
  }

  if (!partial || body.unit !== undefined) {
    const unit =
      normalizeText(body.unit) || "PCS";

    if (unit.length > 20) {
      throw validationError(
        "Unit cannot exceed 20 characters.",
      );
    }

    payload.unit = unit;
  }

  if (!partial || body.minimum_stock !== undefined) {
    payload.minimum_stock =
      parseNonNegativeNumber(
        body.minimum_stock,
        "Minimum stock",
      );
  }

  if (!partial || body.selling_rate !== undefined) {
    payload.selling_rate =
      parseNonNegativeNumber(
        body.selling_rate,
        "Selling rate",
      );
  }


  if (!partial || body.is_active !== undefined) {
    payload.is_active =
      parseBoolean(
        body.is_active,
        true,
      );
  }

  return payload;
};

/* ---------------------------------- */
/* Mapping                            */
/* ---------------------------------- */

const mapProduct = (row) => ({
  id: Number(row.id),

  code: row.code,

  name: row.name,

  category_id: row.category_id ? Number(row.category_id) : null,

  category_name: row.category_name ?? "",

  size: row.size,

  unit: row.unit,

  minimum_stock: Number(row.minimum_stock),

  selling_rate: Number(row.selling_rate),

  is_active: row.is_active,

  created_at: row.created_at,

  updated_at: row.updated_at,
});

const createAuditLog = async (
  client,
  {
    userId,
    action,
    recordId,
    oldData = null,
    newData = null,
    ipAddress = null,
  },
) => {
  await client.query(
    `
      INSERT INTO audit_logs (
        user_id,
        action,
        module,
        record_id,
        old_data,
        new_data,
        ip_address
      )
      VALUES (
        $1,
        $2,
        'PRODUCTS',
        $3,
        $4::jsonb,
        $5::jsonb,
        $6
      )
    `,
    [
      userId,
      action,
      recordId,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      ipAddress,
    ],
  );
};

const listProducts = async () => {
  const result = await pool.query(`
    SELECT
      p.id,
      p.code,
      p.name,
      p.category_id,
      pc.name AS category_name,
      p.size,
      p.unit,
      p.minimum_stock,
      p.selling_rate,
      p.is_active,
      p.created_at,
      p.updated_at
    FROM products p
    LEFT JOIN product_categories pc
      ON pc.id = p.category_id
    ORDER BY
      p.is_active DESC,
      p.name ASC,
      p.id DESC
  `);

  return result.rows.map(mapProduct);
};

/* ---------------------------------- */
/* Get                                */
/* ---------------------------------- */

const getProduct = async (idValue) => {
  const id = parseId(idValue);

  const result = await pool.query(
    `
      SELECT
        p.id,
        p.code,
        p.name,
        p.category_id,
        pc.name AS category_name,
        p.size,
        p.unit,
        p.minimum_stock,
        p.selling_rate,
        p.is_active,
        p.created_at,
        p.updated_at
      FROM products p
      LEFT JOIN product_categories pc
        ON pc.id = p.category_id
      WHERE p.id = $1
    `,
    [id],
  );

  if (result.rowCount === 0) {
    throw notFoundError("Product not found.");
  }

  const row = result.rows[0];

  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    category_id: row.category_id
      ? Number(row.category_id)
      : null,
    category_name: row.category_name || "",
    size: row.size || "",
    unit: row.unit || "PCS",
    minimum_stock: Number(row.minimum_stock || 0),
    selling_rate: Number(row.selling_rate || 0),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const createProduct = async ({ body, userId, ipAddress }) => {
  const payload = validateProductPayload(body);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* Duplicate code */

    const existing = await client.query(
      `
          SELECT id
          FROM products
          WHERE LOWER(code) = LOWER($1)
          LIMIT 1
        `,
      [payload.code],
    );

    if (existing.rowCount > 0) {
      const error = new Error(`Product code "${payload.code}" already exists.`);

      error.statusCode = 409;
      error.code = "PRODUCT_CODE_EXISTS";
      error.field = "code";

      throw error;
    }

    /* Insert */

    const result = await client.query(
      `
          INSERT INTO products (
            code,
            name,
            category_id,
            size,
            unit,
            minimum_stock,
            selling_rate,
            is_active
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8
          )
          RETURNING
            id,
            code,
            name,
            category_id,
            size,
            unit,
            minimum_stock,
            selling_rate,
            is_active,
            created_at,
            updated_at
        `,
      [
        payload.code,
        payload.name,
        payload.category_id,
        payload.size,
        payload.unit,
        payload.minimum_stock,
        payload.selling_rate,
        payload.is_active,
      ],
    );

    const product = mapProduct(result.rows[0]);

    /* Audit */

    await createAuditLog(client, {
      userId,
      action: "CREATE",
      recordId: product.id,
      newData: product,
      ipAddress,
    });

    await client.query("COMMIT");

    return product;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    throw error;
  } finally {
    client.release();
  }
};

const updateProduct = async ({ id: idValue, body, userId, ipAddress }) => {
  const id = parseId(idValue);

  const payload = validateProductPayload(body, { partial: true });

  if (Object.keys(payload).length === 0) {
    throw validationError("No fields provided for update.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* Current product */

    const currentResult = await client.query(
      `
          SELECT
            id,
            code,
            name,
            category_id,
            size,
            unit,
            minimum_stock,
            selling_rate,
            is_active,
            created_at,
            updated_at
          FROM products
          WHERE id = $1
          FOR UPDATE
        `,
      [id],
    );

    if (currentResult.rowCount === 0) {
      throw notFoundError("Product not found.");
    }

    const current = mapProduct(currentResult.rows[0]);

    /* Duplicate code */

    if (payload.code !== undefined) {
      const duplicate = await client.query(
        `
            SELECT id
            FROM products
            WHERE LOWER(code) = LOWER($1)
              AND id <> $2
            LIMIT 1
          `,
        [payload.code, id],
      );

      if (duplicate.rowCount > 0) {
        const error = new Error(
          `Product code "${payload.code}" already exists.`,
        );

        error.statusCode = 409;
        error.code = "PRODUCT_CODE_EXISTS";
        error.field = "code";

        throw error;
      }
    }

    /* Next state */

    const next = {
      code: payload.code ?? current.code,
      name: payload.name ?? current.name,

      category_id:
        payload.category_id ??
        current.category_id,

      size: payload.size ?? current.size,
      unit: payload.unit ?? current.unit,

      minimum_stock:
        payload.minimum_stock ??
        current.minimum_stock,

      selling_rate:
        payload.selling_rate ??
        current.selling_rate,

      is_active:
        payload.is_active ??
        current.is_active,
    };

    /* Update */

    const result = await client.query(
      `
          UPDATE products
          SET
            code = $1,
            name = $2,
            category_id = $3,
            size = $4,
            unit = $5,
            minimum_stock = $6,
            selling_rate = $7,
            is_active = $8,
            updated_at = NOW()
          WHERE id = $9
          RETURNING
            id,
            code,
            name,
            category_id,
            size,
            unit,
            minimum_stock,
            selling_rate,
            is_active,
            created_at,
            updated_at
        `,
      [
        next.code,
        next.name,
        next.category_id,
        next.size,
        next.unit,
        next.minimum_stock,
        next.selling_rate,
        next.is_active,
        id,
      ],
    );

    const product = mapProduct(result.rows[0]);

    /* Audit */
    await createAuditLog(client, {
      userId,
      action: "UPDATE",
      recordId: id,
      oldData: current,
      newData: product,
      ipAddress,
    });

    await client.query("COMMIT");

    return product;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    throw error;
  } finally {
    client.release();
  }
};

const deleteProduct = async ({ id: idValue, userId, ipAddress }) => {
  const id = parseId(idValue);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /* Product */

    const currentResult = await client.query(
      `
          SELECT
            id,
            code,
            name,
            category_id,
            size,
            unit,
            minimum_stock,
            selling_rate,
            is_active,
            created_at,
            updated_at
          FROM products
          WHERE id = $1
          FOR UPDATE
        `,
      [id],
    );

    if (currentResult.rowCount === 0) {
      throw notFoundError("Product not found.");
    }

    const current = mapProduct(currentResult.rows[0]);

    const references = await client.query(
      `
          SELECT

            EXISTS (
              SELECT 1
              FROM product_boms
              WHERE product_id = $1
            ) AS bom_reference,

            EXISTS (
              SELECT 1
              FROM production_batches
              WHERE product_id = $1
            ) AS production_reference,

            EXISTS (
              SELECT 1
              FROM sale_items
              WHERE product_id = $1
            ) AS sales_reference,

            EXISTS (
              SELECT 1
              FROM sales_return_items
              WHERE product_id = $1
            ) AS sales_return_reference,

            EXISTS (
              SELECT 1
              FROM dispatch_items
              WHERE product_id = $1
            ) AS dispatch_reference
        `,
      [id],
    );

    const ref = references.rows[0];

    const hasReference =
      ref.bom_reference ||
      ref.production_reference ||
      ref.sales_reference ||
      ref.sales_return_reference ||
      ref.dispatch_reference;

    if (hasReference) {
      const error = new Error(
        "This product is already used in transactions or BOM. Deactivate it instead of deleting it.",
      );

      error.statusCode = 409;
      error.code = "PRODUCT_IN_USE";

      throw error;
    }

    await client.query(
      `
        DELETE FROM products
        WHERE id = $1
      `,
      [id],
    );

    /* Audit */

    await createAuditLog(client, {
      userId,
      action: "DELETE",
      recordId: id,
      oldData: current,
      ipAddress,
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    throw error;
  } finally {
    client.release();
  }
};

const getProductSummary = async () => {
  const result = await pool.query(`
       SELECT
      (
        SELECT COUNT(*)
        FROM products
      )::INT AS total_products,

      (
        SELECT COUNT(*)
        FROM products
        WHERE is_active = TRUE
      )::INT AS active_products,

      (
        SELECT COUNT(*)
        FROM products
        WHERE is_active = FALSE
      )::INT AS inactive_products,

      (
        SELECT COUNT(*)
        FROM product_categories
        WHERE is_active = TRUE
      )::INT AS categories
  `);

  const row = result.rows[0];

  return {
    total_products: Number(row.total_products),
    active_products: Number(row.active_products),
    inactive_products: Number(row.inactive_products),
    categories: Number(row.categories),
  };
};

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductSummary,
};
