const pool = require("../config/db");
const { createAuditLog } = require("./auditLogService");


const generateReturnNo = async (client) => {
  const result = await client.query(`
    SELECT COALESCE(
      MAX(
        NULLIF(
          REGEXP_REPLACE(return_no, '[^0-9]', '', 'g'),
          ''
        )::BIGINT
      ),
      0
    ) + 1 AS next_no
    FROM sales_returns
    WHERE return_no LIKE 'SR-%'
  `);

  const next = Number(result.rows[0]?.next_no || 1);
  return `SR-${String(next).padStart(6, "0")}`;
};

const getOptions = async () => {
  const { rows: customers } = await pool.query(`
    SELECT id, name, mobile
    FROM customers
    WHERE is_active = TRUE
    ORDER BY name ASC
  `);

  return { customers };
};

const getCustomerSales = async (customerId) => {
  const id = Number(customerId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid customer.");
  }

  const { rows } = await pool.query(`
    SELECT
      s.id,
      s.sale_no,
      s.customer_id,
      s.sale_date,
      s.total_amount,
      COUNT(si.id)::INTEGER AS item_count
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    WHERE s.customer_id = $1
    GROUP BY s.id
    ORDER BY s.sale_date DESC, s.id DESC
  `, [id]);

  return rows;
};

const getSaleReturnableItems = async (saleId, excludeReturnId = null, db = pool) => {
  const id = Number(saleId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid sale.");
  }

  const saleResult = await db.query(
    `SELECT id, customer_id FROM sales WHERE id = $1`,
    [id],
  );

  if (!saleResult.rows[0]) {
    throw new Error("Sale not found.");
  }

  const { rows } = await db.query(`
    SELECT
      si.product_id,
      p.code AS product_code,
      p.name AS product_name,
      si.quantity,
      si.unit,
      si.rate,

      COALESCE((
        SELECT SUM(sri.quantity)
        FROM sales_return_items sri
        JOIN sales_returns sr
          ON sr.id = sri.sales_return_id
        WHERE sr.sale_id = si.sale_id
          AND sri.product_id = si.product_id
          AND ($2::BIGINT IS NULL OR sr.id <> $2)
      ), 0) AS returned_quantity

    FROM sale_items si
    JOIN products p
      ON p.id = si.product_id

    WHERE si.sale_id = $1
    ORDER BY si.id ASC
  `, [id, excludeReturnId]);

  return rows.map((row) => ({
    ...row,
    quantity: Number(row.quantity || 0),
    rate: Number(row.rate || 0),
    returned_quantity: Number(row.returned_quantity || 0),
    available_quantity: Math.max(
      0,
      Number(row.quantity || 0) - Number(row.returned_quantity || 0),
    ),
  }));
};

const validateAndNormalize = async (
  client,
  payload,
  excludeReturnId = null,
) => {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error("At least one return item is required.");
  }

  const customerId = Number(payload.customer_id);
  const saleId = Number(payload.sale_id);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new Error("Invalid customer.");
  }

  if (!Number.isInteger(saleId) || saleId <= 0) {
    throw new Error("Invalid sale.");
  }

  const customerResult = await client.query(
    `SELECT id FROM customers WHERE id = $1 AND is_active = TRUE`,
    [customerId],
  );

  if (!customerResult.rows[0]) {
    throw new Error("Customer not found or inactive.");
  }

  const saleResult = await client.query(
    `
      SELECT id, customer_id, sale_date
      FROM sales
      WHERE id = $1
      FOR SHARE
    `,
    [saleId],
  );

  if (!saleResult.rows[0]) {
    throw new Error("Sale not found.");
  }

  if (Number(saleResult.rows[0].customer_id) !== customerId) {
    throw new Error("Sale does not belong to this customer.");
  }

  const ids = payload.items.map((item) => Number(item.product_id));

  if (
    ids.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error("Invalid or duplicate product.");
  }

  const { rows: saleItems } = await client.query(`
    SELECT
      si.product_id,
      si.quantity,
      si.unit,
      si.rate,
      p.name AS product_name
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = $1
      AND si.product_id = ANY($2::BIGINT[])
  `, [saleId, ids]);

  if (saleItems.length !== ids.length) {
    throw new Error("Product is not part of the selected sale.");
  }

  const itemMap = new Map(
    saleItems.map((item) => [Number(item.product_id), item]),
  );

  const returnedResult = await client.query(`
    SELECT
      sri.product_id,
      COALESCE(SUM(sri.quantity), 0) AS returned_quantity
    FROM sales_return_items sri
    JOIN sales_returns sr
      ON sr.id = sri.sales_return_id
    WHERE sr.sale_id = $1
      AND ($2::BIGINT IS NULL OR sr.id <> $2)
      AND sri.product_id = ANY($3::BIGINT[])
    GROUP BY sri.product_id
  `, [saleId, excludeReturnId, ids]);

  const returnedMap = new Map(
    returnedResult.rows.map((row) => [
      Number(row.product_id),
      Number(row.returned_quantity || 0),
    ]),
  );

  const normalized = [];

  for (const item of payload.items) {
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity);
    const source = itemMap.get(productId);

    if (!source) {
      throw new Error("Product is not part of the selected sale.");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Return quantity must be greater than zero.");
    }

    const soldQuantity = Number(source.quantity || 0);
    const alreadyReturned = Number(returnedMap.get(productId) || 0);
    const available = Math.max(0, soldQuantity - alreadyReturned);

    if (quantity > available + 1e-9) {
      throw new Error(
        `Return quantity exceeds available quantity for ${source.product_name}. Available: ${available} ${source.unit}.`,
      );
    }

   const reason = String(item.reason || "").trim();

if (!reason) {
  throw new Error(
    `Return reason is required for ${source.product_name}.`
  );
}

const allowedReasons = [
  "Damaged",
  "Wrong Material",
  "Quality Issue",
  "Excess Material",
  "Expired",
  "Short/Incorrect Supply",
  "Other",
];

if (!allowedReasons.includes(reason)) {
  throw new Error(
    `Invalid return reason for ${source.product_name}.`
  );
}

normalized.push({
  product_id: productId,
  quantity,
  unit: source.unit,
  rate: Number(source.rate || 0),
  amount: quantity * Number(source.rate || 0),
  reason,
});
  }

  const totalAmount = normalized.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  return {
    customerId,
    saleId,
    returnDate: payload.return_date || null,
    reason: String(payload.reason || "").trim() || null,
    items: normalized,
    totalAmount,
  };
};

const getReturnById = async (id, db = pool) => {
  const result = await db.query(`
    SELECT
      sr.*,
      c.name AS customer_name,
      c.mobile AS customer_mobile,
      s.sale_no,
      COALESCE(SUM(sri.amount), 0) AS total_amount
    FROM sales_returns sr
    JOIN customers c ON c.id = sr.customer_id
    LEFT JOIN sales s ON s.id = sr.sale_id
    LEFT JOIN sales_return_items sri
      ON sri.sales_return_id = sr.id
    WHERE sr.id = $1
    GROUP BY sr.id, c.name, c.mobile, s.sale_no
  `, [id]);

  if (!result.rows[0]) return null;

  const items = await db.query(`
    SELECT
      sri.*,
      p.code AS product_code,
      p.name AS product_name
    FROM sales_return_items sri
    JOIN products p
      ON p.id = sri.product_id
    WHERE sri.sales_return_id = $1
    ORDER BY sri.id ASC
  `, [id]);

  return {
    ...result.rows[0],
    total_amount: Number(result.rows[0].total_amount || 0),
    items: items.rows.map((item) => ({
      ...item,
      quantity: Number(item.quantity || 0),
      rate: Number(item.rate || 0),
      amount: Number(item.amount || 0),
    })),
  };
};

const getReturns = async () => {
  const { rows } = await pool.query(`
    SELECT
      sr.id,
      sr.return_no,
      sr.customer_id,
      c.name AS customer_name,
      sr.sale_id,
      s.sale_no,
      sr.return_date,
      sr.reason,
      COUNT(sri.id)::INTEGER AS item_count,
      COALESCE(SUM(sri.quantity), 0) AS total_quantity,
      COALESCE(SUM(sri.amount), 0) AS total_amount
    FROM sales_returns sr
    JOIN customers c ON c.id = sr.customer_id
    LEFT JOIN sales s ON s.id = sr.sale_id
    LEFT JOIN sales_return_items sri
      ON sri.sales_return_id = sr.id
    GROUP BY
      sr.id,
      c.name,
      s.sale_no
    ORDER BY sr.return_date DESC, sr.id DESC
  `);

  return rows.map((row) => ({
    ...row,
    total_quantity: Number(row.total_quantity || 0),
    total_amount: Number(row.total_amount || 0),
  }));
};

const insertStockMovement = async (
  client,
  {
    productId,
    quantity,
    returnId,
    returnNo,
    returnDate,
    userId,
  },
) => {
  await client.query(`
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
      'PRODUCT',
      $1,
      'IN',
      $2,
      'SALES_RETURN',
      'SALES_RETURN',
      $3,
      COALESCE($4::TIMESTAMP, NOW()),
      $5,
      $6
    )
  `, [
    productId,
    quantity,
    returnId,
    returnDate ? `${returnDate} ${new Date().toTimeString().slice(0, 8)}` : null,
    `Sales Return ${returnNo}`,
    userId,
  ]);
};

const createReturn = async (payload, {userId = null, ipAddress}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const data = await validateAndNormalize(client, payload);
    const returnNo = await generateReturnNo(client);

    const result = await client.query(`
      INSERT INTO sales_returns (
        return_no,
        customer_id,
        sale_id,
        return_date,
        reason,
        created_by
      )
      VALUES (
        $1,
        $2,
        $3,
        COALESCE($4::DATE, CURRENT_TIMESTAMP),
        $5,
        $6
      )
      RETURNING *
    `, [
      returnNo,
      data.customerId,
      data.saleId,
      data.returnDate,
      data.reason,
      userId,
    ]);

    const record = result.rows[0];

    for (const item of data.items) {
      await client.query(`
        INSERT INTO sales_return_items (
          sales_return_id,
          product_id,
          quantity,
          unit,
          rate,
          amount,
          reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        record.id,
        item.product_id,
        item.quantity,
        item.unit,
        item.rate,
        item.amount,
        item.reason,
      ]);

      await insertStockMovement(client, {
        productId: item.product_id,
        quantity: item.quantity,
        returnId: record.id,
        returnNo,
        returnDate: data.returnDate,
        userId,
      });
    }

    await client.query("COMMIT");

    const newReturn = await getReturnById(record.id);

    await createAuditLog({
      userId: userId || null,
      module: "SALES_RETURNS",
      action: "CREATE",
      recordId: record.id,
      oldData: null,
      newData: newReturn,
      ipAddress: ipAddress || null,
    });

    return getReturnById(record.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateReturn = async (id, payload,{userId = null, ipAddress}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT * FROM sales_returns WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (!existing.rows[0]) {
      throw new Error("Sales return not found.");
    }
    
    const oldReturn = await getReturnById(id);

    await client.query(`
      DELETE FROM stock_movements
      WHERE reference_type = 'SALES_RETURN'
        AND reference_id = $1
    `, [id]);

    await client.query(
      `DELETE FROM sales_return_items WHERE sales_return_id = $1`,
      [id],
    );

    const data = await validateAndNormalize(client, payload, id);

    await client.query(`
      UPDATE sales_returns
      SET
        customer_id = $1,
        sale_id = $2,
        return_date = COALESCE($3::DATE, return_date),
        reason = $4
      WHERE id = $5
    `, [
      data.customerId,
      data.saleId,
      data.returnDate,
      data.reason,
      id,
    ]);

    for (const item of data.items) {
      await client.query(`
        INSERT INTO sales_return_items (
          sales_return_id,
          product_id,
          quantity,
          unit,
          rate,
          amount,
          reason
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        id,
        item.product_id,
        item.quantity,
        item.unit,
        item.rate,
        item.amount,
        item.reason,
      ]);

      await insertStockMovement(client, {
        productId: item.product_id,
        quantity: item.quantity,
        returnId: id,
        returnNo: existing.rows[0].return_no,
        returnDate: data.returnDate,
        userId,
      });
    }
    const newReturn = await getReturnById(id);
    await client.query("COMMIT");

    await createAuditLog({
      userId: userId || null,
      module: "SALES_RETURNS",
      action: "UPDATE",
      recordId: id,
      oldData: oldReturn,
      newData: newReturn,
      ipAddress: ipAddress || null,
    });
    
    return getReturnById(id);

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deleteReturn = async (id, {userId = null, ipAddress}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT * FROM sales_returns WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (!result.rows[0]) {
      throw new Error("Sales return not found.");
    }

    const oldReturn = await getReturnById(id);

    await client.query(`
      DELETE FROM stock_movements
      WHERE reference_type = 'SALES_RETURN'
        AND reference_id = $1
    `, [id]);

    await client.query(
      `DELETE FROM sales_returns WHERE id = $1`,
      [id],
    );

    await createAuditLog({
      userId: userId || null,
      module: "SALES_RETURNS",
      action: "DELETE",
      recordId: oldReturn.id,
      oldData: oldReturn,
      newData: null,
      ipAddress: ipAddress || null,
    });

    await client.query("COMMIT");

    return result.rows[0];

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getOptions,
  getCustomerSales,
  getSaleReturnableItems,
  getReturns,
  getReturnById,
  createReturn,
  updateReturn,
  deleteReturn,
};
