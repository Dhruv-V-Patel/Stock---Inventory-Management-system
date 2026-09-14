const pool = require("../config/db");
const { createAuditLog } = require("./auditLogService");
const { sendPushNotification } = require("./pushService");
const { createNotification } = require("./notificationService");

const EPSILON = 0.000001;

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const assertId = (value, label = "id") => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error(`Invalid ${label}.`);
    error.statusCode = 400;
    throw error;
  }
  return id;
};

const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error("At least one sale item is required.");
    error.statusCode = 400;
    throw error;
  }

  const map = new Map();

  for (const rawItem of items) {
    const productId = assertId(rawItem?.product_id, "product");
    const quantity = toNumber(rawItem?.quantity, NaN);
    const rate = toNumber(rawItem?.rate, NaN);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      const error = new Error(
        "Every sale item must have a quantity greater than zero.",
      );
      error.statusCode = 400;
      throw error;
    }

    if (!Number.isFinite(rate) || rate < 0) {
      const error = new Error("Every sale item must have a valid rate.");
      error.statusCode = 400;
      throw error;
    }

    const existing = map.get(productId);

    if (existing) {
      existing.quantity += quantity;
      existing.amount = existing.quantity * existing.rate;
    } else {
      map.set(productId, {
        product_id: productId,
        quantity,
        rate,
        amount: quantity * rate,
      });
    }
  }

  return [...map.values()];
};

const validateHeader = (payload) => {
  const customerId = assertId(payload?.customer_id, "customer");

  const saleDate = String(payload?.sale_date || "").trim();
  if (!saleDate) {
    const error = new Error("Sale date is required.");
    error.statusCode = 400;
    throw error;
  }

  const paymentStatus = String(
    payload?.payment_status || "PENDING",
  ).toUpperCase();

  if (!["PENDING", "PARTIAL", "PAID"].includes(paymentStatus)) {
    const error = new Error("Invalid payment status.");
    error.statusCode = 400;
    throw error;
  }

  const discount = Math.max(0, toNumber(payload?.discount));
  const taxAmount = Math.max(0, toNumber(payload?.tax_amount));

  return {
    customerId,
    saleDate,
    vehicleNo: payload?.vehicle_no?.trim() || null,
    challanLrNo: payload?.challan_lr_no?.trim() || null,
    driverName: payload?.driver_name?.trim() || null,
    driverMobile: payload?.driver_mobile?.trim() || null,
    discount,
    taxAmount,
    paymentStatus,
    remarks: payload?.remarks?.trim() || null,
  };
};

const getProductStock = async (client, productId) => {
  const result = await client.query(
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
      WHERE item_type = 'PRODUCT'
        AND item_id = $1
    `,
    [productId],
  );

  return Number(result.rows[0]?.current_stock || 0);
};

const lockProducts = async (client, productIds) => {
  const ids = [...new Set(productIds.map(Number))].sort((a, b) => a - b);

  if (!ids.length) return;

  await client.query(
    `
      SELECT id
      FROM products
      WHERE id = ANY($1::bigint[])
      FOR UPDATE
    `,
    [ids],
  );
};

const validateCustomer = async (client, customerId) => {
  const result = await client.query(
    `
      SELECT id, name, mobile, gstin, address, is_active
      FROM customers
      WHERE id = $1
    `,
    [customerId],
  );

  if (!result.rows.length) {
    const error = new Error("Customer not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!result.rows[0].is_active) {
    const error = new Error("Selected customer is inactive.");
    error.statusCode = 400;
    throw error;
  }

  return result.rows[0];
};

const validateProductsAndStock = async (
  client,
  items,
  stockAllowanceByProduct = new Map(),
) => {
  await lockProducts(
    client,
    items.map((item) => item.product_id),
  );

  const validated = [];

  for (const item of items) {
    const result = await client.query(
      `
        SELECT id, code, name, unit, selling_rate, is_active
        FROM products
        WHERE id = $1
      `,
      [item.product_id],
    );

    if (!result.rows.length) {
      const error = new Error(`Product ${item.product_id} not found.`);
      error.statusCode = 404;
      throw error;
    }

    const product = result.rows[0];

    if (!product.is_active) {
      const error = new Error(`Product "${product.name}" is inactive.`);
      error.statusCode = 400;
      throw error;
    }

    const currentStock = await getProductStock(client, product.id);
    const allowance = Number(stockAllowanceByProduct.get(product.id) || 0);
    const usableStock = currentStock + allowance;

    if (usableStock + EPSILON < item.quantity) {
      const error = new Error(
        `Insufficient finished stock for "${product.name}". ` +
          `Available ${usableStock} ${product.unit}, ` +
          `required ${item.quantity} ${product.unit}.`,
      );
      error.statusCode = 400;
      throw error;
    }

    validated.push({
      ...item,
      unit: product.unit,
      product_code: product.code,
      product_name: product.name,
    });
  }

  return validated;
};

const calculateTotals = ({ items, discount, taxAmount }) => {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

  const total = Math.max(0, subtotal - discount + taxAmount);

  return {
    subtotal,
    discount,
    tax_amount: taxAmount,
    total_amount: total,
  };
};

const generateSaleNo = async (client) => {
  const result = await client.query(`
    SELECT COALESCE(
      MAX(
        CASE
          WHEN sale_no ~ '^INV-[0-9]+$'
          THEN CAST(SUBSTRING(sale_no FROM 5) AS BIGINT)
          ELSE 0
        END
      ),
      0
    ) AS last_no
    FROM sales
  `);

  const next = Number(result.rows[0]?.last_no || 0) + 1;
  return `INV-${String(next).padStart(5, "0")}`;
};

const insertStockMovement = async (
  client,
  {
    productId,
    direction,
    quantity,
    movementType,
    saleId,
    movementDate,
    remarks,
    userId,
  },
) => {
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
        'PRODUCT',
        $1,
        $2,
        $3,
        $4,
        'SALE',
        $5,
        COALESCE($6::TIMESTAMP, NOW()),
        $7,
        $8
      )
    `,
    [
      productId,
      direction,
      quantity,
      movementType,
      saleId,
      movementDate,
      remarks,
      userId || null,
    ],
  );
};

const getSaleById = async (id, client = pool) => {
  const saleId = assertId(id, "sale id");

  const result = await client.query(
    `
      SELECT
        s.id,
        s.sale_no,
        s.customer_id,

        c.name AS customer_name,
        c.mobile AS customer_mobile,
        c.gstin AS customer_gstin,
        c.address AS customer_address,

        s.sale_date,
        s.vehicle_no,
        s.challan_lr_no,
        s.driver_name,
        s.driver_mobile,

        s.subtotal,
        s.discount,
        s.tax_amount,
        s.total_amount,
        s.payment_status,
        s.remarks,
        s.created_by,
        s.created_at,
        s.updated_at,

        -- Total sales return amount
       COALESCE(
  (
    SELECT SUM(sri.amount)
    FROM sales_return_items sri
    INNER JOIN sales_returns sr
      ON sr.id = sri.sales_return_id
    WHERE sr.sale_id = s.id
  ),
  0
)::numeric AS return_amount,

        -- Net sale amount after returns
       GREATEST(
  0,
  s.total_amount -
  COALESCE(
    (
      SELECT SUM(sri.amount)
      FROM sales_return_items sri
      INNER JOIN sales_returns sr
        ON sr.id = sri.sales_return_id
      WHERE sr.sale_id = s.id
    ),
    0
  )
)::numeric AS net_total,

        COALESCE(
          json_agg(
            json_build_object(
              'id', si.id,
              'product_id', si.product_id,

              'product_code', p.code,
              'product_name', p.name,

              'quantity', si.quantity,
              'unit', si.unit,
              'rate', si.rate,
              'amount', si.amount,

              -- Returned quantity
              'returned_quantity',
              COALESCE(
                (
                  SELECT SUM(sri.quantity)
                  FROM sales_return_items sri
                  JOIN sales_returns sr
                    ON sr.id = sri.sales_return_id
                  WHERE sr.sale_id = s.id
                    AND sri.product_id = si.product_id
                ),
                0
              ),

              -- Returned amount
              'returned_amount',
              COALESCE(
                (
                  SELECT SUM(sri.amount)
                  FROM sales_return_items sri
                  JOIN sales_returns sr
                    ON sr.id = sri.sales_return_id
                  WHERE sr.sale_id = s.id
                    AND sri.product_id = si.product_id
                ),
                0
              )
            )
            ORDER BY si.id
          ) FILTER (WHERE si.id IS NOT NULL),
          '[]'::json
        ) AS items

      FROM sales s

      INNER JOIN customers c
        ON c.id = s.customer_id

      LEFT JOIN sale_items si
        ON si.sale_id = s.id

      LEFT JOIN products p
        ON p.id = si.product_id

      WHERE s.id = $1

      GROUP BY
        s.id,
        c.name,
        c.mobile,
        c.gstin,
        c.address
    `,
    [saleId],
  );

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];

  const returnAmount = Number(row.return_amount || 0);

  const netTotal = Math.max(0, Number(row.total_amount || 0) - returnAmount);

  const items = (row.items || []).map((item) => {
    const quantity = Number(item.quantity || 0);

    const returnedQuantity = Number(item.returned_quantity || 0);

    const amount = Number(item.amount || 0);

    const returnedAmount = Number(item.returned_amount || 0);

    return {
      ...item,

      id: Number(item.id),
      product_id: Number(item.product_id),

      quantity,

      returned_quantity: returnedQuantity,

      remaining_quantity: Math.max(0, quantity - returnedQuantity),

      rate: Number(item.rate || 0),

      amount,

      returned_amount: returnedAmount,

      net_amount: Math.max(0, amount - returnedAmount),
    };
  });

  return {
    ...row,

    id: Number(row.id),

    customer_id: Number(row.customer_id),

    subtotal: Number(row.subtotal || 0),

    discount: Number(row.discount || 0),

    tax_amount: Number(row.tax_amount || 0),

    total_amount: Number(row.total_amount || 0),

    return_amount: returnAmount,

    net_total: netTotal,

    items,
  };
};

const listSales = async () => {
  const result = await pool.query(`
    SELECT
      s.id,
      s.sale_no,
      s.customer_id,
      c.name AS customer_name,
      c.mobile AS customer_mobile,
      s.sale_date,
      s.vehicle_no,
      s.challan_lr_no,
      s.driver_name,
      s.driver_mobile,
      s.total_amount,

      COALESCE(sr.return_amount, 0) AS return_amount,

      GREATEST(
        0,
        s.total_amount - COALESCE(sr.return_amount, 0)
      ) AS net_total,

      s.payment_status,

      COUNT(si.id)::int AS item_count,

      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'product_id', si.product_id,
            'product_name', p.name,
            'product_code', p.code,
            'quantity', si.quantity,
            'unit', si.unit
          )
          ORDER BY si.id
        ) FILTER (WHERE si.id IS NOT NULL),
        '[]'::json
      ) AS items

    FROM sales s

    INNER JOIN customers c
      ON c.id = s.customer_id

    LEFT JOIN sale_items si
      ON si.sale_id = s.id
    
    LEFT JOIN products p
      ON p.id = si.product_id

    LEFT JOIN (
      SELECT
        sr.sale_id,
        COALESCE(SUM(sri.amount), 0) AS return_amount
      FROM sales_returns sr
      INNER JOIN sales_return_items sri
        ON sri.sales_return_id = sr.id
      GROUP BY sr.sale_id
    ) sr
      ON sr.sale_id = s.id

    GROUP BY
      s.id,
      c.name,
      c.mobile,
      sr.return_amount

    ORDER BY
      s.sale_date DESC,
      s.id DESC
  `);

  return result.rows.map((row) => ({
    ...row,

    id: Number(row.id),

    customer_id: Number(row.customer_id),

    item_count: Number(row.item_count || 0),

    items: Array.isArray(row.items)
      ? row.items.map((item) => ({
          product_id: Number(item.product_id || 0),
          product_name: item.product_name || "",
          product_code: item.product_code || "",
          quantity: Number(item.quantity || 0),
          unit: item.unit || "",
        }))
      : [],

    total_amount: Number(row.total_amount || 0),

    return_amount: Number(row.return_amount || 0),

    net_total: Number(row.net_total || 0),
  }));
};

const getOptions = async () => {
  const [customersResult, productsResult] = await Promise.all([
    pool.query(`
      SELECT id, name, mobile, gstin
      FROM customers
      WHERE is_active = TRUE
      ORDER BY name ASC, id ASC
    `),

    pool.query(`
      SELECT
        p.id,
        p.code,
        p.name,
        p.unit,
        p.selling_rate,
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
      FROM products p
      LEFT JOIN stock_movements sm
        ON sm.item_type = 'PRODUCT'
       AND sm.item_id = p.id
      WHERE p.is_active = TRUE
      GROUP BY
        p.id,
        p.code,
        p.name,
        p.unit,
        p.selling_rate
      ORDER BY p.name ASC, p.id ASC
    `),
  ]);

  return {
    customers: customersResult.rows.map((row) => ({
      ...row,
      id: Number(row.id),
    })),

    products: productsResult.rows.map((row) => ({
      ...row,
      id: Number(row.id),
      selling_rate: Number(row.selling_rate || 0),
      current_stock: Number(row.current_stock || 0),
    })),
  };
};

const createSale = async (payload, { userId = null, ipAddress }) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const header = validateHeader(payload);
    const items = normalizeItems(payload.items);

    await validateCustomer(client, header.customerId);

    const validatedItems = await validateProductsAndStock(client, items);

    const totals = calculateTotals({
      items: validatedItems,
      discount: header.discount,
      taxAmount: header.taxAmount,
    });

    const saleNo = await generateSaleNo(client);

    const saleResult = await client.query(
      `
        INSERT INTO sales (
          sale_no,
          customer_id,
          sale_date,
          vehicle_no,
          challan_lr_no,
          driver_name,
          driver_mobile,
          subtotal,
          discount,
          tax_amount,
          total_amount,
          payment_status,
          remarks,
          created_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14
        )
        RETURNING *
      `,
      [
        saleNo,
        header.customerId,
        header.saleDate,
        header.vehicleNo,
        header.challanLrNo,
        header.driverName,
        header.driverMobile,
        totals.subtotal,
        totals.discount,
        totals.tax_amount,
        totals.total_amount,
        header.paymentStatus,
        header.remarks,
        userId || null,
      ],
    );

    const saleId = Number(saleResult.rows[0].id);
    const record = saleResult.rows[0];

    for (const item of validatedItems) {
      await client.query(
        `
          INSERT INTO sale_items (
            sale_id,
            product_id,
            quantity,
            unit,
            rate,
            amount
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          saleId,
          item.product_id,
          item.quantity,
          item.unit,
          item.rate,
          item.amount,
        ],
      );

      // console.log("Header:",header);

      await insertStockMovement(client, {
        productId: item.product_id,
        direction: "OUT",
        quantity: item.quantity,
        movementType: "SALE",
        saleId,
        movementDate: header.saleDate ? `${header.saleDate} ${new Date().toTimeString().slice(0, 8)}` : null,
        remarks: `Finished stock sold through ${saleNo}.`,
        userId,
      });
    }

    await client.query("COMMIT");

    const newReturn = await getSaleById(record.id);

    await createAuditLog({
      userId: userId || null,
      module: "SALES",
      action: "CREATE",
      recordId: record.id,
      oldData: null,
      newData: newReturn,
      ipAddress: ipAddress || null,
    });

    await createNotification({
  title: "New Sale Added",
  message: `${newReturn.customer_name} - ₹${Number(
    newReturn.total_amount || 0
  ).toLocaleString("en-IN")}.<br> Sale: ${newReturn.sale_no}`,
  type: "sale_created",
  referenceType: "sale",
  referenceId: saleId,
  createdBy: userId || null,
});

sendPushNotification({
  title: "New Sale Added",
  body: `${newReturn.customer_name} - ₹${Number(
    newReturn.total_amount || 0
  ).toLocaleString("en-IN")}. Sale: ${newReturn.sale_no}`,
  icon: "/images/truck-regular.png",
  badge: "/images/icon-192.png",
  url: "/sales",
}).catch((error) => {
  console.error("Sale create push notification error:", error);
});

    return getSaleById(saleId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateSale = async (id, payload, { userId = null, ipAddress }) => {
  const saleId = assertId(id, "sale id");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query(
      `
        SELECT *
        FROM sales
        WHERE id = $1
        FOR UPDATE
      `,
      [saleId],
    );

    if (!existingResult.rows.length) {
      const error = new Error("Sale not found.");
      error.statusCode = 404;
      throw error;
    }

    const existing = existingResult.rows[0];

    const oldSale = await getSaleById(saleId, client);

    // const paymentResult = await client.query(
    //   `
    //     SELECT COUNT(*)::int AS count
    //     FROM payments
    //     WHERE payment_type = 'CUSTOMER'
    //       AND sale_id = $1
    //   `,
    //   [saleId],
    // );

    // if (Number(paymentResult.rows[0]?.count || 0) > 0) {
    //   const error = new Error(
    //     "This sale has customer payments. Payment-linked sales cannot be edited.",
    //   );
    //   error.statusCode = 409;
    //   throw error;
    // }

    // const dispatchResult = await client.query(
    //   `
    //     SELECT COUNT(*)::int AS count
    //     FROM dispatches
    //     WHERE sale_id = $1
    //   `,
    //   [saleId],
    // );

    // if (Number(dispatchResult.rows[0]?.count || 0) > 0) {
    //   const error = new Error(
    //     "This sale is already linked to a dispatch and cannot be edited.",
    //   );
    //   error.statusCode = 409;
    //   throw error;
    // }

    const header = validateHeader(payload);
    const items = normalizeItems(payload.items);

    await validateCustomer(client, header.customerId);

    const oldItemsResult = await client.query(
      `
        SELECT product_id, quantity
        FROM sale_items
        WHERE sale_id = $1
      `,
      [saleId],
    );

    const oldItems = oldItemsResult.rows.map((row) => ({
      product_id: Number(row.product_id),
      quantity: Number(row.quantity || 0),
    }));

    const oldAllowance = new Map();

    for (const item of oldItems) {
      oldAllowance.set(
        item.product_id,
        (oldAllowance.get(item.product_id) || 0) + item.quantity,
      );
    }

    const validatedItems = await validateProductsAndStock(
      client,
      items,
      oldAllowance,
    );

    const allProductIds = [
      ...oldItems.map((item) => item.product_id),
      ...validatedItems.map((item) => item.product_id),
    ];

    await lockProducts(client, allProductIds);

    const oldByProduct = new Map();
    for (const item of oldItems) {
      oldByProduct.set(
        item.product_id,
        (oldByProduct.get(item.product_id) || 0) + item.quantity,
      );
    }

    const newByProduct = new Map();
    for (const item of validatedItems) {
      newByProduct.set(
        item.product_id,
        (newByProduct.get(item.product_id) || 0) + item.quantity,
      );
    }

    const productIds = [
      ...new Set([...oldByProduct.keys(), ...newByProduct.keys()]),
    ];

    for (const productId of productIds) {
      const currentStock = await getProductStock(client, productId);
      const oldQuantity = oldByProduct.get(productId) || 0;
      const newQuantity = newByProduct.get(productId) || 0;
      const finalStock = currentStock + oldQuantity - newQuantity;

      if (finalStock < -EPSILON) {
        const productResult = await client.query(
          `SELECT name, unit FROM products WHERE id = $1`,
          [productId],
        );

        const product = productResult.rows[0];

        const error = new Error(
          `Cannot update sale. "${product?.name || "Product"}" ` +
            `would become negative stock (${finalStock} ${product?.unit || ""}).`,
        );
        error.statusCode = 400;
        throw error;
      }
    }

    const totals = calculateTotals({
      items: validatedItems,
      discount: header.discount,
      taxAmount: header.taxAmount,
    });

    // for (const item of oldItems) {
    //   await insertStockMovement(client, {
    //     productId: item.product_id,
    //     direction: "IN",
    //     quantity: item.quantity,
    //     movementType: "SALE_EDIT_REVERSAL",
    //     saleId,
    //     movementDate: existing.sale_date ? `${existing.sale_date}` : null,
    //     remarks: `Previous quantity restored while editing sale ${existing.sale_no}.`,
    //     userId,
    //   });
    // }

    // for (const item of validatedItems) {
    //   await insertStockMovement(client, {
    //     productId: item.product_id,
    //     direction: "OUT",
    //     quantity: item.quantity,
    //     movementType: "SALE_EDIT",
    //     saleId,
    //     movementDate: header.saleDate ? `${header.saleDate}` : null,
    //     remarks: `Updated finished-stock quantity for sale ${existing.sale_no}.`,
    //     userId,
    //   });
    // }

    // =====================================================
// UPDATE EXISTING STOCK MOVEMENTS
// Do NOT create reversal + new movement on every edit.
// =====================================================


for (const productId of allProductIds) {
  const oldQuantity = oldByProduct.get(productId) || 0;
  const newQuantity = newByProduct.get(productId) || 0;

  // ---------------------------------------------
  // Product existed before and still exists
  // ---------------------------------------------
  if (oldQuantity > 0 && newQuantity > 0) {
    const movementResult = await client.query(
      `
        SELECT id
        FROM stock_movements
        WHERE item_type = 'PRODUCT'
          AND item_id = $1
          AND direction = 'OUT'
          AND movement_type = 'SALE'
          AND reference_type = 'SALE'
          AND reference_id = $2
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE
      `,
      [productId, saleId]
    );

    if (movementResult.rows.length) {
      // UPDATE existing movement
      await client.query(
        `
          UPDATE stock_movements
          SET
            quantity = $1,
            movement_date = COALESCE($2::TIMESTAMP, movement_date),
            remarks = $3,
            created_by = COALESCE($4, created_by)
          WHERE id = $5
        `,
        [
          newQuantity,
          header.saleDate
            ? `${header.saleDate} ${new Date().toTimeString().slice(0, 8)}`
            : null,
          `Finished stock sold through updated sale ${existing.sale_no}.`,
          userId || null,
          movementResult.rows[0].id,
        ]
      );
    } else {
      // Old sale movement not found.
      // Create it once to repair missing stock movement.
      await insertStockMovement(client, {
        productId,
        direction: "OUT",
        quantity: newQuantity,
        movementType: "SALE",
        saleId,
        movementDate: header.saleDate
          ? `${header.saleDate} ${new Date().toTimeString().slice(0, 8)}`
          : null,
        remarks: `Finished stock sold through updated sale ${existing.sale_no}.`,
        userId,
      });
    }
  }

  // ---------------------------------------------
  // Product was removed from the sale
  // ---------------------------------------------
  else if (oldQuantity > 0 && newQuantity === 0) {
    await client.query(
      `
        DELETE FROM stock_movements
        WHERE item_type = 'PRODUCT'
          AND item_id = $1
          AND direction = 'OUT'
          AND movement_type = 'SALE'
          AND reference_type = 'SALE'
          AND reference_id = $2
      `,
      [productId, saleId]
    );
  }

  // ---------------------------------------------
  // New product added to existing sale
  // ---------------------------------------------
  else if (oldQuantity === 0 && newQuantity > 0) {
    await insertStockMovement(client, {
      productId,
      direction: "OUT",
      quantity: newQuantity,
      movementType: "SALE",
      saleId,
      movementDate: header.saleDate
        ? `${header.saleDate} ${new Date().toTimeString().slice(0, 8)}`
        : null,
      remarks: `Finished stock added through updated sale ${existing.sale_no}.`,
      userId,
    });
  }
}

    await client.query(
      `
        UPDATE sales
        SET
          customer_id = $1,
          sale_date = $2,
          vehicle_no = $3,
          driver_name = $4,
          driver_mobile = $5,
          subtotal = $6,
          discount = $7,
          tax_amount = $8,
          total_amount = $9,
          payment_status = $10,
          remarks = $11,
          challan_lr_no = $12,
          updated_at = NOW()
        WHERE id = $13
      `,
      [
        header.customerId,
        header.saleDate,
        header.vehicleNo,
        header.driverName,
        header.driverMobile,
        totals.subtotal,
        totals.discount,
        totals.tax_amount,
        totals.total_amount,
        header.paymentStatus,
        header.remarks,
        header.challanLrNo,
        saleId,
      ],
    );

    await client.query(`DELETE FROM sale_items WHERE sale_id = $1`, [saleId]);

    for (const item of validatedItems) {
      await client.query(
        `
          INSERT INTO sale_items (
            sale_id,
            product_id,
            quantity,
            unit,
            rate,
            amount
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          saleId,
          item.product_id,
          item.quantity,
          item.unit,
          item.rate,
          item.amount,
        ],
      );
    }

    await client.query("COMMIT");

    const newSale = await getSaleById(saleId);

    await createAuditLog({
      userId: userId || null,
      module: "SALES",
      action: "UPDATE",
      recordId: saleId,
      oldData: oldSale,
      newData: newSale,
      ipAddress: ipAddress || null,
    });

    await createNotification({
  title: "Sale Updated",
  message: `${newSale.customer_name} - ₹${Number(
    newSale.total_amount || 0
  ).toLocaleString("en-IN")}. <br>Sale: ${newSale.sale_no}`,
  type: "sale_updated",
  referenceType: "sale",
  referenceId: saleId,
  createdBy: userId || null,
});

sendPushNotification({
  title: "Sale Updated",
  body: `${newSale.customer_name} - ₹${Number(
    newSale.total_amount || 0
  ).toLocaleString("en-IN")}. Sale: ${newSale.sale_no}`,
  icon: "/images/truck-regular.png",
  badge: "/images/icon-192.png",
  url: "/sales",
}).catch((error) => {
  console.error("Sale update push notification error:", error);
});

    return getSaleById(saleId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deleteSale = async (id, { userId = null, ipAddress }) => {
  const saleId = assertId(id, "sale id");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const saleResult = await client.query(
      `
        SELECT *
        FROM sales
        WHERE id = $1
        FOR UPDATE
      `,
      [saleId],
    );

    if (!saleResult.rows.length) {
      const error = new Error("Sale not found.");
      error.statusCode = 404;
      throw error;
    }

    const sale = saleResult.rows[0];
    const oldSale = await getSaleById(saleId, client);

    // const [paymentResult, dispatchResult, returnResult] =
    //   await Promise.all([
    //     client.query(
    //       `
    //         SELECT COUNT(*)::int AS count
    //         FROM payments
    //         WHERE payment_type = 'CUSTOMER'
    //           AND sale_id = $1
    //       `,
    //       [saleId],
    //     ),
    //     client.query(
    //       `
    //         SELECT COUNT(*)::int AS count
    //         FROM dispatches
    //         WHERE sale_id = $1
    //       `,
    //       [saleId],
    //     ),
    //     client.query(
    //       `
    //         SELECT COUNT(*)::int AS count
    //         FROM sales_returns
    //         WHERE sale_id = $1
    //       `,
    //       [saleId],
    //     ),
    //   ]);

    const paymentResult = await client.query(
      `
    SELECT COUNT(*)::int AS count
    FROM payments
    WHERE payment_type = 'CUSTOMER'
      AND sale_id = $1
  `,
      [saleId],
    );

    const dispatchResult = await client.query(
      `
    SELECT COUNT(*)::int AS count
    FROM dispatches
    WHERE sale_id = $1
  `,
      [saleId],
    );

    const returnResult = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM sales_returns
        WHERE sale_id = $1
      `,
          [saleId],
        );

    if (Number(paymentResult.rows[0]?.count || 0) > 0) {
      const error = new Error(
        "Cannot delete this sale because customer payments are linked to it.",
      );
      error.statusCode = 409;
      throw error;
    }

    if (Number(dispatchResult.rows[0]?.count || 0) > 0) {
      const error = new Error(
        "Cannot delete this sale because a dispatch is linked to it.",
      );
      error.statusCode = 409;
      throw error;
    }

    if (Number(returnResult.rows[0]?.count || 0) > 0) {
      const error = new Error(
        "Cannot delete this sale because a sales return is linked to it.",
      );
      error.statusCode = 409;
      throw error;
    }

    const itemsResult = await client.query(
      `
        SELECT product_id, quantity
        FROM sale_items
        WHERE sale_id = $1
      `,
      [saleId],
    );

    const items = itemsResult.rows.map((row) => ({
      product_id: Number(row.product_id),
      quantity: Number(row.quantity || 0),
    }));

    await lockProducts(
      client,
      items.map((item) => item.product_id),
    );

    for (const item of items) {
      await insertStockMovement(client, {
        productId: item.product_id,
        direction: "IN",
        quantity: item.quantity,
        movementType: "SALE_DELETE_REVERSAL",
        saleId,
        movementDate: sale.sale_date ? `${sale.sale_date}` : null,
        remarks: `Finished stock restored after deleting sale ${sale.sale_no}.`,
        userId,
      });
    }

    await client.query(`DELETE FROM sales WHERE id = $1`, [saleId]);

    await client.query("COMMIT");

    await createAuditLog({
      userId: userId || null,
      module: "SALES",
      action: "DELETE",
      recordId: saleId,
      oldData: oldSale,
      newData: null,
      ipAddress: ipAddress || null,
    });

    await createNotification({
  title: "Sale Deleted",
  message: `${oldSale.customer_name} - ₹${Number(
    oldSale.total_amount || 0
  ).toLocaleString("en-IN")}.<br> Sale: ${oldSale.sale_no} deleted.`,
  type: "sale_deleted",
  referenceType: "sale",
  referenceId: saleId,
  createdBy: userId || null,
});

sendPushNotification({
  title: "Sale Deleted",
  body: `${oldSale.customer_name} - ₹${Number(
    oldSale.total_amount || 0
  ).toLocaleString("en-IN")}. Sale: ${oldSale.sale_no} deleted.`,
  icon: "/images/truck-regular.png",
  badge: "/images/icon-192.png",
  url: "/sales",
}).catch((error) => {
  console.error("Sale delete push notification error:", error);
});

    return {
      id: saleId,
      sale_no: sale.sale_no,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  listSales,
  getOptions,
  getSaleById,
  createSale,
  updateSale,
  deleteSale,
};
