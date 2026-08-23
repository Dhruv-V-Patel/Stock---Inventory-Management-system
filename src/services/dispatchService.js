const pool = require("../config/db");

const getDispatchSummary = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total_dispatches,
      COUNT(*) FILTER (WHERE dispatch_date = CURRENT_DATE)::int AS today_dispatches,
      COALESCE((
        SELECT SUM(quantity)
        FROM dispatch_items
      ), 0)::numeric AS total_items
    FROM dispatches
  `);

  const row = result.rows[0] || {};

  return {
    total_dispatches: Number(row.total_dispatches || 0),
    today_dispatches: Number(row.today_dispatches || 0),
    total_items: Number(row.total_items || 0),
  };
};

const listDispatches = async ({ search = "" } = {}) => {
  const values = [];
  let where = "";

  if (search.trim()) {
    values.push(`%${search.trim()}%`);
    where = `
      WHERE
        d.dispatch_no ILIKE $1
        OR COALESCE(s.sale_no, '') ILIKE $1
        OR c.name ILIKE $1
        OR COALESCE(c.mobile, '') ILIKE $1
        OR COALESCE(d.vehicle_no, '') ILIKE $1
        OR COALESCE(d.challan_no, '') ILIKE $1
    `;
  }

  const result = await pool.query(
    `
      SELECT
        d.id,
        d.dispatch_no,
        d.sale_id,
        s.sale_no,
        d.customer_id,
        c.name AS customer_name,
        c.mobile AS customer_mobile,
        d.dispatch_date,
        d.vehicle_no,
        d.driver_name,
        d.driver_mobile,
        d.challan_no,
        d.remarks,
        COUNT(di.id)::int AS item_count,
        COALESCE(SUM(di.quantity), 0)::numeric AS total_quantity
      FROM dispatches d
      INNER JOIN customers c ON c.id = d.customer_id
      LEFT JOIN sales s ON s.id = d.sale_id
      LEFT JOIN dispatch_items di ON di.dispatch_id = d.id
      ${where}
      GROUP BY
        d.id,
        d.dispatch_no,
        d.sale_id,
        s.sale_no,
        d.customer_id,
        c.name,
        c.mobile
      ORDER BY d.dispatch_date DESC, d.id DESC
    `,
    values
  );

  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    sale_id: row.sale_id ? Number(row.sale_id) : null,
    customer_id: Number(row.customer_id),
    item_count: Number(row.item_count || 0),
    total_quantity: Number(row.total_quantity || 0),
  }));
};

const getDispatchById = async (id) => {
  const result = await pool.query(
    `
      SELECT
        d.id,
        d.dispatch_no,
        d.sale_id,
        s.sale_no,
        d.customer_id,
        c.name AS customer_name,
        c.mobile AS customer_mobile,
        c.gstin AS customer_gstin,
        c.address AS customer_address,
        d.dispatch_date,
        d.vehicle_no,
        d.driver_name,
        d.driver_mobile,
        d.challan_no,
        d.remarks,
        COALESCE(
          json_agg(
            json_build_object(
              'id', di.id,
              'product_id', di.product_id,
              'product_code', p.code,
              'product_name', p.name,
              'quantity', di.quantity,
              'unit', di.unit
            )
            ORDER BY di.id
          ) FILTER (WHERE di.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM dispatches d
      INNER JOIN customers c ON c.id = d.customer_id
      LEFT JOIN sales s ON s.id = d.sale_id
      LEFT JOIN dispatch_items di ON di.dispatch_id = d.id
      LEFT JOIN products p ON p.id = di.product_id
      WHERE d.id = $1
      GROUP BY
        d.id,
        d.dispatch_no,
        d.sale_id,
        s.sale_no,
        d.customer_id,
        c.name,
        c.mobile,
        c.gstin,
        c.address
    `,
    [id]
  );

  if (!result.rows.length) return null;

  const row = result.rows[0];

  return {
    ...row,
    id: Number(row.id),
    sale_id: row.sale_id ? Number(row.sale_id) : null,
    customer_id: Number(row.customer_id),
    items: (row.items || []).map((item) => ({
      ...item,
      id: Number(item.id),
      product_id: Number(item.product_id),
      quantity: Number(item.quantity || 0),
    })),
  };
};

const getSalesForDispatch = async () => {
  const result = await pool.query(`
    SELECT
      s.id,
      s.sale_no,
      s.customer_id,
      c.name AS customer_name,
      s.sale_date,
      s.vehicle_no,
      s.driver_name,
      s.driver_mobile
    FROM sales s
    INNER JOIN customers c ON c.id = s.customer_id
    ORDER BY s.sale_date DESC, s.id DESC
  `);

  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    customer_id: Number(row.customer_id),
    vehicle_no: row.vehicle_no || null,
    driver_name: row.driver_name || null,
    driver_mobile: row.driver_mobile || null,
  }));
};

const getSaleItemsForDispatch = async (saleId, excludeDispatchId = null) => {
  const result = await pool.query(
    `
      SELECT
        si.product_id,
        p.code AS product_code,
        p.name AS product_name,
        si.quantity AS ordered_quantity,
        si.unit,
        COALESCE((
          SELECT SUM(di.quantity)
          FROM dispatch_items di
          INNER JOIN dispatches d ON d.id = di.dispatch_id
          WHERE d.sale_id = si.sale_id
            AND di.product_id = si.product_id
            AND ($2::bigint IS NULL OR d.id <> $2)
        ), 0) AS dispatched_quantity
      FROM sale_items si
      INNER JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = $1
      ORDER BY si.id
    `,
    [saleId, excludeDispatchId]
  );

  return result.rows.map((row) => {
    const ordered = Number(row.ordered_quantity || 0);
    const dispatched = Number(row.dispatched_quantity || 0);

    return {
      ...row,
      product_id: Number(row.product_id),
      ordered_quantity: ordered,
      dispatched_quantity: dispatched,
      pending_quantity: Math.max(ordered - dispatched, 0),
    };
  });
};

const getOptions = async () => {
  const [sales, products] = await Promise.all([
    getSalesForDispatch(),
    pool.query(`
      SELECT id, code, name, unit
      FROM products
      WHERE is_active = TRUE
      ORDER BY name, id
    `),
  ]);

  return {
    sales,
    products: products.rows.map((row) => ({
      ...row,
      id: Number(row.id),
    })),
  };
};

const getSaleForDispatch = async (saleId, excludeDispatchId = null) => {
  const saleResult = await pool.query(
    `
      SELECT
        s.id,
        s.sale_no,
        s.customer_id,
        c.name AS customer_name,
        c.mobile AS customer_mobile,
        s.sale_date,
        s.vehicle_no,
        s.driver_name,
        s.driver_mobile
      FROM sales s
      INNER JOIN customers c ON c.id = s.customer_id
      WHERE s.id = $1
    `,
    [saleId]
  );

  if (!saleResult.rows.length) return null;

  const sale = saleResult.rows[0];

  return {
    ...sale,
    id: Number(sale.id),
    customer_id: Number(sale.customer_id),
    vehicle_no: sale.vehicle_no || null,
    driver_name: sale.driver_name || null,
    driver_mobile: sale.driver_mobile || null,
    items: await getSaleItemsForDispatch(saleId, excludeDispatchId),
  };
};

const validateItems = (items) => {
  if (!Array.isArray(items) || !items.length) {
    const error = new Error("At least one dispatch item is required.");
    error.statusCode = 400;
    throw error;
  }

  for (const item of items) {
    const quantity = Number(item.quantity);

    if (!Number.isInteger(Number(item.product_id)) || quantity <= 0) {
      const error = new Error("Every item must have a valid product and quantity.");
      error.statusCode = 400;
      throw error;
    }
  }
};

const createDispatch = async (payload, userId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      sale_id,
      customer_id,
      dispatch_date,
      vehicle_no,
      driver_name,
      driver_mobile,
      challan_no,
      remarks,
      items,
    } = payload;

    if (!customer_id) {
      const error = new Error("Customer is required.");
      error.statusCode = 400;
      throw error;
    }

    validateItems(items);

    if (sale_id) {
      const sale = await client.query(
        `SELECT id, customer_id FROM sales WHERE id = $1`,
        [sale_id]
      );

      if (!sale.rows.length) {
        const error = new Error("Sale not found.");
        error.statusCode = 404;
        throw error;
      }

      if (Number(sale.rows[0].customer_id) !== Number(customer_id)) {
        const error = new Error("Customer does not match selected sale.");
        error.statusCode = 400;
        throw error;
      }

      for (const item of items) {
        const check = await client.query(
          `
            SELECT
              si.quantity AS ordered_quantity,
              COALESCE((
                SELECT SUM(di.quantity)
                FROM dispatch_items di
                INNER JOIN dispatches d ON d.id = di.dispatch_id
                WHERE d.sale_id = $1
                  AND di.product_id = $2
              ), 0) AS dispatched_quantity
            FROM sale_items si
            WHERE si.sale_id = $1
              AND si.product_id = $2
          `,
          [sale_id, item.product_id]
        );

        const ordered = Number(check.rows[0]?.ordered_quantity || 0);
        const dispatched = Number(check.rows[0]?.dispatched_quantity || 0);
        const pending = Math.max(ordered - dispatched, 0);
        const requested = Number(item.quantity);

        if (!check.rows.length || requested > pending) {
          const error = new Error(
            `Dispatch quantity for product ${item.product_id} exceeds pending quantity (${pending}).`
          );
          error.statusCode = 400;
          throw error;
        }
      }
    }

    const noResult = await client.query(`
      SELECT COALESCE(
        MAX(
          CAST(NULLIF(REGEXP_REPLACE(dispatch_no, '[^0-9]', '', 'g'), '') AS BIGINT)
        ),
        0
      ) + 1 AS next_number
      FROM dispatches
    `);

    const dispatchNo = `DSP-${String(noResult.rows[0].next_number).padStart(5, "0")}`;

    const dispatchResult = await client.query(
      `
        INSERT INTO dispatches (
          dispatch_no,
          sale_id,
          customer_id,
          dispatch_date,
          vehicle_no,
          driver_name,
          driver_mobile,
          challan_no,
          remarks,
          created_by
        )
        VALUES (
          $1, $2, $3, COALESCE($4, CURRENT_DATE),
          $5, $6, $7, $8, $9, $10
        )
        RETURNING id
      `,
      [
        dispatchNo,
        sale_id || null,
        customer_id,
        dispatch_date || null,
        vehicle_no || null,
        driver_name || null,
        driver_mobile || null,
        challan_no || null,
        remarks || null,
        userId || null,
      ]
    );

    const dispatchId = Number(dispatchResult.rows[0].id);

    for (const item of items) {
      await client.query(
        `
          INSERT INTO dispatch_items (
            dispatch_id,
            product_id,
            quantity,
            unit
          )
          VALUES ($1, $2, $3, COALESCE($4, 'PCS'))
        `,
        [
          dispatchId,
          item.product_id,
          Number(item.quantity),
          item.unit || null,
        ]
      );
    }

    await client.query("COMMIT");

    return getDispatchById(dispatchId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateDispatch = async (id, payload) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, sale_id, customer_id FROM dispatches WHERE id = $1`,
      [id]
    );

    if (!existing.rows.length) {
      const error = new Error("Dispatch not found.");
      error.statusCode = 404;
      throw error;
    }

    const {
      dispatch_date,
      vehicle_no,
      driver_name,
      driver_mobile,
      challan_no,
      remarks,
      items,
    } = payload;

    validateItems(items);

    const saleId = existing.rows[0].sale_id;

    if (saleId) {
      for (const item of items) {
        const check = await client.query(
          `
            SELECT
              si.quantity AS ordered_quantity,
              COALESCE((
                SELECT SUM(di.quantity)
                FROM dispatch_items di
                INNER JOIN dispatches d ON d.id = di.dispatch_id
                WHERE d.sale_id = $1
                  AND di.product_id = $2
                  AND d.id <> $3
              ), 0) AS dispatched_quantity
            FROM sale_items si
            WHERE si.sale_id = $1
              AND si.product_id = $2
          `,
          [saleId, item.product_id, id]
        );

        const ordered = Number(check.rows[0]?.ordered_quantity || 0);
        const dispatched = Number(check.rows[0]?.dispatched_quantity || 0);
        const pending = Math.max(ordered - dispatched, 0);
        const requested = Number(item.quantity);

        if (!check.rows.length || requested > pending) {
          const error = new Error(
            `Dispatch quantity for product ${item.product_id} exceeds pending quantity (${pending}).`
          );
          error.statusCode = 400;
          throw error;
        }
      }
    }

    await client.query(
      `
        UPDATE dispatches
        SET
          dispatch_date = COALESCE($2, dispatch_date),
          vehicle_no = $3,
          driver_name = $4,
          driver_mobile = $5,
          challan_no = $6,
          remarks = $7
        WHERE id = $1
      `,
      [
        id,
        dispatch_date || null,
        vehicle_no || null,
        driver_name || null,
        driver_mobile || null,
        challan_no || null,
        remarks || null,
      ]
    );

    await client.query(
      `DELETE FROM dispatch_items WHERE dispatch_id = $1`,
      [id]
    );

    for (const item of items) {
      await client.query(
        `
          INSERT INTO dispatch_items (
            dispatch_id,
            product_id,
            quantity,
            unit
          )
          VALUES ($1, $2, $3, COALESCE($4, 'PCS'))
        `,
        [
          id,
          item.product_id,
          Number(item.quantity),
          item.unit || null,
        ]
      );
    }

    await client.query("COMMIT");

    return getDispatchById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deleteDispatch = async (id) => {
  const result = await pool.query(
    `
      DELETE FROM dispatches
      WHERE id = $1
      RETURNING id, dispatch_no
    `,
    [id]
  );

  if (!result.rows.length) {
    const error = new Error("Dispatch not found.");
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
};

module.exports = {
  getDispatchSummary,
  listDispatches,
  getDispatchById,
  getOptions,
  getSaleForDispatch,
  createDispatch,
  updateDispatch,
  deleteDispatch,
};
