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

  if (mode === "ADVANCE") return "ADVANCE";
  if (mode === "QUICK") return "QUICK";
  return "INVOICE";
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
      p.expense_category_id,
      p.paid_to,
      p.expense_bill_id,
      p.payment_date,
      p.amount,
      p.payment_method,
      p.reference_no,
      p.remarks,

      CASE
        WHEN p.payment_type = 'CUSTOMER'
          THEN c.name
        WHEN p.payment_type = 'SUPPLIER'
          THEN s.name
        ELSE p.paid_to
      END AS party_name,

      CASE
        WHEN p.payment_type = 'CUSTOMER'
          THEN c.mobile
        WHEN p.payment_type = 'SUPPLIER'
          THEN s.mobile
        ELSE NULL
      END AS party_mobile,

      ec.name AS expense_category_name,
      eb.expense_no,

      CASE
        WHEN p.payment_type = 'CUSTOMER'
          THEN sa.sale_no
        WHEN p.payment_type = 'SUPPLIER'
          THEN pu.purchase_no
        WHEN p.payment_type = 'EXPENSE'
          THEN eb.expense_no
        ELSE NULL
      END AS direct_document_no

    FROM payments p

    LEFT JOIN customers c
      ON c.id = p.customer_id

    LEFT JOIN suppliers s
      ON s.id = p.supplier_id

    LEFT JOIN sales sa
      ON sa.id = p.sale_id

    LEFT JOIN purchases pu
      ON pu.id = p.purchase_id

    LEFT JOIN expense_categories ec
      ON ec.id = p.expense_category_id

    LEFT JOIN expense_bills eb
      ON eb.id = p.expense_bill_id

    ORDER BY
      p.payment_date DESC,
      p.id DESC
  `);

  /* =========================================================
     GET ALLOCATED CUSTOMER / SUPPLIER INVOICES
     ========================================================= */

  const paymentIds = rows.map((row) => Number(row.id));

  let allocationMap = {};

  if (paymentIds.length) {
    // ---------------------------------------------------------
    // CUSTOMER / SUPPLIER ALLOCATIONS
    // ---------------------------------------------------------
    const partyAllocations = await pool.query(
      `
      SELECT
        pa.payment_id,

        COALESCE(
          sa.sale_no,
          pu.purchase_no
        ) AS document_no

      FROM payment_allocations pa

      LEFT JOIN sales sa
        ON sa.id = pa.sale_id

      LEFT JOIN purchases pu
        ON pu.id = pa.purchase_id

      WHERE pa.payment_id = ANY($1::bigint[])

      ORDER BY
        pa.payment_id,
        pa.id
    `,
      [paymentIds],
    );

    // ---------------------------------------------------------
    // EXPENSE BILL ALLOCATIONS
    // ---------------------------------------------------------
    const expenseAllocations = await pool.query(
      `
      SELECT
        epa.payment_id,
        eb.expense_no AS document_no

      FROM expense_payment_allocations epa

      INNER JOIN expense_bills eb
        ON eb.id = epa.expense_bill_id

      WHERE epa.payment_id = ANY($1::bigint[])

      ORDER BY
        epa.payment_id,
        epa.id
    `,
      [paymentIds],
    );

    // ---------------------------------------------------------
    // MERGE BOTH ALLOCATION TYPES
    // ---------------------------------------------------------
    allocationMap = {};

    const allAllocationRows = [
      ...partyAllocations.rows,
      ...expenseAllocations.rows,
    ];

    allAllocationRows.forEach((row) => {
      const paymentId = Number(row.payment_id);

      if (!allocationMap[paymentId]) {
        allocationMap[paymentId] = [];
      }

      if (row.document_no) {
        allocationMap[paymentId].push(row.document_no);
      }
    });
  }

  /* =========================================================
     FORMAT PAYMENT LIST
     ========================================================= */

  return rows.map((row) => {
    const id = Number(row.id);

    /*
     * New payment flow:
     * Invoice numbers are stored in payment_allocations.
     */
    const allocatedDocuments = [...(allocationMap[id] || [])];

    /*
     * Remove duplicate invoice numbers if any.
     */
    const uniqueAllocatedDocuments = [...new Set(allocatedDocuments)];

    /*
     * If advance payment has no allocation,
     * show Advance.
     */
    if (
      row.payment_mode === "ADVANCE" &&
      uniqueAllocatedDocuments.length === 0
    ) {
      uniqueAllocatedDocuments.push("Advance");
    }

    /*
     * Expense payment:
     * expense bill number comes from expense_bills.
     */
    if (
      uniqueAllocatedDocuments.length === 0 &&
      row.payment_type === "EXPENSE" &&
      row.expense_no
    ) {
      uniqueAllocatedDocuments.push(row.expense_no);
    }

    /*
     * Legacy payment:
     * old payments may have sale_id / purchase_id
     * directly stored in payments table.
     */

    if (
      uniqueAllocatedDocuments.length === 0 &&
      row.payment_mode !== "ADVANCE" &&
      row.direct_document_no
    ) {
      uniqueAllocatedDocuments.push(row.direct_document_no);
    }
    /*
     * If nothing is allocated.
     */
    if (uniqueAllocatedDocuments.length === 0) {
      if (row.payment_type === "EXPENSE" && row.payment_mode === "QUICK") {
        uniqueAllocatedDocuments.push("Quick Expense");
      } else {
        uniqueAllocatedDocuments.push("Unallocated");
      }
    }

    return {
      ...row,

      id,

      customer_id: row.customer_id ? Number(row.customer_id) : null,

      supplier_id: row.supplier_id ? Number(row.supplier_id) : null,

      sale_id: row.sale_id ? Number(row.sale_id) : null,

      purchase_id: row.purchase_id ? Number(row.purchase_id) : null,

      expense_category_id: row.expense_category_id
        ? Number(row.expense_category_id)
        : null,

      expense_bill_id: row.expense_bill_id ? Number(row.expense_bill_id) : null,

      amount: Number(row.amount || 0),

      /*
       * This is what Payments UI uses
       * to display invoice number(s).
       */
      document_no: uniqueAllocatedDocuments.join(", "),
    };
  });
};
/* =========================================================
   CALCULATE PARTY DUE
   ========================================================= */

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

     AND
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
  const [customersResult, suppliersResult, categoriesResult, billsResult] =
    await Promise.all([
      pool.query(
        `SELECT id, name, mobile FROM customers WHERE is_active = TRUE ORDER BY name, id`,
      ),
      pool.query(
        `SELECT id, name, mobile FROM suppliers WHERE is_active = TRUE ORDER BY name, id`,
      ),
      pool.query(`
  SELECT
    ec.id,
    ec.name,

    /* Total outstanding expense bills */
    COALESCE((
      SELECT SUM(
        GREATEST(
          eb.total_amount
          -
          COALESCE((
            SELECT SUM(epa.allocated_amount)
            FROM expense_payment_allocations epa
            WHERE epa.expense_bill_id = eb.id
          ), 0),
          0
        )
      )
      FROM expense_bills eb
      WHERE eb.category_id = ec.id
    ), 0) AS total_due,

    /* Available expense advances */
    COALESCE((
      SELECT SUM(p.amount)
      FROM payments p
      WHERE p.payment_type = 'EXPENSE'
        AND p.payment_mode = 'ADVANCE'
        AND p.expense_category_id = ec.id
    ), 0)
    -
    COALESCE((
      SELECT SUM(epa.allocated_amount)
      FROM expense_payment_allocations epa
      INNER JOIN payments ap
        ON ap.id = epa.payment_id
      WHERE ap.payment_type = 'EXPENSE'
        AND ap.payment_mode = 'ADVANCE'
        AND ap.expense_category_id = ec.id
    ), 0) AS available_advance

  FROM expense_categories ec
  WHERE ec.is_active = TRUE
  ORDER BY ec.name, ec.id
`),
      pool.query(`
      SELECT
        eb.id,
        eb.expense_no,
        eb.category_id,
        ec.name AS category_name,
        eb.vendor_name,
        eb.bill_number,
        eb.bill_date,
        eb.total_amount,
        eb.payment_status,
        COALESCE((
          SELECT SUM(epa.allocated_amount)
          FROM expense_payment_allocations epa
        ), 0) AS dummy_paid,
        COALESCE((
          SELECT SUM(epa.allocated_amount)
          FROM expense_payment_allocations epa
          WHERE epa.expense_bill_id = eb.id
        ), 0) AS paid_amount
      FROM expense_bills eb
      INNER JOIN expense_categories ec ON ec.id = eb.category_id
      ORDER BY eb.bill_date ASC, eb.id ASC
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

  const expenseBills = billsResult.rows
    .map((bill) => {
      const total = Number(bill.total_amount || 0);
      const paid = Number(bill.paid_amount || 0);
      return {
        ...bill,
        id: Number(bill.id),
        category_id: Number(bill.category_id),
        total_amount: total,
        paid_amount: paid,
        due_amount: Math.max(total - paid, 0),
      };
    })
    .filter((bill) => bill.due_amount > EPSILON);

  return {
    customers,
    suppliers,
    expense_categories: categoriesResult.rows.map((x) => ({
        id: Number(x.id),
        name: x.name,
        total_due: Number(x.total_due || 0),
        available_advance: Math.max(
          Number(x.available_advance || 0),
          0,
        ),
      })),
    expense_bills: expenseBills,
    sales: [],
    purchases: [],
  };
};

/* =========================================================
   GET PAYMENT
   ========================================================= */

// const getPaymentById = async (id, client = pool) => {
//   const paymentId = assertId(id, "payment id");

//   const { rows } = await client.query(`
//     SELECT
//       p.*,
//       CASE
//         WHEN p.payment_type = 'CUSTOMER' THEN c.name
//         WHEN p.payment_type = 'SUPPLIER' THEN s.name
//         ELSE p.paid_to
//       END AS party_name,
//       CASE
//         WHEN p.payment_type = 'CUSTOMER' THEN c.mobile
//         WHEN p.payment_type = 'SUPPLIER' THEN s.mobile
//         ELSE NULL
//       END AS party_mobile,
//       CASE
//         WHEN p.payment_type = 'CUSTOMER' THEN sa.sale_no
//         WHEN p.payment_type = 'SUPPLIER' THEN pu.purchase_no
//         WHEN p.payment_type = 'EXPENSE' THEN eb.expense_no
//       END AS legacy_document_no,
//       ec.name AS expense_category_name
//     FROM payments p
//     LEFT JOIN customers c ON c.id = p.customer_id
//     LEFT JOIN suppliers s ON s.id = p.supplier_id
//     LEFT JOIN sales sa ON sa.id = p.sale_id
//     LEFT JOIN purchases pu ON pu.id = p.purchase_id
//     LEFT JOIN expense_categories ec ON ec.id = p.expense_category_id
//     LEFT JOIN expense_bills eb ON eb.id = p.expense_bill_id
//     WHERE p.id = $1
//   `, [paymentId]);

//   if (!rows.length) return null;

//   const payment = rows[0];

//   const allocations = await client.query(`
//     SELECT
//       epa.id,
//       epa.payment_id,
//       epa.expense_bill_id,
//       epa.allocated_amount,
//       eb.expense_no AS document_no
//     FROM expense_payment_allocations epa
//     INNER JOIN expense_bills eb ON eb.id = epa.expense_bill_id
//     WHERE epa.payment_id = $1
//     ORDER BY epa.id
//   `, [paymentId]);

//   const partyAllocations = await client.query(`
//     SELECT
//       pa.id,
//       pa.payment_id,
//       pa.sale_id,
//       pa.purchase_id,
//       pa.allocated_amount,
//       COALESCE(sa.sale_no, pu.purchase_no) AS document_no
//     FROM payment_allocations pa
//     LEFT JOIN sales sa ON sa.id = pa.sale_id
//     LEFT JOIN purchases pu ON pu.id = pa.purchase_id
//     WHERE pa.payment_id = $1
//     ORDER BY pa.id
//   `, [paymentId]);

//   const allAllocations = [
//     ...partyAllocations.rows.map((a) => ({
//       ...a,
//       id: Number(a.id),
//       payment_id: Number(a.payment_id),
//       sale_id: a.sale_id ? Number(a.sale_id) : null,
//       purchase_id: a.purchase_id ? Number(a.purchase_id) : null,
//       allocated_amount: Number(a.allocated_amount || 0),
//     })),
//     ...allocations.rows.map((a) => ({
//       ...a,
//       id: Number(a.id),
//       payment_id: Number(a.payment_id),
//       expense_bill_id: Number(a.expense_bill_id),
//       allocated_amount: Number(a.allocated_amount || 0),
//     })),
//   ];

//   return {
//     ...payment,
//     id: Number(payment.id),
//     customer_id: payment.customer_id ? Number(payment.customer_id) : null,
//     supplier_id: payment.supplier_id ? Number(payment.supplier_id) : null,
//     sale_id: payment.sale_id ? Number(payment.sale_id) : null,
//     purchase_id: payment.purchase_id ? Number(payment.purchase_id) : null,
//     expense_category_id: payment.expense_category_id ? Number(payment.expense_category_id) : null,
//     expense_bill_id: payment.expense_bill_id ? Number(payment.expense_bill_id) : null,
//     amount: Number(payment.amount || 0),
//     allocations: allAllocations,
//     document_no:
//       allAllocations.map((a) => a.document_no).filter(Boolean).join(", ") ||
//       payment.legacy_document_no ||
//       (payment.payment_mode === "ADVANCE" ? "Advance" :
//        payment.payment_mode === "QUICK" ? "Quick Expense" : "Unallocated"),
//   };
// };

const getPaymentById = async (id, client = pool) => {
  const paymentId = assertId(id, "payment id");

  const { rows } = await client.query(
    `
      SELECT
        p.*,

        CASE
          WHEN p.payment_type = 'CUSTOMER' THEN c.name
          WHEN p.payment_type = 'SUPPLIER' THEN s.name
          ELSE p.paid_to
        END AS party_name,

        CASE
          WHEN p.payment_type = 'CUSTOMER' THEN c.mobile
          WHEN p.payment_type = 'SUPPLIER' THEN s.mobile
          ELSE NULL
        END AS party_mobile,

        CASE
          WHEN p.payment_type = 'CUSTOMER' THEN sa.sale_no
          WHEN p.payment_type = 'SUPPLIER' THEN pu.purchase_no
          WHEN p.payment_type = 'EXPENSE' THEN eb.expense_no
        END AS legacy_document_no,

        ec.name AS expense_category_name

      FROM payments p

      LEFT JOIN customers c
        ON c.id = p.customer_id

      LEFT JOIN suppliers s
        ON s.id = p.supplier_id

      LEFT JOIN sales sa
        ON sa.id = p.sale_id

      LEFT JOIN purchases pu
        ON pu.id = p.purchase_id

      LEFT JOIN expense_categories ec
        ON ec.id = p.expense_category_id

      LEFT JOIN expense_bills eb
        ON eb.id = p.expense_bill_id

      WHERE p.id = $1
    `,
    [paymentId],
  );

  if (!rows.length) return null;

  const payment = rows[0];

  // ---------------------------------------------------------
  // EXPENSE PAYMENT ALLOCATIONS
  // ---------------------------------------------------------
  const allocations = await client.query(
    `
      SELECT
        epa.id,
        epa.payment_id,
        epa.expense_bill_id,
        epa.allocated_amount,
        eb.expense_no AS document_no

      FROM expense_payment_allocations epa

      INNER JOIN expense_bills eb
        ON eb.id = epa.expense_bill_id

      WHERE epa.payment_id = $1

      ORDER BY epa.id
    `,
    [paymentId],
  );

  // ---------------------------------------------------------
  // CUSTOMER / SUPPLIER PAYMENT ALLOCATIONS
  // ---------------------------------------------------------
  const partyAllocations = await client.query(
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

  // ---------------------------------------------------------
  // NORMALIZE ALLOCATIONS
  // ---------------------------------------------------------
  const allAllocations = [
    ...partyAllocations.rows.map((a) => ({
      ...a,

      id: Number(a.id),
      payment_id: Number(a.payment_id),

      sale_id: a.sale_id ? Number(a.sale_id) : null,

      purchase_id: a.purchase_id ? Number(a.purchase_id) : null,

      allocated_amount: Number(a.allocated_amount || 0),
    })),

    ...allocations.rows.map((a) => ({
      ...a,

      id: Number(a.id),
      payment_id: Number(a.payment_id),

      expense_bill_id: Number(a.expense_bill_id),

      allocated_amount: Number(a.allocated_amount || 0),
    })),
  ];

  // ---------------------------------------------------------
  // DOCUMENT NUMBER
  //
  // IMPORTANT:
  // For ADVANCE payment:
  //   allocation exists    => show allocated document
  //   allocation missing   => show "Advance"
  //
  // Do NOT use legacy_document_no for an unallocated ADVANCE.
  // This prevents old purchase/sale/expense references from
  // incorrectly appearing against an Advance payment.
  // ---------------------------------------------------------

  const allocatedDocumentNumbers = [
    ...new Set(allAllocations.map((a) => a.document_no).filter(Boolean)),
  ];

  let documentNo;

  if (allocatedDocumentNumbers.length > 0) {
    documentNo = allocatedDocumentNumbers.join(", ");
  } else if (payment.payment_mode === "ADVANCE") {
    documentNo = "Advance";
  } else if (payment.payment_mode === "QUICK") {
    documentNo = "Quick Expense";
  } else {
    documentNo = payment.legacy_document_no || "Unallocated";
  }

  // ---------------------------------------------------------
  // RETURN PAYMENT
  // ---------------------------------------------------------
  return {
    ...payment,

    id: Number(payment.id),

    customer_id: payment.customer_id ? Number(payment.customer_id) : null,

    supplier_id: payment.supplier_id ? Number(payment.supplier_id) : null,

    sale_id: payment.sale_id ? Number(payment.sale_id) : null,

    purchase_id: payment.purchase_id ? Number(payment.purchase_id) : null,

    expense_category_id: payment.expense_category_id
      ? Number(payment.expense_category_id)
      : null,

    expense_bill_id: payment.expense_bill_id
      ? Number(payment.expense_bill_id)
      : null,

    amount: Number(payment.amount || 0),

    allocations: allAllocations,

    document_no: documentNo,
  };
};

/* =========================================================
   VALIDATE PAYLOAD
   ========================================================= */

const validatePayload = (body) => {
  const type = String(body?.payment_type || "").toUpperCase();

  if (!["CUSTOMER", "SUPPLIER", "EXPENSE"].includes(type)) {
    throw error("Payment type must be CUSTOMER, SUPPLIER or EXPENSE.");
  }

  const paymentMode = normalizePaymentMode(body?.payment_mode);
  if (type !== "EXPENSE" && paymentMode === "QUICK") {
    throw error("Quick Expense mode is only valid for Expense Payment.");
  }

  const amount = toNumber(body?.amount, NaN);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw error("Payment amount must be greater than zero.");
  }

  const method = normalizeMethod(body?.payment_method);
  if (!allowedMethods.includes(method)) {
    throw error("Invalid payment method.");
  }

  const paymentDate = String(body?.payment_date || "").trim();
  if (!paymentDate) throw error("Payment date is required.");

  let partyId = null;
  if (type === "CUSTOMER") {
    partyId = assertId(body?.customer_id, "customer");
  } else if (type === "SUPPLIER") {
    partyId = assertId(body?.supplier_id, "supplier");
  }

  let expenseCategoryId = null;
  let expenseBillId = null;
  let paidTo = null;

  if (type === "EXPENSE") {
    expenseCategoryId = assertId(body?.expense_category_id, "expense category");
    paidTo = String(body?.paid_to || "").trim();
    if (!paidTo) throw error("Paid To / Vendor is required.");

    expenseBillId = null;
    
  }

  return {
    type,
    paymentMode,
    amount,
    method,
    paymentDate,
    partyId,
    expenseCategoryId,
    expenseBillId,
    paidTo,
    referenceNo: String(body?.reference_no || "").trim() || null,
    remarks: String(body?.remarks || "").trim() || null,
  };
};

/* =========================================================
   EXPENSE BILL HELPERS
   ========================================================= */

const getExpenseBillDue = async (client, billId, excludePaymentId = null) => {
  const params = [billId];
  const exclude = excludePaymentId ? "AND p.id <> $2" : "";
  if (excludePaymentId) params.push(excludePaymentId);

  const result = await client.query(
    `
    SELECT
      eb.id,
      eb.expense_no,
      eb.category_id,
      eb.vendor_name,
      eb.total_amount,
      COALESCE((
        SELECT SUM(epa.allocated_amount)
        FROM expense_payment_allocations epa
        INNER JOIN payments p ON p.id = epa.payment_id
        WHERE epa.expense_bill_id = eb.id
          ${exclude}
      ), 0) AS paid_amount
    FROM expense_bills eb
    WHERE eb.id = $1
    FOR UPDATE
  `,
    params,
  );

  if (!result.rows.length) throw error("Expense bill not found.", 404);

  const row = result.rows[0];
  const total = Number(row.total_amount || 0);
  const paid = Number(row.paid_amount || 0);
  return {
    ...row,
    id: Number(row.id),
    total_amount: total,
    paid_amount: paid,
    due_amount: Math.max(total - paid, 0),
  };
};

const updateExpenseBillStatus = async (client, billId) => {
  await client.query(`SELECT id FROM expense_bills WHERE id = $1 FOR UPDATE`, [
    billId,
  ]);

  const result = await client.query(
    `
    SELECT
      eb.total_amount,
      COALESCE(SUM(epa.allocated_amount), 0) AS paid_amount
    FROM expense_bills eb
    LEFT JOIN expense_payment_allocations epa ON epa.expense_bill_id = eb.id
    WHERE eb.id = $1
    GROUP BY eb.id, eb.total_amount
  `,
    [billId],
  );

  if (!result.rows.length) return;

  const total = Number(result.rows[0].total_amount || 0);
  const paid = Math.min(total, Number(result.rows[0].paid_amount || 0));
  const status =
    paid <= EPSILON ? "PENDING" : paid + EPSILON >= total ? "PAID" : "PARTIAL";

  await client.query(
    `
    UPDATE expense_bills
    SET payment_status = $1, updated_at = NOW()
    WHERE id = $2
  `,
    [status, billId],
  );
};

const allocateExpensePaymentToBill = async (
  client,
  paymentId,
  billId,
  amount,
  excludePaymentId = null,
) => {
  const bill = await getExpenseBillDue(client, billId, excludePaymentId);
  if (amount > bill.due_amount + EPSILON) {
    throw error(
      `Expense payment cannot exceed bill due of ₹${bill.due_amount.toFixed(2)}.`,
    );
  }

  await client.query(
    `
    INSERT INTO expense_payment_allocations
      (payment_id, expense_bill_id, allocated_amount)
    VALUES ($1, $2, $3)
  `,
    [paymentId, billId, amount],
  );

  await client.query(
    `
    UPDATE payments
    SET expense_bill_id = $1
    WHERE id = $2
  `,
    [billId, paymentId],
  );

  await updateExpenseBillStatus(client, billId);
};

const getExpenseCategoryDue = async (client, categoryId) => {
  const id = assertId(categoryId, "expense category");

  const result = await client.query(
    `
      SELECT
        COALESCE(
          SUM(
            GREATEST(
              eb.total_amount
              -
              COALESCE(
                (
                  SELECT SUM(
                    epa.allocated_amount
                  )
                  FROM expense_payment_allocations epa
                  WHERE epa.expense_bill_id = eb.id
                ),
                0
              ),
              0
            )
          ),
          0
        ) AS total_due
      FROM expense_bills eb
      WHERE eb.category_id = $1
    `,
    [id],
  );

  return Number(result.rows[0]?.total_due || 0);
};

const allocateExpensePaymentToDueBills = async (
  client,
  paymentId,
  categoryId,
  amount,
) => {
  const id = assertId(categoryId, "expense category");

  let remaining = Number(amount || 0);

  if (remaining <= EPSILON) {
    return {
      allocations: [],
      total_due: 0,
      allocated: 0,
      remaining: 0,
    };
  }

  const billsResult = await client.query(
    `
      SELECT
        eb.id,
        eb.expense_no,
        eb.total_amount,
        eb.bill_date
      FROM expense_bills eb
      WHERE eb.category_id = $1
      ORDER BY
        eb.bill_date ASC,
        eb.id ASC
      FOR UPDATE
    `,
    [id],
  );

  const bills = [];

  for (const row of billsResult.rows) {
    const paidResult = await client.query(
      `
        SELECT
          COALESCE(
            SUM(allocated_amount),
            0
          ) AS paid_amount
        FROM expense_payment_allocations
        WHERE expense_bill_id = $1
      `,
      [Number(row.id)],
    );

    const total = Number(row.total_amount || 0);
    const paid = Number(
      paidResult.rows[0]?.paid_amount || 0,
    );

    const due = Math.max(total - paid, 0);

    if (due > EPSILON) {
      bills.push({
        id: Number(row.id),
        expense_no: row.expense_no,
        total_amount: total,
        paid_amount: paid,
        due_amount: due,
      });
    }
  }

  const totalDue = bills.reduce(
    (sum, bill) => sum + bill.due_amount,
    0,
  );

  if (remaining > totalDue + EPSILON) {
    throw error(
      `Payment cannot exceed total outstanding expense due of ₹${totalDue.toFixed(2)}.`,
    );
  }

  const allocations = [];

  for (const bill of bills) {
    if (remaining <= EPSILON) {
      break;
    }

    const allocateAmount = Math.min(
      remaining,
      bill.due_amount,
    );

    if (allocateAmount <= EPSILON) {
      continue;
    }

    await client.query(
      `
        INSERT INTO expense_payment_allocations
        (
          payment_id,
          expense_bill_id,
          allocated_amount
        )
        VALUES ($1, $2, $3)
      `,
      [
        Number(paymentId),
        bill.id,
        allocateAmount,
      ],
    );

    await updateExpenseBillStatus(
      client,
      bill.id,
    );

    allocations.push({
      expense_bill_id: bill.id,
      document_no: bill.expense_no,
      allocated_amount: allocateAmount,
    });

    remaining -= allocateAmount;
  }

  return {
    allocations,
    total_due: totalDue,
    allocated: Number(amount) - remaining,
    remaining: Math.max(remaining, 0),
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

    if (data.type === "CUSTOMER" || data.type === "SUPPLIER") {
      const partyTable = data.type === "CUSTOMER" ? "customers" : "suppliers";
      const partyResult = await client.query(
        `
        SELECT id FROM ${partyTable} WHERE id = $1 FOR UPDATE
      `,
        [data.partyId],
      );

      if (!partyResult.rows.length) {
        throw error(
          `${data.type === "CUSTOMER" ? "Customer" : "Supplier"} not found.`,
          404,
        );
      }

      if (data.paymentMode !== "ADVANCE") {
        const partyDue = await getPartyDue(client, data.type, data.partyId);
        const totalDue = Number(partyDue?.total_due || 0);
        if (data.amount > totalDue + EPSILON) {
          throw error(
            `Payment cannot exceed total outstanding due of ₹${totalDue.toFixed(2)}.`,
          );
        }
      }
    } else {
      const categoryResult = await client.query(
        `
        SELECT id FROM expense_categories WHERE id = $1 AND is_active = TRUE
      `,
        [data.expenseCategoryId],
      );
      if (!categoryResult.rows.length)
        throw error("Expense category not found.", 404);

      if (data.paymentMode === "INVOICE") {
  const categoryDue = await getExpenseCategoryDue(
    client,
    data.expenseCategoryId,
  );

  if (data.amount > categoryDue + EPSILON) {
    throw error(
      `Payment cannot exceed total outstanding expense due of ₹${categoryDue.toFixed(2)}.`,
    );
  }
}
    }

    const paymentNo = await generatePaymentNo(client);
    const paymentResult = await client.query(
      `
      INSERT INTO payments
      (
        payment_no, payment_type, payment_mode,
        customer_id, supplier_id, sale_id, purchase_id,
        expense_category_id, paid_to, expense_bill_id,
        payment_date, amount, payment_method, reference_no, remarks, created_by
      )
      VALUES
      ($1,$2,$3,$4,$5,NULL,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id
    `,
      [
        paymentNo,
        data.type,
        data.paymentMode,
        data.type === "CUSTOMER" ? data.partyId : null,
        data.type === "SUPPLIER" ? data.partyId : null,
        data.type === "EXPENSE" ? data.expenseCategoryId : null,
        data.type === "EXPENSE" ? data.paidTo : null,
        null,
        data.paymentDate,
        data.amount,
        data.method,
        data.referenceNo,
        data.remarks,
        userId || null,
      ],
    );

    const paymentId = Number(paymentResult.rows[0].id);

    if (data.type === "EXPENSE" && data.paymentMode === "INVOICE") {
      await allocateExpensePaymentToDueBills(
        client,
        paymentId,
        data.expenseCategoryId,
        data.amount,
      );
    } else if (data.type !== "EXPENSE" && data.paymentMode === "INVOICE") {
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
        : data.type === "SUPPLIER"
          ? "Supplier Payment Made"
          : "Expense Payment Recorded";

    await createNotification({
      title: notificationTitle,
      message: `${newPayment.party_name || newPayment.paid_to || "Expense"} - ₹${Number(newPayment.amount || 0).toLocaleString("en-IN")}. <br>Payment: ${newPayment.payment_no}`,
      type:
        data.type === "CUSTOMER"
          ? "payment_received"
          : data.type === "SUPPLIER"
            ? "payment_made"
            : "expense_payment",
      referenceType: "payment",
      referenceId: paymentId,
      createdBy: userId || null,
    });

    sendPushNotification({
      title: notificationTitle,
      body: `${newPayment.party_name || newPayment.paid_to || "Expense"} - ₹${Number(newPayment.amount || 0).toLocaleString("en-IN")}. Payment: ${newPayment.payment_no}`,
      icon: "/images/payment.png",
      badge: "/images/icon-192.png",
      url: "/payments",
    }).catch((pushError) =>
      console.error("Payment create push notification error:", pushError),
    );

    return newPayment;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/* =========================================================
   UPDATE PAYMENT
   ========================================================= */

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
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId],
    );
    if (!oldResult.rows.length) throw error("Payment not found.", 404);
    const previous = oldResult.rows[0];

    const oldDocuments = [];
    const oldAllocations = await client.query(
      `
      SELECT sale_id, purchase_id FROM payment_allocations WHERE payment_id = $1
    `,
      [paymentId],
    );
    for (const a of oldAllocations.rows) {
      if (a.sale_id)
        oldDocuments.push({ type: "CUSTOMER", id: Number(a.sale_id) });
      if (a.purchase_id)
        oldDocuments.push({ type: "SUPPLIER", id: Number(a.purchase_id) });
    }

    const oldExpenseBills = await client.query(
      `
      SELECT expense_bill_id FROM expense_payment_allocations WHERE payment_id = $1
    `,
      [paymentId],
    );

    if (previous.payment_type === "CUSTOMER" && previous.sale_id)
      oldDocuments.push({ type: "CUSTOMER", id: Number(previous.sale_id) });
    if (previous.payment_type === "SUPPLIER" && previous.purchase_id)
      oldDocuments.push({ type: "SUPPLIER", id: Number(previous.purchase_id) });

    await client.query(
      `DELETE FROM payment_allocations WHERE payment_id = $1`,
      [paymentId],
    );
    await client.query(
      `DELETE FROM expense_payment_allocations WHERE payment_id = $1`,
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
        expense_category_id = $5,
        paid_to = $6,
        expense_bill_id = $7,
        payment_date = $8,
        amount = $9,
        payment_method = $10,
        reference_no = $11,
        remarks = $12
      WHERE id = $13
    `,
      [
        data.type,
        data.paymentMode,
        data.type === "CUSTOMER" ? data.partyId : null,
        data.type === "SUPPLIER" ? data.partyId : null,
        data.type === "EXPENSE" ? data.expenseCategoryId : null,
        data.type === "EXPENSE" ? data.paidTo : null,
        null,
        data.paymentDate,
        data.amount,
        data.method,
        data.referenceNo,
        data.remarks,
        paymentId,
      ],
    );

    if (data.type === "EXPENSE" && data.paymentMode === "INVOICE") {
      await allocateExpensePaymentToDueBills(
        client,
        paymentId,
        data.expenseCategoryId,
        data.amount
      );
    } else if (data.type !== "EXPENSE" && data.paymentMode === "INVOICE") {
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
    for (const document of oldDocuments)
      uniqueOldDocuments.set(`${document.type}-${document.id}`, document);
    for (const document of uniqueOldDocuments.values())
      await updateDocumentStatus(client, document.type, document.id);

    const oldExpenseIds = new Set(
      oldExpenseBills.rows
        .map((r) => Number(r.expense_bill_id))
        .filter(Boolean),
    );
    for (const billId of oldExpenseIds)
      await updateExpenseBillStatus(client, billId);
    

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

    return newPayment;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/* =========================================================
   DELETE PAYMENT
   ========================================================= */

/* =========================================================
   DELETE PAYMENT
   ========================================================= */

const deletePayment = async (id, { userId = null, ipAddress }) => {
  const paymentId = assertId(id, "payment id");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const paymentResult = await client.query(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId],
    );
    if (!paymentResult.rows.length) throw error("Payment not found.", 404);
    const payment = paymentResult.rows[0];
    const oldPayment = await getPaymentById(paymentId, client);

    const affectedDocuments = new Map();
    const allocationResult = await client.query(
      `SELECT sale_id, purchase_id FROM payment_allocations WHERE payment_id = $1`,
      [paymentId],
    );
    for (const a of allocationResult.rows) {
      if (a.sale_id)
        affectedDocuments.set(`CUSTOMER-${a.sale_id}`, {
          type: "CUSTOMER",
          id: Number(a.sale_id),
        });
      if (a.purchase_id)
        affectedDocuments.set(`SUPPLIER-${a.purchase_id}`, {
          type: "SUPPLIER",
          id: Number(a.purchase_id),
        });
    }
    if (payment.payment_type === "CUSTOMER" && payment.sale_id)
      affectedDocuments.set(`CUSTOMER-${payment.sale_id}`, {
        type: "CUSTOMER",
        id: Number(payment.sale_id),
      });
    if (payment.payment_type === "SUPPLIER" && payment.purchase_id)
      affectedDocuments.set(`SUPPLIER-${payment.purchase_id}`, {
        type: "SUPPLIER",
        id: Number(payment.purchase_id),
      });

    const expenseBills = await client.query(
      `SELECT expense_bill_id FROM expense_payment_allocations WHERE payment_id = $1`,
      [paymentId],
    );

    await client.query(`DELETE FROM payments WHERE id = $1`, [paymentId]);

    for (const document of affectedDocuments.values())
      await updateDocumentStatus(client, document.type, document.id);
    for (const row of expenseBills.rows)
      await updateExpenseBillStatus(client, Number(row.expense_bill_id));

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

    return { id: paymentId, payment_no: payment.payment_no };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/* =========================================================
   AUTO APPLY EXPENSE ADVANCE TO BILL
   FIFO = OLDEST ADVANCE FIRST
   Match by expense category + vendor/paid-to when possible.
   ========================================================= */

const applyAvailableExpenseAdvance = async (client, billId) => {
  const billResult = await client.query(
    `
    SELECT id, category_id, vendor_name, total_amount
    FROM expense_bills
    WHERE id = $1
    FOR UPDATE
  `,
    [billId],
  );

  if (!billResult.rows.length) throw error("Expense bill not found.", 404);

  const bill = billResult.rows[0];
  const total = Number(bill.total_amount || 0);

  const paidResult = await client.query(
    `
    SELECT COALESCE(SUM(allocated_amount), 0) AS paid
    FROM expense_payment_allocations
    WHERE expense_bill_id = $1
  `,
    [billId],
  );

  let remainingBill = Math.max(
    total - Number(paidResult.rows[0]?.paid || 0),
    0,
  );
  if (remainingBill <= EPSILON) {
    await updateExpenseBillStatus(client, billId);
    return { allocated: 0, remaining_bill: 0, remaining_advance: 0 };
  }

  const advances = await client.query(
    `
    SELECT
      p.id,
      p.amount,
      p.payment_date,
      p.paid_to,
      p.expense_category_id,
      (
        p.amount - COALESCE((
          SELECT SUM(epa.allocated_amount)
          FROM expense_payment_allocations epa
          WHERE epa.payment_id = p.id
        ), 0)
      ) AS remaining_amount
    FROM payments p
    WHERE p.payment_type = 'EXPENSE'
      AND p.payment_mode = 'ADVANCE'
      AND p.expense_category_id = $1
      AND (
        NULLIF(TRIM($2), '') IS NULL
        OR LOWER(TRIM(COALESCE(p.paid_to, ''))) = LOWER(TRIM($2))
      )
      AND (
        p.amount - COALESCE((
          SELECT SUM(epa2.allocated_amount)
          FROM expense_payment_allocations epa2
          WHERE epa2.payment_id = p.id
        ), 0)
      ) > $3
    ORDER BY p.payment_date ASC, p.id ASC
  `,
    [Number(bill.category_id), bill.vendor_name || null, EPSILON],
  );

  let allocated = 0;

  for (const advance of advances.rows) {
    if (remainingBill <= EPSILON) break;

    const remainingAdvance = Number(advance.remaining_amount || 0);
    const amount = Math.min(remainingAdvance, remainingBill);
    if (amount <= EPSILON) continue;

    await client.query(
      `
      INSERT INTO expense_payment_allocations
        (payment_id, expense_bill_id, allocated_amount)
      VALUES ($1, $2, $3)
    `,
      [Number(advance.id), Number(billId), amount],
    );

    await client.query(
      `
      UPDATE payments
      SET expense_bill_id = $1
      WHERE id = $2
    `,
      [Number(billId), Number(advance.id)],
    );

    allocated += amount;
    remainingBill -= amount;
  }

  await updateExpenseBillStatus(client, billId);

  const advanceBalance = await client.query(
    `
    SELECT COALESCE(SUM(p.amount), 0) - COALESCE((
      SELECT SUM(epa.allocated_amount)
      FROM expense_payment_allocations epa
      INNER JOIN payments ap ON ap.id = epa.payment_id
      WHERE ap.payment_type = 'EXPENSE'
        AND ap.payment_mode = 'ADVANCE'
        AND ap.expense_category_id = $1
        AND (
          NULLIF(TRIM($2), '') IS NULL
          OR LOWER(TRIM(COALESCE(ap.paid_to, ''))) = LOWER(TRIM($2))
        )
    ), 0) AS balance
    FROM payments p
    WHERE p.payment_type = 'EXPENSE'
      AND p.payment_mode = 'ADVANCE'
      AND p.expense_category_id = $1
      AND (
        NULLIF(TRIM($2), '') IS NULL
        OR LOWER(TRIM(COALESCE(p.paid_to, ''))) = LOWER(TRIM($2))
      )
  `,
    [Number(bill.category_id), bill.vendor_name || null],
  );

  return {
    allocated,
    remaining_bill: Math.max(remainingBill, 0),
    remaining_advance: Math.max(
      Number(advanceBalance.rows[0]?.balance || 0),
      0,
    ),
  };
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
  updateExpenseBillStatus,
  allocateExpensePaymentToBill,
  applyAvailableExpenseAdvance,
};
