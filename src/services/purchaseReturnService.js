const pool = require("../config/db");
const { createAuditLog } = require("./auditLogService");

const generateReturnNo = async (client) => {
  const { rows } = await client.query(`
    SELECT COALESCE(
      MAX(CASE
        WHEN return_no ~ '^PR-[0-9]+$'
        THEN CAST(SUBSTRING(return_no FROM 4) AS BIGINT)
        ELSE 0
      END), 0
    ) + 1 AS next_number
    FROM purchase_returns
  `);

  return `PR-${String(rows[0].next_number).padStart(5, "0")}`;
};

const getOptions = async () => {
  const { rows } = await pool.query(`
    SELECT id, name, mobile, gstin
    FROM suppliers
    WHERE is_active = TRUE
    ORDER BY name
  `);

  return { suppliers: rows };
};

const getSupplierPurchases = async (supplierId) => {
  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    throw new Error("Invalid supplier.");
  }

  const { rows } = await pool.query(
    `
    SELECT
      p.id,
      p.purchase_no,
      p.purchase_date,
      p.total_amount,
      COALESCE(SUM(pi.quantity), 0) AS item_quantity,
      COALESCE((
        SELECT SUM(pri.quantity)
        FROM purchase_return_items pri
        JOIN purchase_returns pr
          ON pr.id = pri.purchase_return_id
        WHERE pr.purchase_id = p.id
      ), 0) AS returned_quantity
    FROM purchases p
    LEFT JOIN purchase_items pi
      ON pi.purchase_id = p.id
    WHERE p.supplier_id = $1
    GROUP BY p.id
    HAVING COALESCE(SUM(pi.quantity), 0) > COALESCE((
      SELECT SUM(pri.quantity)
      FROM purchase_return_items pri
      JOIN purchase_returns pr
        ON pr.id = pri.purchase_return_id
      WHERE pr.purchase_id = p.id
    ), 0)
    ORDER BY p.purchase_date DESC, p.id DESC
    `,
    [supplierId],
  );

  return rows;
};

const getPurchaseReturnableItems = async (purchaseId, client = pool) => {
  const purchase = await client.query(
    `SELECT id FROM purchases WHERE id = $1`,
    [purchaseId],
  );

  if (!purchase.rows[0]) {
    throw new Error("Purchase not found.");
  }

  const { rows } = await client.query(
    `
    SELECT
      pi.raw_material_id,
      rm.code AS material_code,
      rm.name AS material_name,
      pi.quantity,
      pi.unit,
      pi.rate,

      COALESCE((
        SELECT SUM(pri.quantity)
        FROM purchase_return_items pri
        JOIN purchase_returns pr
          ON pr.id = pri.purchase_return_id
        WHERE pr.purchase_id = pi.purchase_id
          AND pri.raw_material_id = pi.raw_material_id
      ), 0) AS returned_quantity,

      COALESCE((
        SELECT SUM(
          CASE
            WHEN sm.direction = 'IN' THEN sm.quantity
            WHEN sm.direction = 'OUT' THEN -sm.quantity
            ELSE 0
          END
        )
        FROM stock_movements sm
        WHERE sm.item_type = 'RAW_MATERIAL'
          AND sm.item_id = pi.raw_material_id
      ), 0) AS current_stock

    FROM purchase_items pi
    JOIN raw_materials rm
      ON rm.id = pi.raw_material_id
    WHERE pi.purchase_id = $1
    ORDER BY pi.id
    `,
    [purchaseId],
  );

  return rows.map((row) => {
    const purchasedQuantity = Math.max(0, Number(row.quantity || 0));
    const returnedQuantity = Math.max(0, Number(row.returned_quantity || 0));
    const currentStock = Math.max(0, Number(row.current_stock || 0));

    const purchaseRemaining = Math.max(
      0,
      purchasedQuantity - returnedQuantity,
    );

    const returnableQuantity = Math.min(
      purchaseRemaining,
      currentStock,
    );

    return {
      ...row,
      purchased_quantity: purchasedQuantity,
      returned_quantity: returnedQuantity,
      purchase_remaining: purchaseRemaining,
      current_stock: currentStock,
      returnable_quantity: returnableQuantity,
    };
  });
};

const validateAndNormalize = async (
  client,
  payload,
  excludeReturnId = null,
) => {
  if (!Array.isArray(payload.items) || !payload.items.length) {
    throw new Error("At least one return item is required.");
  }

  const supplierId = Number(payload.supplier_id);
  const purchaseId = Number(payload.purchase_id);

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    throw new Error("Invalid supplier.");
  }

  if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
    throw new Error("Invalid purchase.");
  }

  const supplier = await client.query(
    `SELECT id FROM suppliers WHERE id = $1 AND is_active = TRUE`,
    [supplierId],
  );

  if (!supplier.rows[0]) {
    throw new Error("Supplier not found or inactive.");
  }

  const purchase = await client.query(
    `
    SELECT id, supplier_id, purchase_date
    FROM purchases
    WHERE id = $1
    FOR SHARE
    `,
    [purchaseId],
  );

  if (!purchase.rows[0]) {
    throw new Error("Purchase not found.");
  }

  if (Number(purchase.rows[0].supplier_id) !== supplierId) {
    throw new Error("Purchase does not belong to this supplier.");
  }

  const ids = payload.items.map((x) => Number(x.raw_material_id));

  if (
    ids.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error("Invalid or duplicate raw material.");
  }

  const { rows: purchaseItems } = await client.query(
    `
    SELECT
      pi.raw_material_id,
      pi.quantity,
      pi.unit,
      pi.rate,
      rm.name AS material_name
    FROM purchase_items pi
    JOIN raw_materials rm
      ON rm.id = pi.raw_material_id
    WHERE pi.purchase_id = $1
      AND pi.raw_material_id = ANY($2::BIGINT[])
    `,
    [purchaseId, ids],
  );

  if (purchaseItems.length !== ids.length) {
    throw new Error("Raw material is not part of the selected purchase.");
  }

  const availableResult = await client.query(
    `
    SELECT
      pri.raw_material_id,
      COALESCE(SUM(pri.quantity), 0) AS returned_quantity
    FROM purchase_return_items pri
    JOIN purchase_returns pr
      ON pr.id = pri.purchase_return_id
    WHERE pr.purchase_id = $1
      AND ($2::BIGINT IS NULL OR pr.id <> $2)
      AND pri.raw_material_id = ANY($3::BIGINT[])
    GROUP BY pri.raw_material_id
    `,
    [purchaseId, excludeReturnId, ids],
  );

  const returnedMap = new Map(
    availableResult.rows.map((row) => [
      Number(row.raw_material_id),
      Number(row.returned_quantity || 0),
    ]),
  );

  const itemMap = new Map(
    purchaseItems.map((item) => [
      Number(item.raw_material_id),
      item,
    ]),
  );

  const normalized = [];

  for (const item of payload.items) {
    const id = Number(item.raw_material_id);
    const quantity = Number(item.quantity);
    const source = itemMap.get(id);
    const reason = String(item.reason || "").trim();

    if (!source) {
      throw new Error("Raw material not found.");
    }

    const purchasedQuantity = Math.max(
      0,
      Number(source.quantity || 0),
    );

    const alreadyReturned = Math.max(
      0,
      returnedMap.get(id) || 0,
    );

    const purchaseRemaining = Math.max(
      0,
      purchasedQuantity - alreadyReturned,
    );

    const stockResult = await client.query(
      `
      SELECT COALESCE(
        SUM(
          CASE
            WHEN direction = 'IN' THEN quantity
            WHEN direction = 'OUT' THEN -quantity
            ELSE 0
          END
        ),
        0
      ) AS current_stock
      FROM stock_movements
      WHERE item_type = 'RAW_MATERIAL'
        AND item_id = $1
      `,
      [id],
    );

    const currentStock = Math.max(
      0,
      Number(stockResult.rows[0]?.current_stock || 0),
    );

    const returnableQuantity = Math.min(
      purchaseRemaining,
      currentStock,
    );

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Return quantity must be greater than zero.");
    }

    if (quantity > purchaseRemaining + 1e-9) {
      throw new Error(
        `Return quantity exceeds remaining purchase quantity. ` +
        `Available quantity: ${purchaseRemaining} ${source.unit}.`,
      );
    }

    if (quantity > currentStock + 1e-9) {
      throw new Error(
        `Return quantity exceeds current stock. ` +
        `Available stock: ${currentStock} ${source.unit}.`,
      );
    }

    if (quantity > returnableQuantity + 1e-9) {
      throw new Error(
        `Return quantity exceeds returnable quantity. ` +
        `Returnable quantity: ${returnableQuantity} ${source.unit}.`,
      );
    }

    if (!reason) {
      throw new Error("Return reason is required.");
    }

    normalized.push({
      raw_material_id: id,
      quantity,
      unit: source.unit,
      rate: Number(source.rate),
      amount: quantity * Number(source.rate),
      reason,
    });
  }

  return {
    supplierId,
    purchaseId,
    returnDate: payload.return_date || null,
    reason: payload.reason || null,
    remarks: payload.remarks || null,
    items: normalized,
    totalAmount: normalized.reduce(
      (sum, item) => sum + item.amount,
      0,
    ),
  };
};

const createReturn = async (
  payload,
  { userId = null, ipAddress } = {},
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const data = await validateAndNormalize(client, payload);
    const returnNo = await generateReturnNo(client);

    const result = await client.query(
      `
      INSERT INTO purchase_returns (
        return_no,
        supplier_id,
        purchase_id,
        return_date,
        reason,
        total_amount,
        created_by
      )
      VALUES (
        $1,
        $2,
        $3,
        COALESCE($4::DATE, CURRENT_DATE),
        $5,
        $6,
        $7
      )
      RETURNING *
      `,
      [
        returnNo,
        data.supplierId,
        data.purchaseId,
        data.returnDate,
        data.reason,
        data.totalAmount,
        userId,
      ],
    );

    const record = result.rows[0];

    for (const item of data.items) {
      const inserted = await client.query(
        `
        INSERT INTO purchase_return_items (
          purchase_return_id,
          raw_material_id,
          quantity,
          unit,
          rate,
          amount,
          reason
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id
        `,
        [
          record.id,
          item.raw_material_id,
          item.quantity,
          item.unit,
          item.rate,
          item.amount,
          item.reason,
        ],
      );

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
          'RAW_MATERIAL',
          $1,
          'OUT',
          $2,
          'PURCHASE_RETURN',
          'PURCHASE_RETURN',
          $3,
          COALESCE($4::TIMESTAMP, NOW()),
          $5,
          $6
        )
        `,
        [
          item.raw_material_id,
          item.quantity,
          record.id,
          data.returnDate
            ? `${data.returnDate} 00:00:00`
            : null,
          `Purchase Return ${returnNo} - ${item.reason}`,
          userId,
        ],
      );

      if (!inserted.rows[0]) {
        throw new Error("Failed to create purchase return item.");
      }
    }

    await client.query("COMMIT");

    const newReturn = await getReturnById(record.id);

    await createAuditLog({
      userId: userId || null,
      module: "PURCHASE_RETURNS",
      action: "CREATE",
      recordId: record.id,
      oldData: null,
      newData: newReturn,
      ipAddress: ipAddress || null,
    });

    return newReturn;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getReturns = async () => {
  const { rows } = await pool.query(`
    SELECT
      pr.id,
      pr.return_no,
      pr.supplier_id,
      s.name AS supplier_name,
      pr.purchase_id,
      p.purchase_no,
      pr.return_date,
      pr.reason,
      pr.total_amount,
      COUNT(pri.id)::INTEGER AS item_count,
      COALESCE(SUM(pri.quantity), 0) AS total_quantity
    FROM purchase_returns pr
    JOIN suppliers s
      ON s.id = pr.supplier_id
    JOIN purchases p
      ON p.id = pr.purchase_id
    LEFT JOIN purchase_return_items pri
      ON pri.purchase_return_id = pr.id
    GROUP BY
      pr.id,
      s.name,
      p.purchase_no
    ORDER BY
      pr.return_date DESC,
      pr.id DESC
  `);

  return rows;
};

const getReturnById = async (id, db = pool) => {
  const result = await db.query(
    `
    SELECT
      pr.*,
      s.name AS supplier_name,
      p.purchase_no,
      p.purchase_date,
      p.total_amount AS purchase_total_amount
    FROM purchase_returns pr
    JOIN suppliers s
      ON s.id = pr.supplier_id
    JOIN purchases p
      ON p.id = pr.purchase_id
    WHERE pr.id = $1
    `,
    [id],
  );

  if (!result.rows[0]) {
    return null;
  }

  const items = await db.query(
    `
    SELECT
      pri.*,
      rm.code AS material_code,
      rm.name AS material_name
    FROM purchase_return_items pri
    JOIN raw_materials rm
      ON rm.id = pri.raw_material_id
    WHERE pri.purchase_return_id = $1
    ORDER BY pri.id
    `,
    [id],
  );

  return {
    ...result.rows[0],
    items: items.rows,
  };
};

const updateReturn = async (
  id,
  payload,
  { userId = null, ipAddress } = {},
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `
      SELECT *
      FROM purchase_returns
      WHERE id = $1
      FOR UPDATE
      `,
      [id],
    );

    if (!existing.rows[0]) {
      throw new Error("Purchase return not found.");
    }

    const oldReturn = await getReturnById(id, client);

    await client.query(
      `
      DELETE FROM stock_movements
      WHERE reference_type = 'PURCHASE_RETURN'
        AND reference_id = $1
      `,
      [id],
    );

    await client.query(
      `
      DELETE FROM purchase_return_items
      WHERE purchase_return_id = $1
      `,
      [id],
    );

    const data = await validateAndNormalize(
      client,
      payload,
      id,
    );

    await client.query(
      `
      UPDATE purchase_returns
      SET
        supplier_id = $1,
        purchase_id = $2,
        return_date = COALESCE($3::DATE, return_date),
        reason = $4,
        total_amount = $5,
        updated_at = NOW()
      WHERE id = $6
      `,
      [
        data.supplierId,
        data.purchaseId,
        data.returnDate,
        data.reason,
        data.totalAmount,
        id,
      ],
    );

    for (const item of data.items) {
      await client.query(
        `
        INSERT INTO purchase_return_items (
          purchase_return_id,
          raw_material_id,
          quantity,
          unit,
          rate,
          amount,
          reason
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [
          id,
          item.raw_material_id,
          item.quantity,
          item.unit,
          item.rate,
          item.amount,
          item.reason,
        ],
      );

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
          'RAW_MATERIAL',
          $1,
          'OUT',
          $2,
          'PURCHASE_RETURN',
          'PURCHASE_RETURN',
          $3,
          COALESCE($4::TIMESTAMP, NOW()),
          $5,
          $6
        )
        `,
        [
          item.raw_material_id,
          item.quantity,
          id,
          data.returnDate
            ? `${data.returnDate} 00:00:00`
            : null,
          `Purchase Return ${existing.rows[0].return_no} - ${item.reason}`,
          userId,
        ],
      );
    }

    await client.query("COMMIT");

    const newReturn = await getReturnById(id);

    await createAuditLog({
      userId: userId || null,
      module: "PURCHASE_RETURNS",
      action: "UPDATE",
      recordId: Number(id),
      oldData: oldReturn,
      newData: newReturn,
      ipAddress: ipAddress || null,
    });

    return newReturn;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deleteReturn = async (
  id,
  { userId = null, ipAddress } = {},
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      SELECT id, return_no
      FROM purchase_returns
      WHERE id = $1
      FOR UPDATE
      `,
      [id],
    );

    if (!result.rows[0]) {
      throw new Error("Purchase return not found.");
    }

    const oldReturn = await getReturnById(id, client);

    await client.query(
      `
      DELETE FROM stock_movements
      WHERE reference_type = 'PURCHASE_RETURN'
        AND reference_id = $1
      `,
      [id],
    );

    await client.query(
      `DELETE FROM purchase_returns WHERE id = $1`,
      [id],
    );

    await client.query("COMMIT");

    await createAuditLog({
      userId: userId || null,
      module: "PURCHASE_RETURNS",
      action: "DELETE",
      recordId: Number(id),
      oldData: oldReturn,
      newData: null,
      ipAddress: ipAddress || null,
    });

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
  getSupplierPurchases,
  getPurchaseReturnableItems,
  getReturns,
  getReturnById,
  createReturn,
  updateReturn,
  deleteReturn,
};
