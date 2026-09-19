const pool = require("../config/db");

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

const parseId = (value, fieldName = "id") => {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw validationError(`Invalid ${fieldName}.`);
  }

  return id;
};

const parseNumber = (value, fieldName, { min = 0 } = {}) => {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < min) {
    throw validationError(
      `${fieldName} must be a valid number greater than or equal to ${min}.`,
    );
  }

  return number;
};

/* ---------------------------------- */
/* Mapping                            */
/* ---------------------------------- */

const mapQuotation = (row) => ({
  id: Number(row.id),
  quotation_no: row.quotation_no,
  customer_id: Number(row.customer_id),
  customer_name: row.customer_name || "",
  customer_mobile: row.customer_mobile || "",
  customer_gstin: row.customer_gstin || "",
  customer_address: row.customer_address || "",
  quotation_date: row.quotation_date,
  valid_until: row.valid_until,
  subtotal: Number(row.subtotal || 0),
  discount: Number(row.discount || 0),
  tax_amount: Number(row.tax_amount || 0),
  total_amount: Number(row.total_amount || 0),
  remarks: row.remarks || "",
  created_by: row.created_by ? Number(row.created_by) : null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapQuotationItem = (row) => ({
  id: Number(row.id),
  quotation_id: Number(row.quotation_id),
  product_id: Number(row.product_id),
  product_code: row.product_code || "",
  product_name: row.product_name || "",
  product_size: row.product_size || "",
  quantity: Number(row.quantity || 0),
  unit: row.unit || "",
  rate: Number(row.rate || 0),
  gst_tax_rate: Number(row.gst_tax_rate || 0),
  gst_amount: Number(row.gst_amount || 0),
  amount: Number(row.amount || 0),
});

const mapQuotationTerm = (row) => ({
  id: Number(row.id),
  quotation_id: Number(row.quotation_id),
  term_id: row.term_id ? Number(row.term_id) : null,
  term_text: row.term_text || "",
  sort_order: Number(row.sort_order || 0),
});


/* ---------------------------------- */
/* Quotation Options                  */
/* ---------------------------------- */

const getQuotationOptions = async () => {
  const [customers, products, terms] = await Promise.all([
    pool.query(`
      SELECT
        id,
        name,
        contact_person,
        mobile,
        gstin,
        address
      FROM customers
      WHERE is_active = TRUE
      ORDER BY name ASC;
    `),

    pool.query(`
      SELECT
        id,
        code,
        name,
        size,
        unit,
        selling_rate,
        gst_tax_rate
      FROM products
      WHERE is_active = TRUE
      ORDER BY name ASC, id ASC;
    `),

    pool.query(`
      SELECT
        id,
        term_text,
        is_active,
        sort_order
      FROM quotation_terms
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, id ASC;
    `),
  ]);

  return {
    customers: customers.rows.map((row) => ({
      id: Number(row.id),
      name: row.name || "",
      contact_person: row.contact_person || "",
      mobile: row.mobile || "",
      gstin: row.gstin || "",
      address: row.address || "",
    })),

    products: products.rows.map((row) => ({
      id: Number(row.id),
      code: row.code || "",
      name: row.name || "",
      size: row.size || "",
      unit: row.unit || "",
      selling_rate: Number(row.selling_rate || 0),
      gst_tax_rate: Number(row.gst_tax_rate || 0),
    })),

    terms: terms.rows.map((row) => ({
      id: Number(row.id),
      term_text: row.term_text || "",
      is_active: Boolean(row.is_active),
      sort_order: Number(row.sort_order || 0),
    })),
  };
};

/* ---------------------------------- */
/* Next Quotation Number               */
/* ---------------------------------- */

const getNextQuotationNo = async () => {
  const result = await pool.query(`
    SELECT
      COALESCE(
        MAX(
          CAST(
            SUBSTRING(
              quotation_no
              FROM '^QUO-([0-9]+)$'
            ) AS INTEGER
          )
        ),
        0
      ) + 1 AS next_number
    FROM quotations
    WHERE quotation_no ~ '^QUO-[0-9]+$'
  `);

  const nextNumber = Number(result.rows[0]?.next_number || 1);

  return `QUO-${String(nextNumber).padStart(4, "0")}`;
};

/* ---------------------------------- */
/* List Quotations                    */
/* ---------------------------------- */

const listQuotations = async ({
  search = "",
  customer_id = "",
  from_date = "",
  to_date = "",
} = {}) => {
  const values = [];
  const where = [];

  if (search?.trim()) {
    values.push(`%${search.trim()}%`);
    const index = values.length;

    where.push(`
      (
        q.quotation_no ILIKE $${index}
        OR c.name ILIKE $${index}
        OR COALESCE(c.mobile, '') ILIKE $${index}
      )
    `);
  }

  if (customer_id !== "" && customer_id !== null) {
    const customerId = parseId(customer_id, "customer id");

    values.push(customerId);
    where.push(`q.customer_id = $${values.length}`);
  }

  if (from_date) {
    values.push(from_date);
    where.push(`q.quotation_date >= $${values.length}`);
  }

  if (to_date) {
    values.push(to_date);
    where.push(`q.quotation_date <= $${values.length}`);
  }

  const query = `
    SELECT
      q.id,
      q.quotation_no,
      q.customer_id,
      c.name AS customer_name,
      c.mobile AS customer_mobile,
      c.gstin AS customer_gstin,
      c.address AS customer_address,
      q.quotation_date,
      q.valid_until,
      q.subtotal,
      q.discount,
      q.tax_amount,
      q.total_amount,
      q.remarks,
      q.created_by,
      q.created_at,
      q.updated_at
    FROM quotations q
    INNER JOIN customers c
      ON c.id = q.customer_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY
      q.quotation_date DESC,
      q.id DESC
  `;

  const result = await pool.query(query, values);

  return result.rows.map(mapQuotation);
};

/* ---------------------------------- */
/* Get Quotation By ID                */
/* ---------------------------------- */

const getQuotationById = async (idValue) => {
  const id = parseId(idValue, "quotation id");

  const quotationResult = await pool.query(
    `
      SELECT
        q.id,
        q.quotation_no,
        q.customer_id,
        c.name AS customer_name,
        c.mobile AS customer_mobile,
        c.gstin AS customer_gstin,
        c.address AS customer_address,
        q.quotation_date,
        q.valid_until,
        q.subtotal,
        q.discount,
        q.tax_amount,
        q.total_amount,
        q.remarks,
        q.created_by,
        q.created_at,
        q.updated_at
      FROM quotations q
      INNER JOIN customers c
        ON c.id = q.customer_id
      WHERE q.id = $1
      LIMIT 1
    `,
    [id],
  );

  if (quotationResult.rowCount === 0) {
    throw notFoundError("Quotation not found.");
  }

  const itemsResult = await pool.query(
    `
      SELECT
        qi.id,
        qi.quotation_id,
        qi.product_id,
        p.code AS product_code,
        p.name AS product_name,
        p.size AS product_size,
        qi.quantity,
        qi.unit,
        qi.rate,
        qi.gst_tax_rate,
        qi.gst_amount,
        qi.amount
      FROM quotation_items qi
      INNER JOIN products p
        ON p.id = qi.product_id
      WHERE qi.quotation_id = $1
      ORDER BY qi.id ASC
    `,
    [id],
  );

  const termsResult = await pool.query(
    `
      SELECT
        id,
        quotation_id,
        term_id,
        term_text,
        sort_order
      FROM quotation_term_items
      WHERE quotation_id = $1
      ORDER BY sort_order ASC, id ASC
    `,
    [id],
  );

  return {
    ...mapQuotation(quotationResult.rows[0]),
    company: await getCompanySettings(),
    items: itemsResult.rows.map(mapQuotationItem),
    terms: termsResult.rows.map(mapQuotationTerm),
  };
};

/* ---------------------------------- */
/* Validate Quotation                  */
/* ---------------------------------- */

const validateQuotationPayload = (body, { partial = false } = {}) => {
  const payload = {};

  if (!partial || body.customer_id !== undefined) {
    const customerId = parseId(
      body.customer_id,
      "customer id",
    );

    payload.customer_id = customerId;
  }

  if (!partial || body.quotation_date !== undefined) {
    const quotationDate =
      normalizeText(body.quotation_date);

    if (!quotationDate) {
      throw validationError(
        "Quotation date is required.",
      );
    }

    payload.quotation_date = quotationDate;
  }

  if (!partial || body.valid_until !== undefined) {
    payload.valid_until =
      normalizeText(body.valid_until);
  }

  if (!partial || body.subtotal !== undefined) {
    payload.subtotal = parseNumber(
      body.subtotal,
      "Subtotal",
    );
  }

  if (!partial || body.discount !== undefined) {
    payload.discount = parseNumber(
      body.discount,
      "Discount",
    );
  }

  if (!partial || body.tax_amount !== undefined) {
    payload.tax_amount = parseNumber(
      body.tax_amount,
      "Tax amount",
    );
  }

  if (!partial || body.total_amount !== undefined) {
    payload.total_amount = parseNumber(
      body.total_amount,
      "Total amount",
    );
  }

  if (!partial || body.remarks !== undefined) {
    payload.remarks =
      normalizeText(body.remarks);
  }

  return payload;
};

/* ---------------------------------- */
/* Validate Items                     */
/* ---------------------------------- */

const validateQuotationItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw validationError(
      "At least one quotation item is required.",
    );
  }

  return items.map((item, index) => {
    const productId = parseId(
      item.product_id,
      `product id at item ${index + 1}`,
    );

    const quantity = parseNumber(
      item.quantity,
      `Quantity at item ${index + 1}`,
      { min: 0.0001 },
    );

    const rate = parseNumber(
      item.rate,
      `Rate at item ${index + 1}`,
    );

    let gstTaxRate = parseNumber(
      item.gst_tax_rate,
      `GST tax rate at item ${index + 1}`,
    );

    if (gstTaxRate > 100) {
      throw validationError(
        `GST tax rate at item ${index + 1} cannot exceed 100%.`,
      );
    }

    const unit =
      normalizeText(item.unit) || "PCS";

    const amount =
      quantity * rate;

    const gstAmount =
      amount * gstTaxRate / 100;

    return {
      product_id: productId,
      quantity,
      unit,
      rate,
      gst_tax_rate: gstTaxRate,
      gst_amount: Number(gstAmount.toFixed(2)),
      amount: Number(amount.toFixed(2)),
    };
  });
};

/* ---------------------------------- */
/* Validate Terms                     */
/* ---------------------------------- */

const validateQuotationTerms = (terms) => {
  if (!terms) {
    return [];
  }

  if (!Array.isArray(terms)) {
    throw validationError(
      "Terms must be an array.",
    );
  }

  return terms.map((term, index) => {
    const termId =
      term.term_id === undefined ||
      term.term_id === null ||
      term.term_id === ""
        ? null
        : parseId(
            term.term_id,
            `term id at position ${index + 1}`,
          );

    const termText =
      normalizeText(term.term_text);

    if (!termText) {
      throw validationError(
        `Term text is required at position ${index + 1}.`,
      );
    }

    return {
      term_id: termId,
      term_text: termText,
      sort_order: index + 1,
    };
  });
};

/* ---------------------------------- */
/* Customer Validation                */
/* ---------------------------------- */

const validateCustomer = async (client, customerId) => {
  const result = await client.query(
    `
      SELECT id
      FROM customers
      WHERE id = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [customerId],
  );

  if (result.rowCount === 0) {
    throw notFoundError(
      "Customer not found or inactive.",
    );
  }
};

/* ---------------------------------- */
/* Product Validation                 */
/* ---------------------------------- */

const getProductsForItems = async (client, items) => {
  const productIds = [
    ...new Set(
      items.map((item) => item.product_id),
    ),
  ];

  const result = await client.query(
    `
      SELECT
        id,
        name,
        unit,
        selling_rate,
        gst_tax_rate,
        is_active
      FROM products
      WHERE id = ANY($1::int[])
    `,
    [productIds],
  );

  if (result.rows.length !== productIds.length) {
    throw validationError(
      "One or more selected products were not found.",
    );
  }

  const products = new Map(
    result.rows.map((row) => [
      Number(row.id),
      row,
    ]),
  );

  for (const item of items) {
    const product = products.get(
      item.product_id,
    );

    if (!product.is_active) {
      throw validationError(
        `Product "${product.name}" is inactive.`,
      );
    }
  }

  return products;
};

/* ---------------------------------- */
/* Create Quotation                   */
/* ---------------------------------- */

const createQuotation = async ({
  body,
  userId,
  ipAddress,
}) => {
  const payload =
    validateQuotationPayload(body);

  const items =
    validateQuotationItems(body.items);

  const terms =
    validateQuotationTerms(body.terms);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await validateCustomer(
      client,
      payload.customer_id,
    );

    const products =
      await getProductsForItems(
        client,
        items,
      );

    /*
     * GST is always taken from Product Master.
     * Do not trust frontend GST value.
     */

    for (const item of items) {
      const product =
        products.get(item.product_id);

      item.unit =
        product.unit || item.unit;

      item.gst_tax_rate =
        Number(product.gst_tax_rate || 0);

      item.amount =
        Number(
          (item.quantity * item.rate).toFixed(2),
        );

      item.gst_amount =
        Number(
          (
            item.amount *
            item.gst_tax_rate /
            100
          ).toFixed(2),
        );
    }

    const subtotal = Number(
      items
        .reduce(
          (sum, item) => sum + item.amount,
          0,
        )
        .toFixed(2),
    );

    const discount = Number(
      payload.discount || 0,
    );

    if (discount > subtotal) {
      throw validationError(
        "Discount cannot be greater than subtotal.",
      );
    }

    const taxableAmount =
      subtotal - discount;

    const taxAmount = Number(
      items
        .reduce(
          (sum, item) => {
            const taxableItem =
              item.amount -
              (
                discount *
                item.amount /
                subtotal
              );

            return (
              sum +
              (
                taxableItem *
                item.gst_tax_rate /
                100
              )
            );
          },
          0,
        )
        .toFixed(2),
    );

    const totalAmount = Number(
      (
        taxableAmount +
        taxAmount
      ).toFixed(2),
    );

    const quotationNo =
      await getNextQuotationNo();

    const quotationResult =
      await client.query(
        `
          INSERT INTO quotations (
            quotation_no,
            customer_id,
            quotation_date,
            valid_until,
            subtotal,
            discount,
            tax_amount,
            total_amount,
            remarks,
            created_by
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10
          )
          RETURNING *
        `,
        [
          quotationNo,
          payload.customer_id,
          payload.quotation_date,
          payload.valid_until,
          subtotal,
          discount,
          taxAmount,
          totalAmount,
          payload.remarks,
          userId || null,
        ],
      );

    const quotationId =
      Number(
        quotationResult.rows[0].id,
      );

    /* -------------------------------- */
    /* Insert Items                     */
    /* -------------------------------- */

    for (const item of items) {
      await client.query(
        `
          INSERT INTO quotation_items (
            quotation_id,
            product_id,
            quantity,
            unit,
            rate,
            gst_tax_rate,
            gst_amount,
            amount
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
        `,
        [
          quotationId,
          item.product_id,
          item.quantity,
          item.unit,
          item.rate,
          item.gst_tax_rate,
          item.gst_amount,
          item.amount,
        ],
      );
    }

    /* -------------------------------- */
    /* Insert Terms                     */
    /* -------------------------------- */

    for (const term of terms) {
      if (term.term_id) {
        const termResult =
          await client.query(
            `
              SELECT term_text
              FROM quotation_terms
              WHERE id = $1
                AND is_active = TRUE
              LIMIT 1
            `,
            [term.term_id],
          );

        if (termResult.rowCount === 0) {
          throw notFoundError(
            "Selected quotation term not found or inactive.",
          );
        }

        /*
         * Snapshot master term text.
         */
        term.term_text =
          termResult.rows[0].term_text;
      }

      await client.query(
        `
          INSERT INTO quotation_term_items (
            quotation_id,
            term_id,
            term_text,
            sort_order
          )
          VALUES (
            $1,
            $2,
            $3,
            $4
          )
        `,
        [
          quotationId,
          term.term_id,
          term.term_text,
          term.sort_order,
        ],
      );
    }

    /* -------------------------------- */
    /* Audit Log                        */
    /* -------------------------------- */

    await client.query(
      `
        INSERT INTO audit_logs (
          user_id,
          action,
          module,
          record_id,
          new_data,
          ip_address
        )
        VALUES (
          $1,
          'CREATE',
          'QUOTATIONS',
          $2,
          $3::jsonb,
          $4
        )
      `,
      [
        userId || null,
        quotationId,
        JSON.stringify({
          quotation_no: quotationNo,
          customer_id: payload.customer_id,
          subtotal,
          discount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
        }),
        ipAddress || null,
      ],
    );

    await client.query("COMMIT");

    return getQuotationById(
      quotationId,
    );
  } catch (error) {
    await client
      .query("ROLLBACK")
      .catch(() => {});

    throw error;
  } finally {
    client.release();
  }
};

/* ---------------------------------- */
/* Update Quotation                   */
/* ---------------------------------- */

const updateQuotation = async ({
  id: idValue,
  body,
  userId,
  ipAddress,
}) => {
  const id = parseId(
    idValue,
    "quotation id",
  );

  const payload =
    validateQuotationPayload(
      body,
      { partial: true },
    );

  const items =
    body.items !== undefined
      ? validateQuotationItems(body.items)
      : null;

  const terms =
    body.terms !== undefined
      ? validateQuotationTerms(body.terms)
      : null;

  if (
    Object.keys(payload).length === 0 &&
    items === null &&
    terms === null
  ) {
    throw validationError(
      "No fields provided for update.",
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const currentResult =
      await client.query(
        `
          SELECT *
          FROM quotations
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );

    if (currentResult.rowCount === 0) {
      throw notFoundError(
        "Quotation not found.",
      );
    }

    const current =
      currentResult.rows[0];

    const customerId =
      payload.customer_id ??
      Number(current.customer_id);

    await validateCustomer(
      client,
      customerId,
    );

    let finalSubtotal =
      Number(current.subtotal);

    let finalDiscount =
      payload.discount !== undefined
        ? payload.discount
        : Number(current.discount);

    let finalTaxAmount =
      Number(current.tax_amount);

    let finalTotalAmount =
      Number(current.total_amount);

    /* -------------------------------- */
    /* Update Items                     */
    /* -------------------------------- */

    if (items !== null) {
      const products =
        await getProductsForItems(
          client,
          items,
        );

      for (const item of items) {
        const product =
          products.get(item.product_id);

        item.unit =
          product.unit || item.unit;

        /*
         * Always use GST from Product Master.
         */
        item.gst_tax_rate =
          Number(product.gst_tax_rate || 0);

        item.amount =
          Number(
            (
              item.quantity *
              item.rate
            ).toFixed(2),
          );

        item.gst_amount =
          Number(
            (
              item.amount *
              item.gst_tax_rate /
              100
            ).toFixed(2),
          );
      }

      finalSubtotal = Number(
        items
          .reduce(
            (sum, item) =>
              sum + item.amount,
            0,
          )
          .toFixed(2),
      );

      if (
        finalDiscount >
        finalSubtotal
      ) {
        throw validationError(
          "Discount cannot be greater than subtotal.",
        );
      }

      const taxableAmount =
        finalSubtotal -
        finalDiscount;

      finalTaxAmount = Number(
        items
          .reduce(
            (sum, item) => {
              const taxableItem =
                item.amount -
                (
                  finalDiscount *
                  item.amount /
                  finalSubtotal
                );

              return (
                sum +
                (
                  taxableItem *
                  item.gst_tax_rate /
                  100
                )
              );
            },
            0,
          )
          .toFixed(2),
      );

      finalTotalAmount =
        Number(
          (
            taxableAmount +
            finalTaxAmount
          ).toFixed(2),
        );

      await client.query(
        `
          DELETE FROM quotation_items
          WHERE quotation_id = $1
        `,
        [id],
      );

      for (const item of items) {
        await client.query(
          `
            INSERT INTO quotation_items (
              quotation_id,
              product_id,
              quantity,
              unit,
              rate,
              gst_tax_rate,
              gst_amount,
              amount
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
          `,
          [
            id,
            item.product_id,
            item.quantity,
            item.unit,
            item.rate,
            item.gst_tax_rate,
            item.gst_amount,
            item.amount,
          ],
        );
      }
    }

    /* -------------------------------- */
    /* Update Terms                     */
    /* -------------------------------- */

    if (terms !== null) {
      await client.query(
        `
          DELETE FROM quotation_term_items
          WHERE quotation_id = $1
        `,
        [id],
      );

      for (const term of terms) {
        if (term.term_id) {
          const termResult =
            await client.query(
              `
                SELECT term_text
                FROM quotation_terms
                WHERE id = $1
                  AND is_active = TRUE
                LIMIT 1
              `,
              [term.term_id],
            );

          if (termResult.rowCount === 0) {
            throw notFoundError(
              "Selected quotation term not found or inactive.",
            );
          }

          term.term_text =
            termResult.rows[0].term_text;
        }

        await client.query(
          `
            INSERT INTO quotation_term_items (
              quotation_id,
              term_id,
              term_text,
              sort_order
            )
            VALUES (
              $1,
              $2,
              $3,
              $4
            )
          `,
          [
            id,
            term.term_id,
            term.term_text,
            term.sort_order,
          ],
        );
      }
    }

    /* -------------------------------- */
    /* Update Header                    */
    /* -------------------------------- */

    await client.query(
      `
        UPDATE quotations
        SET
          customer_id = $1,
          quotation_date = $2,
          valid_until = $3,
          subtotal = $4,
          discount = $5,
          tax_amount = $6,
          total_amount = $7,
          remarks = $8,
          updated_at = NOW()
        WHERE id = $9
      `,
      [
        customerId,
        payload.quotation_date ??
          current.quotation_date,
        payload.valid_until !== undefined
          ? payload.valid_until
          : current.valid_until,
        finalSubtotal,
        finalDiscount,
        finalTaxAmount,
        finalTotalAmount,
        payload.remarks !== undefined
          ? payload.remarks
          : current.remarks,
        id,
      ],
    );

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
          'UPDATE',
          'QUOTATIONS',
          $2,
          $3::jsonb,
          $4::jsonb,
          $5
        )
      `,
      [
        userId || null,
        id,
        JSON.stringify(current),
        JSON.stringify({
          customer_id: customerId,
          subtotal: finalSubtotal,
          discount: finalDiscount,
          tax_amount: finalTaxAmount,
          total_amount: finalTotalAmount,
        }),
        ipAddress || null,
      ],
    );

    await client.query("COMMIT");

    return getQuotationById(id);
  } catch (error) {
    await client
      .query("ROLLBACK")
      .catch(() => {});

    throw error;
  } finally {
    client.release();
  }
};

/* ---------------------------------- */
/* Delete Quotation                   */
/* ---------------------------------- */

const deleteQuotation = async ({
  id: idValue,
  userId,
  ipAddress,
}) => {
  const id = parseId(
    idValue,
    "quotation id",
  );

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result =
      await client.query(
        `
          SELECT *
          FROM quotations
          WHERE id = $1
          FOR UPDATE
        `,
        [id],
      );

    if (result.rowCount === 0) {
      throw notFoundError(
        "Quotation not found.",
      );
    }

    const quotation =
      result.rows[0];

    await client.query(
      `
        DELETE FROM quotations
        WHERE id = $1
      `,
      [id],
    );

    await client.query(
      `
        INSERT INTO audit_logs (
          user_id,
          action,
          module,
          record_id,
          old_data,
          ip_address
        )
        VALUES (
          $1,
          'DELETE',
          'QUOTATIONS',
          $2,
          $3::jsonb,
          $4
        )
      `,
      [
        userId || null,
        id,
        JSON.stringify(quotation),
        ipAddress || null,
      ],
    );

    await client.query("COMMIT");

    return {
      id,
      quotation_no:
        quotation.quotation_no,
    };
  } catch (error) {
    await client
      .query("ROLLBACK")
      .catch(() => {});

    throw error;
  } finally {
    client.release();
  }
};

/* ---------------------------------- */
/* Summary                            */
/* ---------------------------------- */

const getQuotationSummary = async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*)::INTEGER AS total_quotations,

      COALESCE(
        SUM(total_amount),
        0
      ) AS total_value,

      COUNT(*) FILTER (
        WHERE quotation_date = CURRENT_DATE
      )::INTEGER AS today_quotations,

      COUNT(*) FILTER (
        WHERE valid_until IS NOT NULL
          AND valid_until < CURRENT_DATE
      )::INTEGER AS expired_quotations

    FROM quotations
  `);

  const row = result.rows[0];

  return {
    total_quotations:
      Number(row.total_quotations || 0),

    total_value:
      Number(row.total_value || 0),

    today_quotations:
      Number(row.today_quotations || 0),

    expired_quotations:
      Number(row.expired_quotations || 0),
  };
};

/* ---------------------------------- */
/* Terms Master                       */
/* ---------------------------------- */

const listQuotationTerms = async () => {
  const result = await pool.query(`
    SELECT
      id,
      term_text,
      is_active,
      sort_order,
      created_at,
      updated_at
    FROM quotation_terms
    ORDER BY
      sort_order ASC,
      id ASC
  `);

  return result.rows.map((row) => ({
    id: Number(row.id),
    term_text: row.term_text,
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};

const createQuotationTerm = async ({
  term_text,
}) => {
  const text =
    normalizeText(term_text);

  if (!text) {
    throw validationError(
      "Term text is required.",
    );
  }

  const result = await pool.query(
    `
      INSERT INTO quotation_terms (
        term_text
      )
      VALUES ($1)
      RETURNING *
    `,
    [text],
  );

  return result.rows[0];
};

const updateQuotationTerm = async ({
  id: idValue,
  term_text,
  is_active,
  sort_order,
}) => {
  const id = parseId(
    idValue,
    "term id",
  );

  const text =
    normalizeText(term_text);

  if (!text) {
    throw validationError(
      "Term text is required.",
    );
  }

  const result = await pool.query(
    `
      UPDATE quotation_terms
      SET
        term_text = $1,
        is_active = COALESCE($2, is_active),
        sort_order = COALESCE($3, sort_order),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `,
    [
      text,
      is_active,
      sort_order,
      id,
    ],
  );

  if (result.rowCount === 0) {
    throw notFoundError(
      "Quotation term not found.",
    );
  }

  return result.rows[0];
};

const deleteQuotationTerm = async (idValue) => {
  const id = parseId(
    idValue,
    "term id",
  );

  const result = await pool.query(
    `
       DELETE FROM quotation_terms
       WHERE id = $1
       RETURNING *
    `,
    [id],
  );

  if (result.rowCount === 0) {
    throw notFoundError(
      "Quotation term not found.",
    );
  }

  return result.rows[0];
};

const getCompanySettings = async () => {
  const result = await pool.query(`
    SELECT * FROM company_settings ORDER BY id ASC LIMIT 1
  `);

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: Number(row.id),
    company_name: row.company_name || "",
    tagline: row.tagline || "",
    address: row.address || "",
    gstin: row.gstin || "",
    phone: row.phone || "",
    email: row.email || "",
    website: row.website || "",
    logo_url: row.logo_url || "",
    stamp_url: row.stamp_url || "",
    authorized_signatory_name:
      row.authorized_signatory_name || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

module.exports = {
  getQuotationOptions,
  getNextQuotationNo,

  listQuotations,
  getQuotationById,

  createQuotation,
  updateQuotation,
  deleteQuotation,

  getQuotationSummary,

  listQuotationTerms,
  createQuotationTerm,
  updateQuotationTerm,
  deleteQuotationTerm,

  getCompanySettings
};