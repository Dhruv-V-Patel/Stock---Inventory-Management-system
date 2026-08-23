const pool = require("../config/db");
const EPSILON = 0.000001;
const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const assertId = (v, label = "id") => {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) {
    const e = new Error(`Invalid ${label}.`);
    e.statusCode = 400;
    throw e;
  }
  return id;
};
const normalizeMethod = (v) =>
  String(v || "")
    .trim()
    .toUpperCase();
const allowedMethods = ["CASH", "UPI", "BANK", "CHEQUE", "CARD", "OTHER"];

const listPayments = async () => {
  const { rows } = await pool.query(`
    SELECT p.id,p.payment_no,p.payment_type,p.customer_id,p.supplier_id,p.sale_id,p.purchase_id,p.payment_date,p.amount,p.payment_method,p.reference_no,p.remarks,
      CASE WHEN p.payment_type='CUSTOMER' THEN c.name ELSE s.name END AS party_name,
      CASE WHEN p.payment_type='CUSTOMER' THEN c.mobile ELSE s.mobile END AS party_mobile,
      CASE WHEN p.payment_type='CUSTOMER' THEN sa.sale_no ELSE pu.purchase_no END AS document_no
    FROM payments p
    LEFT JOIN customers c ON c.id=p.customer_id
    LEFT JOIN suppliers s ON s.id=p.supplier_id
    LEFT JOIN sales sa ON sa.id=p.sale_id
    LEFT JOIN purchases pu ON pu.id=p.purchase_id
    ORDER BY p.payment_date DESC,p.id DESC
  `);
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    customer_id: r.customer_id ? Number(r.customer_id) : null,
    supplier_id: r.supplier_id ? Number(r.supplier_id) : null,
    sale_id: r.sale_id ? Number(r.sale_id) : null,
    purchase_id: r.purchase_id ? Number(r.purchase_id) : null,
    amount: Number(r.amount || 0),
  }));
};

const getOptions = async () => {
  const [customers, suppliers, sales, purchases] = await Promise.all([
    pool.query(
      `SELECT id,name,mobile FROM customers WHERE is_active=TRUE ORDER BY name,id`,
    ),
    pool.query(
      `SELECT id,name,mobile FROM suppliers WHERE is_active=TRUE ORDER BY name,id`,
    ),
    pool.query(
      `SELECT s.id,s.sale_no AS document_no,s.customer_id,s.total_amount,COALESCE(SUM(p.amount),0) AS paid_before,GREATEST(s.total_amount-COALESCE(SUM(p.amount),0),0) AS outstanding FROM sales s LEFT JOIN payments p ON p.sale_id=s.id AND p.payment_type='CUSTOMER' GROUP BY s.id HAVING GREATEST(s.total_amount-COALESCE(SUM(p.amount),0),0)>0.000001 ORDER BY s.sale_date DESC,s.id DESC`,
    ),
    pool.query(
      `SELECT pu.id,pu.purchase_no AS document_no,pu.supplier_id,pu.total_amount,COALESCE(SUM(p.amount),0) AS paid_before,GREATEST(pu.total_amount-COALESCE(SUM(p.amount),0),0) AS outstanding FROM purchases pu LEFT JOIN payments p ON p.purchase_id=pu.id AND p.payment_type='SUPPLIER' GROUP BY pu.id HAVING GREATEST(pu.total_amount-COALESCE(SUM(p.amount),0),0)>0.000001 ORDER BY pu.purchase_date DESC,pu.id DESC`,
    ),
  ]);
  const mapMoney = (r) =>
    r.map((x) => ({
      ...x,
      id: Number(x.id),
      customer_id: x.customer_id ? Number(x.customer_id) : null,
      supplier_id: x.supplier_id ? Number(x.supplier_id) : null,
      total_amount: Number(x.total_amount || 0),
      paid_before: Number(x.paid_before || 0),
      outstanding: Number(x.outstanding || 0),
    }));
  return {
    customers: customers.rows.map((x) => ({ ...x, id: Number(x.id) })),
    suppliers: suppliers.rows.map((x) => ({ ...x, id: Number(x.id) })),
    sales: mapMoney(sales.rows),
    purchases: mapMoney(purchases.rows),
  };
};

const getPaymentById = async (id, client = pool) => {
  const paymentId = assertId(id, "payment id");
  const { rows } = await client.query(
    `SELECT p.*,CASE WHEN p.payment_type='CUSTOMER' THEN c.name ELSE s.name END AS party_name,CASE WHEN p.payment_type='CUSTOMER' THEN c.mobile ELSE s.mobile END AS party_mobile,CASE WHEN p.payment_type='CUSTOMER' THEN sa.sale_no ELSE pu.purchase_no END AS document_no FROM payments p LEFT JOIN customers c ON c.id=p.customer_id LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN sales sa ON sa.id=p.sale_id LEFT JOIN purchases pu ON pu.id=p.purchase_id WHERE p.id=$1`,
    [paymentId],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    ...r,
    id: Number(r.id),
    customer_id: r.customer_id ? Number(r.customer_id) : null,
    supplier_id: r.supplier_id ? Number(r.supplier_id) : null,
    sale_id: r.sale_id ? Number(r.sale_id) : null,
    purchase_id: r.purchase_id ? Number(r.purchase_id) : null,
    amount: Number(r.amount || 0),
  };
};

const validatePayload = (body) => {
  const type = String(body?.payment_type || "").toUpperCase();
  if (!["CUSTOMER", "SUPPLIER"].includes(type)) {
    const e = new Error("Payment type must be CUSTOMER or SUPPLIER.");
    e.statusCode = 400;
    throw e;
  }
  const amount = toNumber(body?.amount, NaN);
  if (!Number.isFinite(amount) || amount <= 0) {
    const e = new Error("Payment amount must be greater than zero.");
    e.statusCode = 400;
    throw e;
  }
  const method = normalizeMethod(body?.payment_method);
  if (!allowedMethods.includes(method)) {
    const e = new Error("Invalid payment method.");
    e.statusCode = 400;
    throw e;
  }
  const paymentDate = String(body?.payment_date || "").trim();
  if (!paymentDate) {
    const e = new Error("Payment date is required.");
    e.statusCode = 400;
    throw e;
  }
  const partyId = assertId(
    type === "CUSTOMER" ? body?.customer_id : body?.supplier_id,
    type === "CUSTOMER" ? "customer" : "supplier",
  );
  const documentId = assertId(
    type === "CUSTOMER" ? body?.sale_id : body?.purchase_id,
    type === "CUSTOMER" ? "sale" : "purchase",
  );
  return {
    type,
    amount,
    method,
    paymentDate,
    partyId,
    documentId,
    referenceNo: body?.reference_no?.trim() || null,
    remarks: body?.remarks?.trim() || null,
  };
};

const getReference = async (client, data, paymentId = null) => {
  const table = data.type === "CUSTOMER" ? "sales" : "purchases",
    idColumn = data.type === "CUSTOMER" ? "sale_id" : "purchase_id",
    totalColumn = "total_amount";
  const ref = await client.query(
    `SELECT id,${data.type === "CUSTOMER" ? "customer_id" : "supplier_id"} AS party_id,${totalColumn} FROM ${table} WHERE id=$1 FOR UPDATE`,
    [data.documentId],
  );
  if (!ref.rows.length) {
    const e = new Error(
      `${data.type === "CUSTOMER" ? "Sale" : "Purchase"} invoice not found.`,
    );
    e.statusCode = 404;
    throw e;
  }
  if (Number(ref.rows[0].party_id) !== data.partyId) {
    const e = new Error("Selected party does not match the selected invoice.");
    e.statusCode = 400;
    throw e;
  }
  const params = [data.documentId, data.type];
  let sql = `SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE ${idColumn}=$1 AND payment_type=$2`;
  if (paymentId) {
    sql += ` AND id<>$3`;
    params.push(paymentId);
  }
  const paidResult = await client.query(sql, params);
  const total = Number(ref.rows[0].total_amount || 0),
    paid = Number(paidResult.rows[0]?.paid || 0),
    outstanding = Math.max(0, total - paid);
  return { total, paid, outstanding };
};

const updateDocumentStatus = async (client, type, documentId) => {
  const table = type === "CUSTOMER" ? "sales" : "purchases",
    idCol = type === "CUSTOMER" ? "sale_id" : "purchase_id";
  const r = await client.query(
    `SELECT total_amount FROM ${table} WHERE id=$1`,
    [documentId],
  );
  if (!r.rows.length) return;
  const total = Number(r.rows[0].total_amount || 0);
  const p = await client.query(
    `SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE ${idCol}=$1 AND payment_type=$2`,
    [documentId, type],
  );
  const paid = Number(p.rows[0].paid || 0);
  const status =
    paid <= EPSILON ? "PENDING" : paid + EPSILON >= total ? "PAID" : "PARTIAL";
  await client.query(
    `UPDATE ${table} SET payment_status=$1,updated_at=NOW() WHERE id=$2`,
    [status, documentId],
  );
};
const generatePaymentNo = async (client) => {
  const r = await client.query(
    `SELECT COALESCE(MAX(CASE WHEN payment_no~'^PAY-[0-9]+$' THEN CAST(SUBSTRING(payment_no FROM 5) AS BIGINT) ELSE 0 END),0) AS last_no FROM payments`,
  );
  return `PAY-${String(Number(r.rows[0]?.last_no || 0) + 1).padStart(5, "0")}`;
};

const createPayment = async (body, userId) => {
  const data = validatePayload(body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ref = await getReference(client, data);
    if (data.amount > ref.outstanding + EPSILON) {
      const e = new Error(
        `Payment cannot exceed outstanding amount of ₹${ref.outstanding.toFixed(2)}.`,
      );
      e.statusCode = 400;
      throw e;
    }
    const paymentNo = await generatePaymentNo(client);
    const values =
      data.type === "CUSTOMER"
        ? [
          paymentNo,
          data.type,
          data.partyId,
          null,
          data.documentId,
          null,
          data.paymentDate,
          data.amount,
          data.method,
          data.referenceNo,
          data.remarks,
          userId || null,
        ]
        : [
          paymentNo,
          data.type,
          null,
          data.partyId,
          null,
          data.documentId,
          data.paymentDate,
          data.amount,
          data.method,
          data.referenceNo,
          data.remarks,
          userId || null,
        ];
    await client.query(
      `INSERT INTO payments(payment_no,payment_type,customer_id,supplier_id,sale_id,purchase_id,payment_date,amount,payment_method,reference_no,remarks,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      values,
    );
    await updateDocumentStatus(client, data.type, data.documentId);
    await client.query("COMMIT");
    return getPaymentById(
      (
        await client.query(`SELECT id FROM payments WHERE payment_no=$1`, [
          paymentNo,
        ])
      ).rows[0].id,
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const updatePayment = async (id, body, userId) => {
  const paymentId = assertId(id, "payment id");
  const data = validatePayload(body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const old = await client.query(
      `SELECT * FROM payments WHERE id=$1 FOR UPDATE`,
      [paymentId],
    );
    if (!old.rows.length) {
      const e = new Error("Payment not found.");
      e.statusCode = 404;
      throw e;
    }
    const previous = old.rows[0];
    const oldType = previous.payment_type;
    const oldDoc =
      oldType === "CUSTOMER" ? previous.sale_id : previous.purchase_id;
    const ref = await getReference(client, data, paymentId);
    if (data.amount > ref.outstanding + EPSILON) {
      const e = new Error(
        `Payment cannot exceed outstanding amount of ₹${ref.outstanding.toFixed(2)}.`,
      );
      e.statusCode = 400;
      throw e;
    }
    const values =
      data.type === "CUSTOMER"
        ? [
          data.type,
          data.partyId,
          null,
          data.documentId,
          null,
          data.paymentDate,
          data.amount,
          data.method,
          data.referenceNo,
          data.remarks,
          paymentId,
        ]
        : [
          data.type,
          null,
          data.partyId,
          null,
          data.documentId,
          data.paymentDate,
          data.amount,
          data.method,
          data.referenceNo,
          data.remarks,
          paymentId,
        ];
    await client.query(
      `UPDATE payments SET payment_type=$1,customer_id=$2,supplier_id=$3,sale_id=$4,purchase_id=$5,payment_date=$6,amount=$7,payment_method=$8,reference_no=$9,remarks=$10 WHERE id=$11`,
      values,
    );
    await updateDocumentStatus(client, oldType, oldDoc);
    if (oldType !== data.type || Number(oldDoc) !== Number(data.documentId))
      await updateDocumentStatus(client, data.type, data.documentId);
    await client.query("COMMIT");
    return getPaymentById(paymentId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const deletePayment = async (id) => {
  const paymentId = assertId(id, "payment id");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT payment_no,payment_type,sale_id,purchase_id FROM payments WHERE id=$1 FOR UPDATE`,
      [paymentId],
    );
    if (!r.rows.length) {
      const e = new Error("Payment not found.");
      e.statusCode = 404;
      throw e;
    }
    const p = r.rows[0];
    const doc = p.payment_type === "CUSTOMER" ? p.sale_id : p.purchase_id;
    await client.query(`DELETE FROM payments WHERE id=$1`, [paymentId]);
    await updateDocumentStatus(client, p.payment_type, doc);
    await client.query("COMMIT");
    return { id: paymentId, payment_no: p.payment_no };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};
module.exports = {
  listPayments,
  getOptions,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
};
