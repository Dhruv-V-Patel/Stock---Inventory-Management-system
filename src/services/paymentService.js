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

const normalizeMethod = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const allowedMethods = ["CASH", "UPI", "BANK", "CHEQUE", "CARD", "OTHER"];

const normalizePaymentMode = (value) => {
  const mode = String(value || "INVOICE")
    .trim()
    .toUpperCase();

  return mode === "ADVANCE" ? "ADVANCE" : "INVOICE";
};

const error = (message, statusCode = 400) => {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
};

const getPartyColumns = (type) => {
  if (type === "CUSTOMER") {
    return {
      partyTable: "customers",
      partyIdColumn: "customer_id",
      documentTable: "sales",
      documentIdColumn: "sale_id",
      documentNoColumn: "sale_no",
      dateColumn: "sale_date",
    };
  }

  return {
    partyTable: "suppliers",
    partyIdColumn: "supplier_id",
    documentTable: "purchases",
    documentIdColumn: "purchase_id",
    documentNoColumn: "purchase_no",
    dateColumn: "purchase_date",
  };
};

/* =========================================================
   PAYMENT LIST
   ========================================================= */

const listPayments = async () => {
  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.payment_no,
      p.payment_type,
      p.payment_mode,
      p.customer_id,
      p.supplier_id,
      p.sale_id,
      p.purchase_id,
      p.payment_date,
      p.amount,
      p.payment_method,
      p.reference_no,
      p.remarks,

      CASE
        WHEN p.payment_type = 'CUSTOMER' THEN c.name
        ELSE s.name
      END AS party_name,

      CASE
        WHEN p.payment_type = 'CUSTOMER' THEN c.mobile
        ELSE s.mobile
      END AS party_mobile,

      COALESCE(
        STRING_AGG(
          DISTINCT
          CASE
            WHEN p.payment_type = 'CUSTOMER'
              THEN sa.sale_no
            ELSE pu.purchase_no
          END,
          ', '
        ),
        CASE
          WHEN p.payment_mode = 'ADVANCE' THEN 'Advance'
          ELSE 'Unallocated'
        END
      ) AS document_no

    FROM payments p

    LEFT JOIN customers c
      ON c.id = p.customer_id

    LEFT JOIN suppliers s
      ON s.id = p.supplier_id

    LEFT JOIN sales sa
      ON sa.id = p.sale_id

    LEFT JOIN purchases pu
      ON pu.id = p.purchase_id

    LEFT JOIN payment_allocations pa
      ON pa.payment_id = p.id

    LEFT JOIN sales allocated_sales
      ON allocated_sales.id = pa.sale_id

    LEFT JOIN purchases allocated_purchases
      ON allocated_purchases.id = pa.purchase_id

    GROUP BY
      p.id,
      c.name,
      c.mobile,
      s.name,
      s.mobile,
      sa.sale_no,
      pu.purchase_no

    ORDER BY
      p.payment_date DESC,
      p.id DESC
  `);

  const paymentIds = rows.map((row) => Number(row.id));

  let allocationMap = {};

  if (paymentIds.length) {
    const allocations = await pool.query(
      `
        SELECT
          pa.payment_id,

          COALESCE(sa.sale_no, pu.purchase_no) AS document_no

        FROM payment_allocations pa

        LEFT JOIN sales sa
          ON sa.id = pa.sale_id

        LEFT JOIN purchases pu
          ON pu.id = pa.purchase_id

        WHERE pa.payment_id = ANY($1::bigint[])

        ORDER BY pa.payment_id, pa.id
      `,
      [paymentIds],
    );

    allocationMap = allocations.rows.reduce((map, row) => {
      const paymentId = Number(row.payment_id);

      if (!map[paymentId]) {
        map[paymentId] = [];
      }

      if (row.document_no) {
        map[paymentId].push(row.document_no);
      }

      return map;
    }, {});
  }

  return rows.map((row) => {
    const id = Number(row.id);

    const allocatedDocuments = [...(allocationMap[id] || [])];

    if (row.payment_mode === "ADVANCE" && allocatedDocuments.length === 0) {
      allocatedDocuments.push("Advance");
    }

    if (allocatedDocuments.length === 0 && row.document_no) {
      allocatedDocuments.push(row.document_no);
    }

    return {
      ...row,

      id,

      customer_id: row.customer_id ? Number(row.customer_id) : null,

      supplier_id: row.supplier_id ? Number(row.supplier_id) : null,

      sale_id: row.sale_id ? Number(row.sale_id) : null,

      purchase_id: row.purchase_id ? Number(row.purchase_id) : null,

      amount: Number(row.amount || 0),

      document_no: allocatedDocuments.join(", "),
    };
  });
};

/* =========================================================
   CALCULATE PARTY DUE
   ========================================================= */

const getPartyDue = async (client, type, partyId) => {
  const normalizedType = String(type || "").toUpperCase();

  if (!["CUSTOMER", "SUPPLIER"].includes(normalizedType)) {
    throw error("Invalid payment type.");
  }

  const id = Number(partyId);

  if (!Number.isInteger(id) || id <= 0) {
    throw error("Invalid party id.");
  }

  const partyColumn =
    normalizedType === "CUSTOMER" ? "customer_id" : "supplier_id";

  const documentTable = normalizedType === "CUSTOMER" ? "sales" : "purchases";

  const documentIdColumn =
    normalizedType === "CUSTOMER" ? "sale_id" : "purchase_id";

  const result = await client.query(
    `
      SELECT

        /* ============================================
           TOTAL INVOICE VALUE
           ============================================ */
        COALESCE(
          (
            SELECT SUM(d.total_amount)
            FROM ${documentTable} d
            WHERE d.${partyColumn} = $1::BIGINT
          ),
          0
        ) AS total_invoice,


        /* ============================================
           NEW PAYMENT ALLOCATIONS
           ============================================ */
        COALESCE(
          (
            SELECT SUM(pa.allocated_amount)
            FROM payment_allocations pa

            INNER JOIN ${documentTable} d
              ON d.id = pa.${documentIdColumn}

            INNER JOIN payments p
              ON p.id = pa.payment_id

            WHERE d.${partyColumn} = $1::BIGINT
              AND p.payment_type = $2::VARCHAR
          ),
          0
        ) AS total_allocated,


        /* ============================================
           OLD / LEGACY DIRECT PAYMENTS
           
           Old payments have sale_id / purchase_id
           directly stored in payments table.
           
           New payments have NULL sale_id/purchase_id
           and are counted through allocations above.
           ============================================ */
        COALESCE(
          (
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.payment_type = $2::VARCHAR
              AND p.payment_mode <> 'ADVANCE'
              AND p.${partyColumn} = $1::BIGINT
              AND p.${documentIdColumn} IS NOT NULL
          ),
          0
        ) AS legacy_paid,


        /* ============================================
           TOTAL ADVANCE
           ============================================ */
        COALESCE(
          (
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.payment_type = $2::VARCHAR
              AND p.payment_mode = 'ADVANCE'
              AND p.${partyColumn} = $1::BIGINT
          ),
          0
        ) AS total_advance,


        /* ============================================
           USED ADVANCE
           ============================================ */
        COALESCE(
          (
            SELECT SUM(pa.allocated_amount)
            FROM payment_allocations pa

            INNER JOIN payments ap
              ON ap.id = pa.payment_id

            WHERE ap.payment_type = $2::VARCHAR
              AND ap.payment_mode = 'ADVANCE'
              AND ap.${partyColumn} = $1::BIGINT
          ),
          0
        ) AS used_advance

    `,
    [id, normalizedType],
  );

  const row = result.rows[0] || {};

  const totalInvoice = Number(row.total_invoice || 0);

  const totalAllocated = Number(row.total_allocated || 0);

  const legacyPaid = Number(row.legacy_paid || 0);

  const totalAdvance = Number(row.total_advance || 0);

  const usedAdvance = Number(row.used_advance || 0);

  // const totalPaid = totalAllocated + legacyPaid;

  const grossDue = Math.max(totalInvoice - totalAllocated, 0);

  const availableAdvance = Math.max(totalAdvance - usedAdvance, 0);

  const totalDue = Math.max(grossDue - availableAdvance, 0);

  return {
    type: normalizedType,
    party_id: id,
    total_invoice: totalInvoice,
    total_paid: totalAllocated,
    gross_due: grossDue,
    total_due: totalDue,
    total_advance: totalAdvance,
    used_advance: usedAdvance,
    available_advance: availableAdvance,
  };
};

/* =========================================================
   GET AVAILABLE ADVANCE
   ========================================================= */

const getAvailableAdvance = async (
  client,
  type,
  partyId,
  excludePaymentId = null,
) => {
  const partyColumn = type === "CUSTOMER" ? "customer_id" : "supplier_id";

  const params = [partyId];

  let excludePaymentSql = "";

  if (excludePaymentId) {
    params.push(excludePaymentId);

    excludePaymentSql = `
      AND p.id <> $2
    `;
  }

  const result = await client.query(
    `
      SELECT
        COALESCE(SUM(p.amount), 0)
        -
        COALESCE(
          (
            SELECT SUM(pa.allocated_amount)

            FROM payment_allocations pa

            INNER JOIN payments ap
              ON ap.id = pa.payment_id

            WHERE ap.payment_type = $1
              AND ap.payment_mode = 'ADVANCE'
              AND ap.${partyColumn} = $2
              ${excludePaymentId ? "AND ap.id <> $3" : ""}
          ),
          0
        ) AS available_advance

      FROM payments p

      WHERE p.payment_type = $1
        AND p.payment_mode = 'ADVANCE'
        AND p.${partyColumn} = $2
        ${excludePaymentSql}
    `,
    excludePaymentId ? [type, partyId, excludePaymentId] : [type, partyId],
  );

  return Math.max(Number(result.rows[0]?.available_advance || 0), 0);
};

/* =========================================================
   AUTO APPLY AVAILABLE ADVANCE TO NEW INVOICE
   FIFO = OLDEST ADVANCE FIRST
   ========================================================= */

const applyAvailableAdvance = async (client, type, partyId, documentId) => {
  const normalizedType = String(type || "").toUpperCase();

  if (!["CUSTOMER", "SUPPLIER"].includes(normalizedType)) {
    throw error("Invalid payment type.");
  }

  const id = assertId(
    partyId,
    normalizedType === "CUSTOMER" ? "customer" : "supplier",
  );

  const docId = assertId(
    documentId,
    normalizedType === "CUSTOMER" ? "sale" : "purchase",
  );

  const { documentTable, documentIdColumn, partyIdColumn } =
    getPartyColumns(normalizedType);

  /*
   * Get invoice total
   */
  const documentResult = await client.query(
    `
      SELECT
        id,
        total_amount
      FROM ${documentTable}
      WHERE id = $1
        AND ${partyIdColumn} = $2
      FOR UPDATE
    `,
    [docId, id],
  );

  if (!documentResult.rows.length) {
    throw error(
      `${normalizedType === "CUSTOMER" ? "Sale" : "Purchase"} not found.`,
      404,
    );
  }

  const invoiceTotal = Number(documentResult.rows[0].total_amount || 0);

  const allocatedResult = await client.query(
    `
      SELECT
        COALESCE(
          SUM(pa.allocated_amount),
          0
        ) AS allocated
      FROM payment_allocations pa
      INNER JOIN payments p
        ON p.id = pa.payment_id
      WHERE pa.${documentIdColumn} = $1
        AND p.payment_type = $2
    `,
    [docId, normalizedType],
  );

  const alreadyAllocated = Number(allocatedResult.rows[0]?.allocated || 0);

  let remainingInvoice = Math.max(invoiceTotal - alreadyAllocated, 0);

  if (remainingInvoice <= EPSILON) {
    await updateDocumentStatus(client, normalizedType, docId);

    return {
      allocated: 0,
      remaining_invoice: 0,
      remaining_advance: await getAvailableAdvance(client, normalizedType, id),
    };
  }

  const advanceResult = await client.query(
    `
      SELECT
        p.id,
        p.payment_no,
        p.amount,
        p.payment_date,

        (
          p.amount
          -
          COALESCE(
            (
              SELECT
                SUM(pa.allocated_amount)
              FROM payment_allocations pa
              WHERE pa.payment_id = p.id
            ),
            0
          )
        ) AS remaining_amount

      FROM payments p

      WHERE p.payment_type = $1
        AND p.payment_mode = 'ADVANCE'
        AND p.${partyIdColumn} = $2

      HAVING
        (
          p.amount
          -
          COALESCE(
            (
              SELECT
                SUM(pa2.allocated_amount)
              FROM payment_allocations pa2
              WHERE pa2.payment_id = p.id
            ),
            0
          )
        ) > $3

      ORDER BY
        p.payment_date ASC,
        p.id ASC
    `,
    [normalizedType, id, EPSILON],
  );

  let totalApplied = 0;

  for (const advance of advanceResult.rows) {
    if (remainingInvoice <= EPSILON) {
      break;
    }

    const remainingAdvance = Number(advance.remaining_amount || 0);

    if (remainingAdvance <= EPSILON) {
      continue;
    }

    const allocateAmount = Math.min(remainingAdvance, remainingInvoice);

    if (allocateAmount <= EPSILON) {
      continue;
    }

    if (normalizedType === "CUSTOMER") {
      await client.query(
        `
          INSERT INTO payment_allocations
          (
            payment_id,
            sale_id,
            purchase_id,
            allocated_amount
          )
          VALUES
          ($1, $2, NULL, $3)
        `,
        [Number(advance.id), docId, allocateAmount],
      );
    } else {
      await client.query(
        `
          INSERT INTO payment_allocations
          (
            payment_id,
            sale_id,
            purchase_id,
            allocated_amount
          )
          VALUES
          ($1, NULL, $2, $3)
        `,
        [Number(advance.id), docId, allocateAmount],
      );
    }

    totalApplied += allocateAmount;
    remainingInvoice -= allocateAmount;
  }

  await updateDocumentStatus(client, normalizedType, docId);

  const remainingAdvance = await getAvailableAdvance(
    client,
    normalizedType,
    id,
  );

  return {
    allocated: totalApplied,
    invoice_total: invoiceTotal,
    remaining_invoice: Math.max(remainingInvoice, 0),
    remaining_advance: remainingAdvance,
  };
};

/* =========================================================
   GET OPTIONS
   ========================================================= */

const getOptions = async () => {
  const [customersResult, suppliersResult] = await Promise.all([
    pool.query(`
      SELECT
        id,
        name,
        mobile
      FROM customers
      WHERE is_active = TRUE
      ORDER BY name, id
    `),

    pool.query(`
      SELECT
        id,
        name,
        mobile
      FROM suppliers
      WHERE is_active = TRUE
      ORDER BY name, id
    `),
  ]);

  const customers = [];
  const suppliers = [];

  for (const customer of customersResult.rows) {
    const client = await pool.connect();

    try {
      const totalDue = await getPartyDue(
        client,
        "CUSTOMER",
        Number(customer.id),
      );

      const availableAdvance = await getAvailableAdvance(
        client,
        "CUSTOMER",
        Number(customer.id),
      );

      customers.push({
        ...customer,
        id: Number(customer.id),

        total_due: Number(totalDue?.total_due || 0),

        available_advance: Number(
          totalDue?.available_advance ?? availableAdvance ?? 0,
        ),
      });
    } finally {
      client.release();
    }
  }

  for (const supplier of suppliersResult.rows) {
    const client = await pool.connect();

    try {
      const totalDue = await getPartyDue(
        client,
        "SUPPLIER",
        Number(supplier.id),
      );

      const availableAdvance = await getAvailableAdvance(
        client,
        "SUPPLIER",
        Number(supplier.id),
      );

      suppliers.push({
        ...supplier,
        id: Number(supplier.id),

        total_due: Number(totalDue?.total_due || 0),

        available_advance: Number(
          totalDue?.available_advance ?? availableAdvance ?? 0,
        ),
      });
    } finally {
      client.release();
    }
  }

  return {
    customers,
    suppliers,
    sales: [],
    purchases: [],
  };
};

/* =========================================================
   GET PAYMENT
   ========================================================= */

const getPaymentById = async (id, client = pool) => {
  const paymentId = assertId(id, "payment id");

  const { rows } = await client.query(
    `
      SELECT
        p.*,

        CASE
          WHEN p.payment_type = 'CUSTOMER'
            THEN c.name
          ELSE s.name
        END AS party_name,

        CASE
          WHEN p.payment_type = 'CUSTOMER'
            THEN c.mobile
          ELSE s.mobile
        END AS party_mobile,

        CASE
          WHEN p.payment_type = 'CUSTOMER'
            THEN sa.sale_no
          ELSE pu.purchase_no
        END AS legacy_document_no

      FROM payments p

      LEFT JOIN customers c
        ON c.id = p.customer_id

      LEFT JOIN suppliers s
        ON s.id = p.supplier_id

      LEFT JOIN sales sa
        ON sa.id = p.sale_id

      LEFT JOIN purchases pu
        ON pu.id = p.purchase_id

      WHERE p.id = $1
    `,
    [paymentId],
  );

  if (!rows.length) {
    return null;
  }

  const payment = rows[0];

  const allocations = await client.query(
    `
      SELECT
        pa.id,
        pa.payment_id,
        pa.sale_id,
        pa.purchase_id,
        pa.allocated_amount,

        COALESCE(
          sa.sale_no,
          pu.purchase_no
        ) AS document_no

      FROM payment_allocations pa

      LEFT JOIN sales sa
        ON sa.id = pa.sale_id

      LEFT JOIN purchases pu
        ON pu.id = pa.purchase_id

      WHERE pa.payment_id = $1

      ORDER BY pa.id
    `,
    [paymentId],
  );

  return {
    ...payment,
    id: Number(payment.id),
    customer_id: payment.customer_id ? Number(payment.customer_id) : null,
    supplier_id: payment.supplier_id ? Number(payment.supplier_id) : null,
    sale_id: payment.sale_id ? Number(payment.sale_id) : null,
    purchase_id: payment.purchase_id ? Number(payment.purchase_id) : null,
    amount: Number(payment.amount || 0),
    allocations: allocations.rows.map((allocation) => ({
      ...allocation,
      id: Number(allocation.id),
      payment_id: Number(allocation.payment_id),
      sale_id: allocation.sale_id ? Number(allocation.sale_id) : null,
      purchase_id: allocation.purchase_id
        ? Number(allocation.purchase_id)
        : null,
      allocated_amount: Number(allocation.allocated_amount || 0),
    })),

    document_no:
      allocations.rows
        .map((allocation) => allocation.document_no)
        .filter(Boolean)
        .join(", ") ||
      payment.legacy_document_no ||
      (payment.payment_mode === "ADVANCE" ? "Advance" : "Unallocated"),
  };
};

/* =========================================================
   VALIDATE PAYLOAD
   ========================================================= */

const validatePayload = (body) => {
  const type = String(body?.payment_type || "").toUpperCase();

  if (!["CUSTOMER", "SUPPLIER"].includes(type)) {
    const error = new Error("Payment type must be CUSTOMER or SUPPLIER.");
    error.statusCode = 400;
    throw error;
  }

  const paymentMode = normalizePaymentMode(body?.payment_mode);
  const amount = toNumber(body?.amount, NaN);

  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error("Payment amount must be greater than zero.");
    error.statusCode = 400;
    throw error;
  }

  const method = normalizeMethod(body?.payment_method);

  if (!allowedMethods.includes(method)) {
    const error = new Error("Invalid payment method.");
    error.statusCode = 400;
    throw error;
  }

  const paymentDate = String(body?.payment_date || "").trim();

  if (!paymentDate) {
    const error = new Error("Payment date is required.");
    error.statusCode = 400;
    throw error;
  }

  const partyId = assertId(
    type === "CUSTOMER" ? body?.customer_id : body?.supplier_id,
    type === "CUSTOMER" ? "customer" : "supplier",
  );

  return {
    type,
    paymentMode,
    amount,
    method,
    paymentDate,
    partyId,
    referenceNo: String(body?.reference_no || "").trim() || null,
    remarks: String(body?.remarks || "").trim() || null,
  };
};

/* =========================================================
   GET UNPAID INVOICES
   FIFO = OLDEST FIRST
   ========================================================= */

const getOutstandingInvoices = async (
  client,
  type,
  partyId,
  excludePaymentId = null,
) => {
  const {
    documentTable,
    partyIdColumn,
    documentIdColumn,
    documentNoColumn,
    dateColumn,
  } = getPartyColumns(type);

  const paymentType = type;

  const params = [partyId, paymentType];

  let excludeSql = "";

  if (excludePaymentId) {
    params.push(excludePaymentId);

    excludeSql = `
      AND p.id <> $3
    `;
  }

  const result = await client.query(
    `
      SELECT
        d.id,
        d.${documentNoColumn} AS document_no,
        d.${partyIdColumn} AS party_id,
        d.${dateColumn} AS document_date,
        d.total_amount,

        (
          COALESCE(
            (
              SELECT SUM(pa.allocated_amount)
              FROM payment_allocations pa
              WHERE pa.${documentIdColumn} = d.id
            ),
            0
          )

          +

          COALESCE(
            (
              SELECT SUM(p.amount)
              FROM payments p
              WHERE p.${documentIdColumn} = d.id
                AND p.payment_type = $2
                ${excludeSql}
            ),
            0
          )
        ) AS paid_amount

      FROM ${documentTable} d

      WHERE d.${partyIdColumn} = $1

      ORDER BY
        d.${dateColumn} ASC,
        d.id ASC
      FOR UPDATE
    `,
    params,
  );

  return result.rows
    .map((row) => {
      const total = Number(row.total_amount || 0);

      const paid = Number(row.paid_amount || 0);

      const outstanding = Math.max(total - paid, 0);

      return {
        id: Number(row.id),
        document_no: row.document_no,
        party_id: Number(row.party_id),
        document_date: row.document_date,
        total_amount: total,
        paid_amount: paid,
        outstanding,
      };
    })
    .filter((invoice) => invoice.outstanding > EPSILON);
};

/* =========================================================
   ALLOCATE PAYMENT FIFO
   ========================================================= */

const allocatePaymentToDueInvoices = async (
  client,
  paymentId,
  type,
  partyId,
  paymentAmount,
  excludePaymentId = null,
) => {
  const invoices = await getOutstandingInvoices(
    client,
    type,
    partyId,
    excludePaymentId,
  );

  const totalDue = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.outstanding || 0),
    0,
  );

  if (paymentAmount > totalDue + EPSILON) {
    const error = new Error(
      `Payment cannot exceed total outstanding due of ₹${totalDue.toFixed(2)}.`,
    );
    error.statusCode = 400;
    throw error;
  }

  let remaining = Number(paymentAmount || 0);

  const allocations = [];

  const touchedInvoices = new Set();

  for (const invoice of invoices) {
    if (remaining <= EPSILON) {
      break;
    }

    const allocateAmount = Math.min(
      remaining,
      Number(invoice.outstanding || 0),
    );

    if (allocateAmount <= EPSILON) {
      continue;
    }

    if (type === "CUSTOMER") {
      await client.query(
        `
          INSERT INTO payment_allocations
          (
            payment_id,
            sale_id,
            purchase_id,
            allocated_amount
          )
          VALUES
          ($1, $2, NULL, $3)
        `,
        [paymentId, invoice.id, allocateAmount],
      );
    } else {
      await client.query(
        `
          INSERT INTO payment_allocations
          (
            payment_id,
            sale_id,
            purchase_id,
            allocated_amount
          )
          VALUES
          ($1, NULL, $2, $3)
        `,
        [paymentId, invoice.id, allocateAmount],
      );
    }

    allocations.push({
      invoice_id: invoice.id,
      document_no: invoice.document_no,
      allocated_amount: allocateAmount,
    });
    touchedInvoices.add(Number(invoice.id));

    remaining -= allocateAmount;
  }

  if (remaining > EPSILON) {
    const error = new Error(
      `Payment exceeds outstanding amount by ₹${remaining.toFixed(2)}.`,
    );

    error.statusCode = 400;

    throw error;
  }
  for (const invoiceId of touchedInvoices) {
    await updateDocumentStatus(client, type, invoiceId);
  }

  return {
    allocations,
    total_due: totalDue,
    allocated: Number(paymentAmount) - remaining,
    remaining: Math.max(remaining, 0),
  };
};

/* =========================================================
   UPDATE INVOICE PAYMENT STATUS
   ========================================================= */

const updateDocumentStatus = async (client, type, documentId) => {
  const { documentTable, documentIdColumn } = getPartyColumns(type);

  const documentResult = await client.query(
    `
        SELECT
          total_amount
        FROM ${documentTable}
        WHERE id = $1
        FOR UPDATE
      `,
    [documentId],
  );

  if (!documentResult.rows.length) {
    return;
  }

  const total = Number(documentResult.rows[0].total_amount || 0);
  const allocationResult = await client.query(
    `
        SELECT
          COALESCE(
            SUM(pa.allocated_amount),
            0
          ) AS allocated
        FROM payment_allocations pa
        INNER JOIN payments p
          ON p.id = pa.payment_id
        WHERE pa.${documentIdColumn} = $1
          AND p.payment_type = $2
      `,
    [documentId, type],
  );
  const legacyResult = await client.query(
    `
        SELECT
          COALESCE(
            SUM(amount),
            0
          ) AS paid
        FROM payments
        WHERE ${documentIdColumn} = $1
          AND payment_type = $2
      `,
    [documentId, type],
  );

  const allocated = Number(allocationResult.rows[0]?.allocated || 0);
  const legacyPaid = Number(legacyResult.rows[0]?.paid || 0);
  const paid = Math.min(total, allocated + legacyPaid);

  const status =
    paid <= EPSILON ? "PENDING" : paid + EPSILON >= total ? "PAID" : "PARTIAL";

  await client.query(
    `
      UPDATE ${documentTable}
      SET
        payment_status = $1,
        updated_at = NOW()
      WHERE id = $2
    `,
    [status, documentId],
  );
};

/* =========================================================
   UPDATE ALL AFFECTED DOCUMENT STATUSES
   ========================================================= */

// const updateStatusesForPayment = async (client, paymentId) => {
//   const allocations = await client.query(
//     `
//       SELECT
//         p.payment_type,
//         pa.sale_id,
//         pa.purchase_id
//       FROM payment_allocations pa

//       INNER JOIN payments p
//         ON p.id = pa.payment_id

//       WHERE pa.payment_id = $1
//     `,
//     [paymentId],
//   );

//   const documents = new Map();

//   for (const row of allocations.rows) {
//     if (row.payment_type === "CUSTOMER" && row.sale_id) {
//       documents.set(`CUSTOMER-SALE-${row.sale_id}`, {
//         type: "CUSTOMER",
//         id: Number(row.sale_id),
//       });
//     }

//     if (row.payment_type === "SUPPLIER" && row.purchase_id) {
//       documents.set(`SUPPLIER-PURCHASE-${row.purchase_id}`, {
//         type: "SUPPLIER",
//         id: Number(row.purchase_id),
//       });
//     }
//   }

//   for (const document of documents.values()) {
//     await updateDocumentStatus(client, document.type, document.id);
//   }
// };

/* =========================================================
   GENERATE PAYMENT NUMBER
   ========================================================= */

const generatePaymentNo = async (client) => {
  const result = await client.query(`
    SELECT
      COALESCE(
        MAX(
          CASE
            WHEN payment_no ~ '^PAY-[0-9]+$'
            THEN CAST(
              SUBSTRING(
                payment_no
                FROM 5
              ) AS BIGINT
            )
            ELSE 0
          END
        ),
        0
      ) AS last_no
    FROM payments
  `);

  const lastNo = Number(result.rows[0]?.last_no || 0);

  return `PAY-${String(lastNo + 1).padStart(5, "0")}`;
};

/* =========================================================
   CREATE PAYMENT
   ========================================================= */

const createPayment = async (body, { userId = null, ipAddress }) => {
  const data = validatePayload(body);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const partyTable = data.type === "CUSTOMER" ? "customers" : "suppliers";

    const partyResult = await client.query(
      `
          SELECT id
          FROM ${partyTable}
          WHERE id = $1
          FOR UPDATE
        `,
      [data.partyId],
    );

    if (!partyResult.rows.length) {
      const error = new Error(
        `${data.type === "CUSTOMER" ? "Customer" : "Supplier"} not found.`,
      );

      error.statusCode = 404;
      throw error;
    }

    let totalDue = 0;

    if (data.paymentMode !== "ADVANCE") {
      const partyDue = await getPartyDue(client, data.type, data.partyId);

      totalDue = Number(partyDue?.total_due || 0);

      if (data.amount > totalDue + EPSILON) {
        const paymentError = new Error(
          `Payment cannot exceed total outstanding due of ₹${totalDue.toFixed(
            2,
          )}.`,
        );

        paymentError.statusCode = 400;
        throw paymentError;
      }
    }

    const paymentNo = await generatePaymentNo(client);

    const paymentResult = await client.query(
      `
          INSERT INTO payments
          (
            payment_no,
            payment_type,
            payment_mode,
            customer_id,
            supplier_id,
            sale_id,
            purchase_id,
            payment_date,
            amount,
            payment_method,
            reference_no,
            remarks,
            created_by
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            NULL,
            NULL,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11
          )

          RETURNING id
        `,
      [
        paymentNo,
        data.type,
        data.paymentMode,
        data.type === "CUSTOMER" ? data.partyId : null,
        data.type === "SUPPLIER" ? data.partyId : null,
        data.paymentDate,
        data.amount,
        data.method,
        data.referenceNo,
        data.remarks,
        userId || null,
      ],
    );

    const paymentId = Number(paymentResult.rows[0].id);

    if (data.paymentMode === "INVOICE") {
      await allocatePaymentToDueInvoices(
        client,
        paymentId,
        data.type,
        data.partyId,
        data.amount,
      );
    }

    await client.query("COMMIT");

    const newPayment = await getPaymentById(paymentId);

    await createAuditLog({
      userId: userId || null,
      module: "PAYMENTS",
      action: "CREATE",
      recordId: paymentId,
      oldData: null,
      newData: newPayment,
      ipAddress: ipAddress || null,
    });

    const notificationTitle =
      data.type === "CUSTOMER"
        ? "Customer Payment Received"
        : "Supplier Payment Made";

    await createNotification({
      title: notificationTitle,
      message: `${newPayment.party_name} - ₹${Number(
        newPayment.amount || 0,
      ).toLocaleString("en-IN")}. <br>Payment: ${newPayment.payment_no}`,
      type: data.type === "CUSTOMER" ? "payment_received" : "payment_made",
      referenceType: "payment",
      referenceId: Number(paymentId),
      createdBy: userId || null,
    });

    sendPushNotification({
      title: notificationTitle,
      body: `${newPayment.party_name} - ₹${Number(
        newPayment.amount || 0,
      ).toLocaleString("en-IN")}. Payment: ${newPayment.payment_no}`,
      icon: "/images/payment.png",
      badge: "/images/icon-192.png",
      url: "/payments",
    }).catch((error) => {
      console.error("Payment create push notification error:", error);
    });

    return newPayment;
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

/* =========================================================
   UPDATE PAYMENT
   ========================================================= */

const updatePayment = async (id, body, { userId = null, ipAddress }) => {
  const paymentId = assertId(id, "payment id");
  const data = validatePayload(body);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const oldResult = await client.query(
      `
          SELECT *
          FROM payments
          WHERE id = $1
          FOR UPDATE
        `,
      [paymentId],
    );

    if (!oldResult.rows.length) {
      const error = new Error("Payment not found.");

      error.statusCode = 404;
      throw error;
    }

    const previous = oldResult.rows[0];

    const oldAllocationsResult = await client.query(
      `
          SELECT
            sale_id,
            purchase_id,
            allocated_amount
          FROM payment_allocations
          WHERE payment_id = $1
        `,
      [paymentId],
    );

    const oldDocuments = [];

    for (const allocation of oldAllocationsResult.rows) {
      if (allocation.sale_id) {
        oldDocuments.push({
          type: "CUSTOMER",
          id: Number(allocation.sale_id),
        });
      }

      if (allocation.purchase_id) {
        oldDocuments.push({
          type: "SUPPLIER",
          id: Number(allocation.purchase_id),
        });
      }
    }

    if (previous.payment_type === "CUSTOMER" && previous.sale_id) {
      oldDocuments.push({
        type: "CUSTOMER",
        id: Number(previous.sale_id),
      });
    }

    if (previous.payment_type === "SUPPLIER" && previous.purchase_id) {
      oldDocuments.push({
        type: "SUPPLIER",
        id: Number(previous.purchase_id),
      });
    }

    await client.query(
      `
        DELETE FROM payment_allocations
        WHERE payment_id = $1
      `,
      [paymentId],
    );

    await client.query(
      `
        UPDATE payments

        SET
          payment_type = $1,
          payment_mode = $2,

          customer_id = $3,
          supplier_id = $4,

          sale_id = NULL,
          purchase_id = NULL,

          payment_date = $5,
          amount = $6,
          payment_method = $7,
          reference_no = $8,
          remarks = $9

        WHERE id = $10
      `,
      [
        data.type,
        data.paymentMode,
        data.type === "CUSTOMER" ? data.partyId : null,
        data.type === "SUPPLIER" ? data.partyId : null,
        data.paymentDate,
        data.amount,
        data.method,
        data.referenceNo,
        data.remarks,
        paymentId,
      ],
    );

    if (data.paymentMode === "INVOICE") {
      await allocatePaymentToDueInvoices(
        client,
        paymentId,
        data.type,
        data.partyId,
        data.amount,
        paymentId,
      );
    }

    const uniqueOldDocuments = new Map();

    for (const document of oldDocuments) {
      uniqueOldDocuments.set(`${document.type}-${document.id}`, document);
    }

    for (const document of uniqueOldDocuments.values()) {
      await updateDocumentStatus(client, document.type, document.id);
    }

    const newAllocationsResult = await client.query(
      `
          SELECT
            sale_id,
            purchase_id
          FROM payment_allocations
          WHERE payment_id = $1
        `,
      [paymentId],
    );

    const newDocuments = new Map();

    for (const allocation of newAllocationsResult.rows) {
      if (allocation.sale_id) {
        newDocuments.set(`CUSTOMER-${allocation.sale_id}`, {
          type: "CUSTOMER",
          id: Number(allocation.sale_id),
        });
      }

      if (allocation.purchase_id) {
        newDocuments.set(`SUPPLIER-${allocation.purchase_id}`, {
          type: "SUPPLIER",
          id: Number(allocation.purchase_id),
        });
      }
    }

    for (const document of newDocuments.values()) {
      await updateDocumentStatus(client, document.type, document.id);
    }

    await client.query("COMMIT");

    const newPayment = await getPaymentById(paymentId);

    await createAuditLog({
      userId: userId || null,
      module: "PAYMENTS",
      action: "UPDATE",
      recordId: paymentId,
      oldData: previous,
      newData: newPayment,
      ipAddress: ipAddress || null,
    });


    const notificationTitle =
      data.type === "CUSTOMER"
        ? "Customer Payment Updated"
        : "Supplier Payment Updated";

    await createNotification({
      title: notificationTitle,

      message: `${newPayment.party_name} - ₹${Number(
        newPayment.amount || 0,
      ).toLocaleString("en-IN")}. <br>Payment: ${newPayment.payment_no}`,

      type:
        data.type === "CUSTOMER"
          ? "payment_received_updated"
          : "payment_made_updated",

      referenceType: "payment",

      referenceId: Number(paymentId),

      createdBy: userId || null,
    });


    sendPushNotification({
      title: notificationTitle,

      body: `${newPayment.party_name} - ₹${Number(
        newPayment.amount || 0,
      ).toLocaleString("en-IN")}. Payment: ${newPayment.payment_no}`,

      icon: "/images/payment.png",

      badge: "/images/icon-192.png",

      url: "/payments",
    }).catch((error) => {
      console.error("Payment update push notification error:", error);
    });

    return newPayment;
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

/* =========================================================
   DELETE PAYMENT
   ========================================================= */

const deletePayment = async (id, { userId = null, ipAddress }) => {
  const paymentId = assertId(id, "payment id");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Lock payment
     */
    const paymentResult = await client.query(
      `
          SELECT *
          FROM payments
          WHERE id = $1
          FOR UPDATE
        `,
      [paymentId],
    );

    if (!paymentResult.rows.length) {
      const error = new Error("Payment not found.");

      error.statusCode = 404;
      throw error;
    }

    const payment = paymentResult.rows[0];

    const allocationResult = await client.query(
      `
          SELECT
            sale_id,
            purchase_id
          FROM payment_allocations
          WHERE payment_id = $1
        `,
      [paymentId],
    );

    const affectedDocuments = new Map();

    for (const allocation of allocationResult.rows) {
      if (allocation.sale_id) {
        affectedDocuments.set(`CUSTOMER-${allocation.sale_id}`, {
          type: "CUSTOMER",
          id: Number(allocation.sale_id),
        });
      }

      if (allocation.purchase_id) {
        affectedDocuments.set(`SUPPLIER-${allocation.purchase_id}`, {
          type: "SUPPLIER",
          id: Number(allocation.purchase_id),
        });
      }
    }

    if (payment.payment_type === "CUSTOMER" && payment.sale_id) {
      affectedDocuments.set(`CUSTOMER-${payment.sale_id}`, {
        type: "CUSTOMER",
        id: Number(payment.sale_id),
      });
    }

    if (payment.payment_type === "SUPPLIER" && payment.purchase_id) {
      affectedDocuments.set(`SUPPLIER-${payment.purchase_id}`, {
        type: "SUPPLIER",
        id: Number(payment.purchase_id),
      });
    }

    const oldPayment = await getPaymentById(paymentId, client);

    await client.query(
      `
        DELETE FROM payments
        WHERE id = $1
      `,
      [paymentId],
    );

    /*
     * Recalculate invoices.
     */
    for (const document of affectedDocuments.values()) {
      await updateDocumentStatus(client, document.type, document.id);
    }

    await client.query("COMMIT");


    await createAuditLog({
      userId: userId || null,
      module: "PAYMENTS",
      action: "DELETE",
      recordId: paymentId,
      oldData: oldPayment,
      newData: null,
      ipAddress: ipAddress || null,
    });

    const notificationTitle =
      payment.payment_type === "CUSTOMER"
        ? "Customer Payment Deleted"
        : "Supplier Payment Deleted";

    await createNotification({
      title: notificationTitle,

      message: `${oldPayment?.party_name || ""} - ₹${Number(
        oldPayment?.amount || 0,
      ).toLocaleString("en-IN")}. <br>Payment: ${payment.payment_no} deleted.`,

      type:
        payment.payment_type === "CUSTOMER"
          ? "payment_received_deleted"
          : "payment_made_deleted",

      referenceType: "payment",

      referenceId: Number(paymentId),

      createdBy: userId || null,
    });

    sendPushNotification({
      title: notificationTitle,

      body: `${oldPayment?.party_name || ""} - ₹${Number(
        oldPayment?.amount || 0,
      ).toLocaleString("en-IN")}. Payment: ${payment.payment_no} deleted.`,

      icon: "/images/payment.png",

      badge: "/images/icon-192.png",

      url: "/payments",
    }).catch((error) => {
      console.error("Payment delete push notification error:", error);
    });

    return {
      id: paymentId,
      payment_no: payment.payment_no,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  listPayments,
  getOptions,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  applyAvailableAdvance,
};
