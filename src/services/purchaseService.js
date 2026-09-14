const pool = require("../config/db");
const { createAuditLog } = require("./auditLogService");
const { sendPushNotification } = require("./pushService");
const { createNotification } = require("./notificationService");
const { applyAvailableAdvance } = require("./paymentService");

const generatePurchaseNo = async (client) => {
  const { rows } = await client.query(`
    SELECT COALESCE(
      MAX(
        CASE
          WHEN purchase_no ~ '^PUR-[0-9]+$'
          THEN CAST(SUBSTRING(purchase_no FROM 5) AS BIGINT)
          ELSE 0
        END
      ),
      0
    ) + 1 AS next_number
    FROM purchases;
  `);

  return `PUR-${String(rows[0].next_number).padStart(5, "0")}`;
};

const getPurchaseOptions = async () => {
  const [suppliers, rawMaterials] = await Promise.all([
    pool.query(`
      SELECT id, name, mobile, gstin
      FROM suppliers
      WHERE is_active = TRUE
      ORDER BY name ASC;
    `),
    pool.query(`
      SELECT id, code, name, unit
      FROM raw_materials
      WHERE is_active = TRUE
      ORDER BY name ASC;
    `),
  ]);

  return {
    suppliers: suppliers.rows,
    rawMaterials: rawMaterials.rows,
  };
};

const getPurchases = async () => {
  // const { rows } = await pool.query(`
  //   SELECT
  //     p.id,
  //     p.purchase_no,
  //     p.supplier_id,
  //     s.name AS supplier_name,
  //     p.purchase_date,
  //     p.invoice_no,
  //     p.total_amount,
  //     p.payment_status,
  //     COUNT(pi.id)::INTEGER AS item_count
  //   FROM purchases p
  //   JOIN suppliers s ON s.id = p.supplier_id
  //   LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
  //   GROUP BY
  //     p.id,
  //     p.purchase_no,
  //     p.supplier_id,
  //     s.name,
  //     p.purchase_date,
  //     p.invoice_no,
  //     p.total_amount,
  //     p.payment_status
  //   ORDER BY p.purchase_date DESC, p.id DESC;
  // `);

  const { rows } = await pool.query(`
  SELECT
    p.id,
    p.purchase_no,
    p.supplier_id,
    s.name AS supplier_name,
    p.purchase_date,
    p.invoice_no,

    -- Original purchase amount
    p.total_amount,

    -- Total amount returned against this purchase
    COALESCE(
      (
        SELECT SUM(pr.total_amount)
        FROM purchase_returns pr
        WHERE pr.purchase_id = p.id
      ),
      0
    ) AS purchase_return_amount,

    -- Purchase amount after returns
    GREATEST(
      0,
      p.total_amount - COALESCE(
        (
          SELECT SUM(pr.total_amount)
          FROM purchase_returns pr
          WHERE pr.purchase_id = p.id
        ),
        0
      )
    ) AS net_purchase_amount,

    p.payment_status,
    COUNT(pi.id)::INTEGER AS item_count

  FROM purchases p
  JOIN suppliers s
    ON s.id = p.supplier_id
  LEFT JOIN purchase_items pi
    ON pi.purchase_id = p.id

  GROUP BY
    p.id,
    p.purchase_no,
    p.supplier_id,
    s.name,
    p.purchase_date,
    p.invoice_no,
    p.total_amount,
    p.payment_status

  ORDER BY
    p.purchase_date DESC,
    p.id DESC;
`);
  return rows;
};

// const getPurchaseById = async (id) => {
//   // const purchaseResult = await pool.query(
//   //   `
//   //   SELECT
//   //     p.*,
//   //     s.name AS supplier_name,
//   //     s.mobile AS supplier_mobile,
//   //     s.gstin AS supplier_gstin,
//   //     s.address AS supplier_address
//   //   FROM purchases p
//   //   JOIN suppliers s ON s.id = p.supplier_id
//   //   WHERE p.id = $1;
//   // `,
//   //   [id],
//   // );

//   const purchaseResult = await pool.query(
//   `
//   SELECT
//     p.*,

//     COALESCE(
//       (
//         SELECT SUM(pr.total_amount)
//         FROM purchase_returns pr
//         WHERE pr.purchase_id = p.id
//       ),
//       0
//     ) AS purchase_return_amount,

//     GREATEST(
//       0,
//       p.total_amount - COALESCE(
//         (
//           SELECT SUM(pr.total_amount)
//           FROM purchase_returns pr
//           WHERE pr.purchase_id = p.id
//         ),
//         0
//       )
//     ) AS net_purchase_amount,

//     s.name AS supplier_name,
//     s.mobile AS supplier_mobile,
//     s.gstin AS supplier_gstin,
//     s.address AS supplier_address

//   FROM purchases p
//   JOIN suppliers s
//     ON s.id = p.supplier_id
//   WHERE p.id = $1;
// `,
//   [id],
// );

//   if (!purchaseResult.rows[0]) {
//     return null;
//   }

//   const itemsResult = await pool.query(
//     `
//     SELECT
//       pi.id,
//       pi.raw_material_id,
//       rm.code AS material_code,
//       rm.name AS material_name,
//       pi.quantity,
//       pi.unit,
//       pi.rate,
//       pi.amount
//     FROM purchase_items pi
//     JOIN raw_materials rm
//       ON rm.id = pi.raw_material_id
//     WHERE pi.purchase_id = $1
//     ORDER BY pi.id ASC;
//   `,
//     [id],
//   );

//   return {
//     ...purchaseResult.rows[0],
//     items: itemsResult.rows,
//   };
// };

const getPurchaseById = async (id) => {
  const purchaseResult = await pool.query(
    `
      SELECT
        p.*,

        s.name AS supplier_name,
        s.mobile AS supplier_mobile,
        s.gstin AS supplier_gstin,
        s.address AS supplier_address,

        COALESCE(
          (
            SELECT SUM(pr.total_amount)
            FROM purchase_returns pr
            WHERE pr.purchase_id = p.id
          ),
          0
        )::numeric AS purchase_return_amount

      FROM purchases p

      JOIN suppliers s
        ON s.id = p.supplier_id

      WHERE p.id = $1;
    `,
    [id],
  );

  if (!purchaseResult.rows[0]) {
    return null;
  }

  const itemsResult = await pool.query(
    `
      SELECT
        pi.id,
        pi.raw_material_id,

        rm.code AS material_code,
        rm.name AS material_name,

        pi.quantity,
        pi.unit,
        pi.rate,
        pi.amount,

        COALESCE(
          (
            SELECT SUM(pri.quantity)
            FROM purchase_return_items pri

            JOIN purchase_returns pr
              ON pr.id = pri.purchase_return_id

            WHERE pr.purchase_id = pi.purchase_id
              AND pri.raw_material_id = pi.raw_material_id
          ),
          0
        )::numeric AS returned_quantity,

        COALESCE(
          (
            SELECT SUM(pri.amount)
            FROM purchase_return_items pri

            JOIN purchase_returns pr
              ON pr.id = pri.purchase_return_id

            WHERE pr.purchase_id = pi.purchase_id
              AND pri.raw_material_id = pi.raw_material_id
          ),
          0
        )::numeric AS returned_amount

      FROM purchase_items pi

      JOIN raw_materials rm
        ON rm.id = pi.raw_material_id

      WHERE pi.purchase_id = $1

      ORDER BY pi.id ASC;
    `,
    [id],
  );

  const purchase = purchaseResult.rows[0];

  const items = itemsResult.rows.map((item) => {
    const quantity = Number(item.quantity || 0);
    const returnedQuantity = Number(
      item.returned_quantity || 0,
    );

    const amount = Number(item.amount || 0);
    const returnedAmount = Number(
      item.returned_amount || 0,
    );

    return {
      ...item,

      quantity,

      returned_quantity: returnedQuantity,

      remaining_quantity: Math.max(
        0,
        quantity - returnedQuantity,
      ),

      rate: Number(item.rate || 0),

      amount,

      returned_amount: returnedAmount,

      net_amount: Math.max(
        0,
        amount - returnedAmount,
      ),
    };
  });

  const purchaseReturnAmount = Number(
    purchase.purchase_return_amount || 0,
  );

  const netPurchaseAmount = Math.max(
    0,
    Number(purchase.total_amount || 0) -
      purchaseReturnAmount,
  );

  return {
    ...purchase,

    purchase_return_amount: purchaseReturnAmount,

    net_purchase_amount: netPurchaseAmount,

    items,
  };
};

const createPurchase = async (payload, {userId = null, ipAddress}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error("At least one purchase item is required.");
    }

    const supplierId = Number(payload.supplier_id);

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      throw new Error("Invalid supplier.");
    }

    const supplierResult = await client.query(
      `SELECT id FROM suppliers WHERE id = $1 AND is_active = TRUE`,
      [supplierId],
    );

    if (!supplierResult.rows[0]) {
      throw new Error("Supplier not found or inactive.");
    }

    const materialIds = payload.items.map((item) =>
      Number(item.raw_material_id),
    );

    if (
      materialIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      new Set(materialIds).size !== materialIds.length
    ) {
      throw new Error("Invalid or duplicate raw material.");
    }

    const materialsResult = await client.query(
      `
      SELECT id, unit
      FROM raw_materials
      WHERE id = ANY($1::BIGINT[])
        AND is_active = TRUE;
    `,
      [materialIds],
    );

    if (materialsResult.rows.length !== materialIds.length) {
      throw new Error("One or more raw materials are invalid or inactive.");
    }

    const materialMap = new Map(
      materialsResult.rows.map((material) => [Number(material.id), material]),
    );

    const normalizedItems = payload.items.map((item) => {
      const rawMaterialId = Number(item.raw_material_id);
      const quantity = Number(item.quantity);
      const rate = Number(item.rate);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Quantity must be greater than zero.");
      }

      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error("Rate cannot be negative.");
      }

      const material = materialMap.get(rawMaterialId);

      if (!material) {
        throw new Error("Invalid raw material.");
      }

      return {
        raw_material_id: rawMaterialId,
        quantity,
        unit: material.unit,
        rate,
        amount: quantity * rate,
      };
    });

    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    const discount = Math.max(0, Number(payload.discount || 0));
    const taxAmount = Math.max(0, Number(payload.tax_amount || 0));
    const freightAmount = Math.max(0, Number(payload.freight_amount || 0));

    if (
      !Number.isFinite(discount) ||
      !Number.isFinite(taxAmount) ||
      !Number.isFinite(freightAmount)
    ) {
      throw new Error("Invalid purchase totals.");
    }

    const totalAmount = Math.max(
      0,
      subtotal - discount + taxAmount + freightAmount,
    );

    const paymentStatus = String(
      payload.payment_status || "PENDING",
    ).toUpperCase();

    if (!["PENDING", "PARTIAL", "PAID"].includes(paymentStatus)) {
      throw new Error("Invalid payment status.");
    }

    const purchaseNo = await generatePurchaseNo(client);

    const purchaseResult = await client.query(
      `
      INSERT INTO purchases (
        purchase_no,
        supplier_id,
        purchase_date,
        invoice_no,
        invoice_date,
        vehicle_no,
        driver_name,
        driver_mobile,
        subtotal,
        discount,
        tax_amount,
        freight_amount,
        total_amount,
        payment_status,
        remarks,
        created_by
      )
      VALUES (
        $1, $2, COALESCE($3::DATE, CURRENT_TIMESTAMP), $4, $5,
        $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      RETURNING *;
    `,
      [
        purchaseNo,
        supplierId,
        payload.purchase_date || null,
        payload.invoice_no || null,
        payload.invoice_date || null,
        payload.vehicle_no || null,
        payload.driver_name || null,
        payload.driver_mobile || null,
        subtotal,
        discount,
        taxAmount,
        freightAmount,
        totalAmount,
        paymentStatus,
        payload.remarks || null,
        userId,
      ],
    );

    const purchase = purchaseResult.rows[0];

    for (const item of normalizedItems) {
      const itemResult = await client.query(
        `
        INSERT INTO purchase_items (
          purchase_id,
          raw_material_id,
          quantity,
          unit,
          rate,
          amount
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `,
        [
          purchase.id,
          item.raw_material_id,
          item.quantity,
          item.unit,
          item.rate,
          item.amount,
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
          'IN',
          $2,
          'PURCHASE',
          'PURCHASE',
          $3,
          COALESCE($4::TIMESTAMP, NOW()),
          $5,
          $6
        );
      `,
        [
          item.raw_material_id,
          item.quantity,
          purchase.id,
          payload.purchase_date ? `${payload.purchase_date} ${new Date().toTimeString().slice(0, 8)}` : null,
          `Purchase ${purchaseNo}`,
          userId,
        ],
      );

      // Ensure the inserted purchase item exists before committing.
      if (!itemResult.rows[0]) {
        throw new Error("Failed to create purchase item.");
      }
    }

    await applyAvailableAdvance(client, "SUPPLIER", supplierId, purchase.id);

    await client.query("COMMIT");

    const newPurchase = await getPurchaseById(purchase.id);

    await createAuditLog({
      userId: userId || null,
      module: "PURCHASES",
      action: "CREATE",
      recordId: purchase.id,
      oldData: null,
      newData: newPurchase,
      ipAddress: ipAddress || null,
    });

    await createNotification({
      title: "New Purchase Added",
      message: `${newPurchase.supplier_name} - ₹${Number(newPurchase.total_amount || 0).toLocaleString("en-IN")}.<br> Purchase: ${newPurchase.purchase_no}`,
      type: "purchase_created",
      referenceType: "purchase",
      referenceId: Number(purchase.id),
      createdBy: userId || null,
    });

    sendPushNotification({
      title: "New Purchase Added",
      body: `${newPurchase.supplier_name} - ₹${Number(
        newPurchase.total_amount || 0
      ).toLocaleString("en-IN")}. Purchase: ${newPurchase.purchase_no}`,
      icon: "/images/cart-plus-solid.png",
      url: `/purchases`,
    }).catch(console.error);

    return newPurchase;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updatePurchase = async (id, payload,  {userId = null, ipAddress}) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const purchaseResult = await client.query(
      `SELECT * FROM purchases WHERE id = $1 FOR UPDATE;`,
      [id],
    );

    if (!purchaseResult.rows[0]) throw new Error("Purchase not found.");

    const oldPurchase = await getPurchaseById(id);

   const supplierId = Number(payload.supplier_id);

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      throw new Error("Invalid supplier.");
    }

    const supplierResult = await client.query(
      `SELECT id FROM suppliers WHERE id = $1 AND is_active = TRUE`,
      [supplierId],
    );

    if (!supplierResult.rows[0]) {
      throw new Error("Supplier not found or inactive.");
    }

    const materialIds = payload.items.map((item) =>
      Number(item.raw_material_id),
    );

    if (
      materialIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      new Set(materialIds).size !== materialIds.length
    ) {
      throw new Error("Invalid or duplicate raw material.");
    }

    const materialsResult = await client.query(
      `
      SELECT id, unit
      FROM raw_materials
      WHERE id = ANY($1::BIGINT[])
        AND is_active = TRUE;
    `,
      [materialIds],
    );

    if (materialsResult.rows.length !== materialIds.length) {
      throw new Error("One or more raw materials are invalid or inactive.");
    }

    const materialMap = new Map(
      materialsResult.rows.map((material) => [Number(material.id), material]),
    );

    const normalizedItems = payload.items.map((item) => {
      const rawMaterialId = Number(item.raw_material_id);
      const quantity = Number(item.quantity);
      const rate = Number(item.rate);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Quantity must be greater than zero.");
      }

      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error("Rate cannot be negative.");
      }

      const material = materialMap.get(rawMaterialId);

      if (!material) {
        throw new Error("Invalid raw material.");
      }

      return {
        raw_material_id: rawMaterialId,
        quantity,
        unit: material.unit,
        rate,
        amount: quantity * rate,
      };
    });

    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    const discount = Math.max(0, Number(payload.discount || 0));
    const taxAmount = Math.max(0, Number(payload.tax_amount || 0));
    const freightAmount = Math.max(0, Number(payload.freight_amount || 0));

    if (
      !Number.isFinite(discount) ||
      !Number.isFinite(taxAmount) ||
      !Number.isFinite(freightAmount)
    ) {
      throw new Error("Invalid purchase totals.");
    }

    const totalAmount = Math.max(
      0,
      subtotal - discount + taxAmount + freightAmount,
    );

    const paymentStatus = String(
      payload.payment_status || "PENDING",
    ).toUpperCase();

    if (!["PENDING", "PARTIAL", "PAID"].includes(paymentStatus)) {
      throw new Error("Invalid payment status.");
    }
    
    const purchase = purchaseResult.rows[0];

    await client.query(
      `DELETE FROM stock_movements WHERE item_type = 'RAW_MATERIAL' AND direction = 'IN' AND movement_type = 'PURCHASE' AND reference_type = 'PURCHASE' AND reference_id = $1;`,
      [id],
    );
    await client.query(`DELETE FROM purchase_items WHERE purchase_id = $1`, [
      id,
    ]);

    const updatedResult = await client.query(
      `
      UPDATE purchases SET
        supplier_id = $1, purchase_date = COALESCE($2::DATE, purchase_date), invoice_no = $3, invoice_date = $4,
        vehicle_no = $5, driver_name = $6, driver_mobile = $7, subtotal = $8, discount = $9, tax_amount = $10,
        freight_amount = $11, total_amount = $12, payment_status = $13, remarks = $14, updated_at = NOW()
      WHERE id = $15 RETURNING *;
    `,
      [
        supplierId,
        payload.purchase_date || null,
        payload.invoice_no || null,
        payload.invoice_date || null,
        payload.vehicle_no || null,
        payload.driver_name || null,
        payload.driver_mobile || null,
        subtotal,
        discount,
        taxAmount,
        freightAmount,
        totalAmount,
        paymentStatus,
        payload.remarks || null,
        id,
      ],
    );
    // const updatedPurchase = updatedResult.rows[0];

    for (const item of normalizedItems) {
      const itemResult = await client.query(
        `
        INSERT INTO purchase_items (purchase_id, raw_material_id, quantity, unit, rate, amount)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;
      `,
        [
          id,
          item.raw_material_id,
          item.quantity,
          item.unit,
          item.rate,
          item.amount,
        ],
      );
      if (!itemResult.rows[0])
        throw new Error("Failed to update purchase item.");
      await client.query(
        `
        INSERT INTO stock_movements (item_type, item_id, direction, quantity, movement_type, reference_type, reference_id, movement_date, remarks, created_by)
        VALUES ('RAW_MATERIAL', $1, 'IN', $2, 'PURCHASE', 'PURCHASE', $3, COALESCE($4::TIMESTAMP, NOW()), $5, $6);
      `,
        [
          item.raw_material_id,
          item.quantity,
          id,
          payload.purchase_date
            ? `${payload.purchase_date} ${new Date().toTimeString().slice(0, 8)}`
            : `${String(purchase.purchase_date).slice(0, 10)} ${new Date().toTimeString().slice(0, 8)}`,
          `Purchase ${purchase.purchase_no}`,
          userId,
        ],
      );
    }
    await client.query("COMMIT");

    const newPurchase = await getPurchaseById(id);

    await createAuditLog({
      userId: userId || null,
      module: "PURCHASES",
      action: "UPDATE",
      recordId: Number(id),
      oldData: oldPurchase,
      newData: newPurchase,
      ipAddress: ipAddress || null,
    });

    await createNotification({
  title: "Purchase Updated",
  message: `${newPurchase.supplier_name} - ₹${Number(
    newPurchase.total_amount || 0
  ).toLocaleString("en-IN")}. <br> Purchase: ${newPurchase.purchase_no}`,
  type: "purchase_updated",
  referenceType: "purchase",
  referenceId: Number(id),
  createdBy: userId || null,
});

sendPushNotification({
  title: "Purchase Updated",
  body: `${newPurchase.supplier_name} - ₹${Number(
    newPurchase.total_amount || 0
  ).toLocaleString("en-IN")}. Purchase: ${newPurchase.purchase_no}`,
  icon: "/images/cart-shopping-solid.png",
  badge: "/images/icon-192.png",
  url: "/purchases",
}).catch((error) => {
  console.error("Purchase update push notification error:", error);
});


    return newPurchase;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deletePurchase = async (id,{userId = null, ipAddress}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const purchaseResult = await client.query(
      `SELECT * FROM purchases WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (!purchaseResult.rows[0]) {
      throw new Error("Purchase not found.");
    }

    const purchase = purchaseResult.rows[0];

    const oldPurchase = await getPurchaseById(id);

    await client.query(
      `
      DELETE FROM stock_movements
      WHERE item_type = 'RAW_MATERIAL'
        AND direction = 'IN'
        AND movement_type = 'PURCHASE'
        AND reference_type = 'PURCHASE'
        AND reference_id = $1;
    `,
      [id],
    );

    await client.query(`DELETE FROM purchases WHERE id = $1`, [id]);

    await client.query("COMMIT");

      await createAuditLog({
      userId: userId || null,
      module: "PURCHASES",
      action: "DELETE",
      recordId: Number(id),
      oldData: oldPurchase,
      newData: null,
      ipAddress: ipAddress || null,
    });

    await createNotification({
  title: "Purchase Deleted",
  message: `${oldPurchase.supplier_name} - ₹${Number(
    oldPurchase.total_amount || 0
  ).toLocaleString("en-IN")}.<br> Purchase: ${oldPurchase.purchase_no} deleted.`,
  type: "purchase_deleted",
  referenceType: "purchase",
  referenceId: Number(id),
  createdBy: userId || null,
});

sendPushNotification({
  title: "Purchase Deleted",
  body: `${oldPurchase.supplier_name} - ₹${Number(
    oldPurchase.total_amount || 0
  ).toLocaleString("en-IN")}. Purchase: ${oldPurchase.purchase_no} deleted.`,
  icon: "/images/cart-shopping-solid.png",
  badge: "/images/icon-192.png",
  url: "/purchases",
}).catch((error) => {
  console.error("Purchase delete push notification error:", error);
});

    return purchase;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getPurchaseOptions,
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  deletePurchase,
};
