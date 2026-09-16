const pool = require("../config/db");
const { createAuditLog } = require("./auditLogService");

const normalizeDate = (value) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date.");
  }

  return value;
};

const toNumber = (value) => Number(value || 0);

const round3 = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

const generateCorrectionNo = () => {
  const now = new Date();

  const datePart =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, "0")}` +
    `${String(now.getDate()).padStart(2, "0")}`;

  const timePart =
    `${String(now.getHours()).padStart(2, "0")}` +
    `${String(now.getMinutes()).padStart(2, "0")}` +
    `${String(now.getSeconds()).padStart(2, "0")}`;

  const randomPart = Math.floor(100 + Math.random() * 900);

  return `CC-${datePart}-${timePart}-${randomPart}`;
};

/**
 * Get BOMs + raw materials for Consumption Correction.
 */
const getOptions = async () => {
  const client = await pool.connect();

  try {
    const bomsResult = await client.query(`
      SELECT
        pb.id,
        pb.product_id,
        pb.name AS bom_name,
        pb.is_active,
        p.name AS product_name,
        p.code AS product_code,
        p.unit AS product_unit
      FROM product_boms pb
      INNER JOIN products p
        ON p.id = pb.product_id
      WHERE pb.is_active = TRUE
      ORDER BY p.name ASC, pb.name ASC
    `);

    const materialsResult = await client.query(`
      SELECT
        id,
        code,
        name,
        unit,
        is_active
      FROM raw_materials
      WHERE is_active = TRUE
      ORDER BY name ASC
    `);

    return {
      boms: bomsResult.rows,
      rawMaterials: materialsResult.rows,
    };
  } finally {
    client.release();
  }
};

/**
 * Get raw materials belonging to a selected BOM.
 */
const getBomMaterials = async (bomId) => {
  const id = Number(bomId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid BOM ID.");
  }

  const result = await pool.query(
    `
      SELECT
        pbi.id,
        pbi.bom_id,
        pbi.raw_material_id,
        pbi.quantity,
        pbi.unit,
        rm.code AS raw_material_code,
        rm.name AS raw_material_name
      FROM product_bom_items pbi
      INNER JOIN raw_materials rm
        ON rm.id = pbi.raw_material_id
      WHERE pbi.bom_id = $1
      ORDER BY rm.name ASC
    `,
    [id],
  );

  return result.rows;
};

/**
 * Find productions which can be corrected.
 *
 * IMPORTANT:
 * - production_materials.actual_quantity is NEVER modified.
 * - Already corrected production_materials are excluded.
 */
const findProductions = async (payload = {}) => {
  const bomId = Number(payload.bomId);
  const rawMaterialId = Number(payload.rawMaterialId);

  if (!Number.isInteger(bomId) || bomId <= 0) {
    throw new Error("BOM is required.");
  }

  if (!Number.isInteger(rawMaterialId) || rawMaterialId <= 0) {
    throw new Error("Raw material is required.");
  }

  const fromDate = normalizeDate(payload.fromDate);
  const toDate = normalizeDate(payload.toDate);

  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("From date cannot be greater than To date.");
  }

  const params = [bomId, rawMaterialId];
  let dateCondition = "";

  if (fromDate) {
    params.push(fromDate);
    dateCondition += ` AND pb.production_date::date >= $${params.length}`;
  }

  if (toDate) {
    params.push(toDate);
    dateCondition += ` AND pb.production_date::date <= $${params.length}`;
  }

  const result = await pool.query(
    `
      SELECT
        pb.id AS production_batch_id,
        pb.batch_no,
        pb.production_date,
        pb.product_id,
        pb.bom_id,
        pb.produced_quantity,
        p.name AS product_name,
        p.code AS product_code,
        p.unit AS product_unit,

        pm.id AS production_material_id,
        pm.raw_material_id,
        pm.standard_quantity,
        pm.actual_quantity,
        pm.unit AS material_unit,

        pbi.quantity AS current_bom_quantity,
        pbi.unit AS current_bom_unit,

        ROUND(
          (
            pbi.quantity *
            (
              pb.produced_quantity +
              COALESCE(pb.wastage_quantity, 0)
            )
          )::numeric,
          3
        ) AS corrected_quantity,

        ROUND(
          (
            pm.actual_quantity -
            (
              pbi.quantity *
              (
                pb.produced_quantity +
                COALESCE(pb.wastage_quantity, 0)
              )
            )
          )::numeric,
          3
        ) AS adjustment_quantity,

        CASE
          WHEN EXISTS (
            SELECT 1
            FROM production_consumption_correction_items pcci
            WHERE pcci.production_material_id = pm.id
          )
          THEN TRUE
          ELSE FALSE
        END AS already_corrected

      FROM production_batches pb

      INNER JOIN products p
        ON p.id = pb.product_id

      INNER JOIN production_materials pm
        ON pm.production_batch_id = pb.id
       AND pm.raw_material_id = $2

      INNER JOIN product_bom_items pbi
        ON pbi.bom_id = pb.bom_id
       AND pbi.raw_material_id = pm.raw_material_id

      WHERE pb.bom_id = $1
        ${dateCondition}

      ORDER BY pb.production_date ASC, pb.id ASC
    `,
    params,
  );

  return result.rows;
};

/**
 * Preview selected productions before applying correction.
 *
 * No database changes happen here.
 */
const previewCorrection = async (payload = {}) => {
  const {
    bomId,
    rawMaterialId,
    productionBatchIds = [],
  } = payload;

  const numericBatchIds = [
    ...new Set(
      productionBatchIds
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (!numericBatchIds.length) {
    throw new Error("Please select at least one production batch.");
  }

  const rows = await findProductions({
    bomId,
    rawMaterialId,
    fromDate: payload.fromDate,
    toDate: payload.toDate,
  });

  const selectedRows = rows.filter((row) =>
    numericBatchIds.includes(Number(row.production_batch_id)),
  );

  if (selectedRows.length !== numericBatchIds.length) {
    throw new Error(
      "One or more selected production batches are invalid or do not belong to the selected BOM/raw material.",
    );
  }

  const alreadyCorrected = selectedRows.filter(
    (row) => row.already_corrected,
  );

  if (alreadyCorrected.length) {
    throw new Error(
      `Some selected production batches are already corrected: ${alreadyCorrected
        .map((row) => row.batch_no)
        .join(", ")}`,
    );
  }

  const first = selectedRows[0];

  const totalProduced = round3(
    selectedRows.reduce(
      (sum, row) => sum + toNumber(row.produced_quantity),
      0,
    ),
  );

  const totalOldConsumption = round3(
    selectedRows.reduce(
      (sum, row) => sum + toNumber(row.actual_quantity),
      0,
    ),
  );

  const totalCorrectedConsumption = round3(
    selectedRows.reduce(
      (sum, row) => sum + toNumber(row.corrected_quantity),
      0,
    ),
  );

  const totalAdjustment = round3(
    totalOldConsumption - totalCorrectedConsumption,
  );

  return {
    bomId: Number(bomId),
    rawMaterialId: Number(rawMaterialId),

    productId: Number(first.product_id),
    productName: first.product_name,
    bomName: first.bom_name || null,

    rawMaterialName: first.raw_material_name || null,
    unit: first.material_unit || first.current_bom_unit,

    oldQuantityPerUnit: round3(
      toNumber(first.standard_quantity) /
        Math.max(
          toNumber(first.produced_quantity) +
            toNumber(first.wastage_quantity),
          1,
        ),
    ),

    correctedQuantityPerUnit: round3(
      toNumber(first.current_bom_quantity),
    ),

    differencePerUnit: round3(
      toNumber(first.standard_quantity) /
        Math.max(
          toNumber(first.produced_quantity) +
            toNumber(first.wastage_quantity),
          1,
        ) -
        toNumber(first.current_bom_quantity),
    ),

    selectedBatches: selectedRows,

    summary: {
      selectedBatches: selectedRows.length,
      totalProducedQuantity: totalProduced,
      totalOldConsumption,
      totalCorrectedConsumption,
      totalAdjustmentQuantity: Math.abs(totalAdjustment),

      direction:
        totalAdjustment > 0
          ? "IN"
          : totalAdjustment < 0
            ? "OUT"
            : "NONE",
    },
  };
};

/**
 * Apply bulk Consumption Correction.
 *
 * IMPORTANT:
 * 1. Historical production_materials.actual_quantity remains unchanged.
 * 2. Original PRODUCTION_CONSUMPTION movement remains unchanged.
 * 3. Only a new PRODUCTION_CONSUMPTION_CORRECTION movement is created.
 * 4. Everything happens inside one transaction.
 */
const applyCorrection = async (payload = {}, context = {}) => {
  const client = await pool.connect();

  const userId = context.userId || null;
  const ipAddress = context.ipAddress || null;

  try {
    const bomId = Number(payload.bomId);
    const rawMaterialId = Number(payload.rawMaterialId);

    const productionBatchIds = [
      ...new Set(
        (payload.productionBatchIds || [])
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    const reason = String(payload.reason || "").trim();

    if (!Number.isInteger(bomId) || bomId <= 0) {
      throw new Error("BOM is required.");
    }

    if (!Number.isInteger(rawMaterialId) || rawMaterialId <= 0) {
      throw new Error("Raw material is required.");
    }

    if (!productionBatchIds.length) {
      throw new Error("Please select at least one production batch.");
    }

    if (!reason) {
      throw new Error("Correction reason is required.");
    }

    if (reason.length > 5000) {
      throw new Error("Correction reason is too long.");
    }

    await client.query("BEGIN");

    /*
     * Lock selected production materials.
     * This prevents two users from correcting the same batch
     * at the same time.
     */
    const materialsResult = await client.query(
      `
        SELECT
          pb.id AS production_batch_id,
          pb.batch_no,
          pb.production_date,
          pb.product_id,
          pb.bom_id,
          pb.produced_quantity,
          pb.wastage_quantity,

          pm.id AS production_material_id,
          pm.raw_material_id,
          pm.standard_quantity,
          pm.actual_quantity,
          pm.unit,

          p.name AS product_name,
          p.code AS product_code,

          pbi.quantity AS corrected_quantity_per_unit,
          pbi.unit AS corrected_unit

        FROM production_batches pb

        INNER JOIN products p
          ON p.id = pb.product_id

        INNER JOIN production_materials pm
          ON pm.production_batch_id = pb.id
         AND pm.raw_material_id = $2

        INNER JOIN product_bom_items pbi
          ON pbi.bom_id = pb.bom_id
         AND pbi.raw_material_id = pm.raw_material_id

        WHERE pb.bom_id = $1
          AND pb.id = ANY($3::bigint[])

        FOR UPDATE OF pb, pm
      `,
      [bomId, rawMaterialId, productionBatchIds],
    );

    if (materialsResult.rows.length !== productionBatchIds.length) {
      throw new Error(
        "Some selected production batches are invalid or missing the selected raw material.",
      );
    }

    /*
     * Verify that none of the selected production materials
     * has already been corrected.
     */
    const materialIds = materialsResult.rows.map(
      (row) => Number(row.production_material_id),
    );

    const duplicateResult = await client.query(
      `
        SELECT
          pcci.production_material_id,
          pcci.production_batch_id,
          pcc.correction_no
        FROM production_consumption_correction_items pcci
        INNER JOIN production_consumption_corrections pcc
          ON pcc.id = pcci.correction_id
        WHERE pcci.production_material_id = ANY($1::bigint[])
      `,
      [materialIds],
    );

    if (duplicateResult.rows.length) {
      const duplicateBatches = duplicateResult.rows
        .map((row) => Number(row.production_batch_id))
        .map((batchId) => {
          const match = materialsResult.rows.find(
            (item) => Number(item.production_batch_id) === batchId,
          );

          return match?.batch_no || batchId;
        });

      throw new Error(
        `Already corrected production batch: ${[
          ...new Set(duplicateBatches),
        ].join(", ")}`,
      );
    }

    /*
     * Verify all selected batches use the same raw material/unit.
     */
    const units = [
      ...new Set(
        materialsResult.rows.map(
          (row) => String(row.unit || row.corrected_unit || ""),
        ),
      ),
    ];

    if (units.length > 1) {
      throw new Error(
        "Selected production batches have different material units. Correction cannot be applied together.",
      );
    }

    const firstRow = materialsResult.rows[0];

    const correctionItems = materialsResult.rows.map((row) => {
      // const producedQuantity = toNumber(row.produced_quantity);
      // const oldQuantity = toNumber(row.actual_quantity);
      // const correctedQuantityPerUnit = toNumber(
      //   row.corrected_quantity_per_unit,
      // );

      // const correctedQuantity = round3(
      //   producedQuantity * correctedQuantityPerUnit,
      // );

      const producedQuantity = toNumber(row.produced_quantity);
      const wastageQuantity = toNumber(row.wastage_quantity);

      const totalProductionQuantity = producedQuantity + wastageQuantity;

      const oldQuantity = toNumber(row.actual_quantity);

      const correctedQuantityPerUnit = toNumber(
        row.corrected_quantity_per_unit,
      );

      const correctedQuantity = round3(
        totalProductionQuantity * correctedQuantityPerUnit,
      );

      const adjustmentQuantity = round3(
        oldQuantity - correctedQuantity,
      );

      return {
        productionBatchId: Number(row.production_batch_id),
        productionMaterialId: Number(row.production_material_id),
        producedQuantity: round3(producedQuantity),
        oldQuantity: round3(oldQuantity),
        correctedQuantity,
        adjustmentQuantity,
        unit: row.unit || row.corrected_unit,
        batchNo: row.batch_no,
      };
    });

    const totalOldQuantity = round3(
      correctionItems.reduce(
        (sum, item) => sum + item.oldQuantity,
        0,
      ),
    );

    const totalCorrectedQuantity = round3(
      correctionItems.reduce(
        (sum, item) => sum + item.correctedQuantity,
        0,
      ),
    );

    const totalAdjustment = round3(
      correctionItems.reduce(
        (sum, item) => sum + item.adjustmentQuantity,
        0,
      ),
    );

    /*
     * No difference = no correction required.
     */
    if (totalAdjustment === 0) {
      throw new Error(
        "There is no stock difference for the selected production batches.",
      );
    }

    /*
     * If corrected consumption is higher than historical consumption,
     * we need additional OUT stock.
     *
     * Check current raw material stock before doing it.
     */
    if (totalAdjustment < 0) {
      const stockResult = await client.query(
        `
          SELECT
            COALESCE(
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
        [rawMaterialId],
      );

      const currentStock = toNumber(
        stockResult.rows[0]?.current_stock,
      );

      const requiredAdditionalStock = Math.abs(totalAdjustment);

      if (currentStock < requiredAdditionalStock) {
        throw new Error(
          `Insufficient raw material stock. Available: ${currentStock}, Required: ${requiredAdditionalStock}.`,
        );
      }
    }

    /*
     * Create correction header.
     */
    const correctionNo = generateCorrectionNo();

    const headerResult = await client.query(
      `
        INSERT INTO production_consumption_corrections (
          correction_no,
          bom_id,
          raw_material_id,
          old_quantity,
          corrected_quantity,
          difference_per_unit,
          reason,
          total_batches,
          total_adjustment_quantity,
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
        correctionNo,
        bomId,
        rawMaterialId,

        /*
         * Header quantity is per-unit quantity.
         * Historical standard_quantity is used only for reference.
         */
        round3(
          toNumber(firstRow.standard_quantity) /
            Math.max(toNumber(firstRow.produced_quantity), 1),
        ),

        round3(toNumber(firstRow.corrected_quantity_per_unit)),

        round3(
          toNumber(firstRow.standard_quantity) /
            Math.max(toNumber(firstRow.produced_quantity), 1) -
            toNumber(firstRow.corrected_quantity_per_unit),
        ),

        reason,
        correctionItems.length,
        Math.abs(totalAdjustment),
        userId,
      ],
    );

    const correction = headerResult.rows[0];

    /*
     * Insert correction items.
     */
    for (const item of correctionItems) {
      await client.query(
        `
          INSERT INTO production_consumption_correction_items (
            correction_id,
            production_batch_id,
            production_material_id,
            produced_quantity,
            old_quantity,
            corrected_quantity,
            adjustment_quantity
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )
        `,
        [
          correction.id,
          item.productionBatchId,
          item.productionMaterialId,
          item.producedQuantity,
          item.oldQuantity,
          item.correctedQuantity,
          item.adjustmentQuantity,
        ],
      );
    }

    /*
     * Create ONE stock movement for the complete correction.
     *
     * Positive totalAdjustment:
     *     old consumption > corrected consumption
     *     => material comes BACK to stock
     *     => IN
     *
     * Negative totalAdjustment:
     *     corrected consumption > old consumption
     *     => additional material consumed
     *     => OUT
     */
    const direction = totalAdjustment > 0 ? "IN" : "OUT";
    const movementQuantity = Math.abs(totalAdjustment);

    const movementResult = await client.query(
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
          $2,
          $3,
          'PRODUCTION_CONSUMPTION_CORRECTION',
          'PRODUCTION_CONSUMPTION_CORRECTION',
          $4,
          CURRENT_TIMESTAMP,
          $5,
          $6
        )
        RETURNING *
      `,
      [
        rawMaterialId,
        direction,
        movementQuantity,
        correction.id,
        `Consumption Correction ${correctionNo}: ${reason}`,
        userId,
      ],
    );

    await client.query("COMMIT");

    /*
     * Audit after successful transaction.
     */
    await createAuditLog({
      userId,
      module: "PRODUCTION_CONSUMPTION_CORRECTION",
      action: "CREATE",
      recordId: Number(correction.id),
      oldData: null,
      newData: {
        correction,
        items: correctionItems,
        stockMovement: movementResult.rows[0],
      },
      ipAddress,
    });

    return {
      success: true,
      correction: {
        ...correction,
        stockMovement: movementResult.rows[0],
        summary: {
          totalOldQuantity,
          totalCorrectedQuantity,
          adjustmentQuantity: movementQuantity,
          direction,
          totalBatches: correctionItems.length,
        },
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Correction History.
 */
const getCorrections = async (filters = {}) => {
  const params = [];
  const conditions = [];

  if (filters.fromDate) {
    params.push(filters.fromDate);
    conditions.push(`pcc.created_at::date >= $${params.length}`);
  }

  if (filters.toDate) {
    params.push(filters.toDate);
    conditions.push(`pcc.created_at::date <= $${params.length}`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await pool.query(
    `
      SELECT
        pcc.id,
        pcc.correction_no,
        pcc.bom_id,
        pcc.raw_material_id,

        pcc.old_quantity,
        pcc.corrected_quantity,
        pcc.difference_per_unit,

        pcc.reason,
        pcc.total_batches,
        pcc.total_adjustment_quantity,

        pcc.created_by,
        pcc.created_at,

        pb.name AS bom_name,

        p.name AS product_name,
        p.code AS product_code,

        rm.name AS raw_material_name,
        rm.code AS raw_material_code,
        rm.unit AS raw_material_unit,

        u.name AS created_by_name

      FROM production_consumption_corrections pcc

      INNER JOIN product_boms pb
        ON pb.id = pcc.bom_id

      INNER JOIN products p
        ON p.id = pb.product_id

      INNER JOIN raw_materials rm
        ON rm.id = pcc.raw_material_id

      LEFT JOIN users u
        ON u.id = pcc.created_by

      ${whereClause}

      ORDER BY pcc.created_at DESC, pcc.id DESC
    `,
    params,
  );

  return result.rows;
};

/**
 * Get one correction with all batches.
 */
const getCorrectionById = async (id) => {
  const correctionId = Number(id);

  if (!Number.isInteger(correctionId) || correctionId <= 0) {
    throw new Error("Invalid correction ID.");
  }

  const headerResult = await pool.query(
    `
      SELECT
        pcc.*,

        pb.name AS bom_name,

        p.name AS product_name,
        p.code AS product_code,
        p.unit AS product_unit,

        rm.name AS raw_material_name,
        rm.code AS raw_material_code,
        rm.unit AS raw_material_unit,

        u.name AS created_by_name

      FROM production_consumption_corrections pcc

      INNER JOIN product_boms pb
        ON pb.id = pcc.bom_id

      INNER JOIN products p
        ON p.id = pb.product_id

      INNER JOIN raw_materials rm
        ON rm.id = pcc.raw_material_id

      LEFT JOIN users u
        ON u.id = pcc.created_by

      WHERE pcc.id = $1
    `,
    [correctionId],
  );

  if (!headerResult.rows.length) {
    return null;
  }

  const itemsResult = await pool.query(
    `
      SELECT
        pcci.*,

        pb.batch_no,
        pb.production_date,
        pb.product_id,

        p.name AS product_name,
        p.code AS product_code,

        pm.raw_material_id,
        pm.unit,

        rm.name AS raw_material_name,
        rm.code AS raw_material_code

      FROM production_consumption_correction_items pcci

      INNER JOIN production_batches pb
        ON pb.id = pcci.production_batch_id

      INNER JOIN products p
        ON p.id = pb.product_id

      INNER JOIN production_materials pm
        ON pm.id = pcci.production_material_id

      INNER JOIN raw_materials rm
        ON rm.id = pm.raw_material_id

      WHERE pcci.correction_id = $1

      ORDER BY pb.production_date ASC, pb.id ASC
    `,
    [correctionId],
  );

  const movementResult = await pool.query(
    `
      SELECT *
      FROM stock_movements
      WHERE reference_type = 'PRODUCTION_CONSUMPTION_CORRECTION'
        AND reference_id = $1
      ORDER BY id ASC
    `,
    [correctionId],
  );

  return {
    ...headerResult.rows[0],
    items: itemsResult.rows,
    stockMovements: movementResult.rows,
  };
};

module.exports = {
  getOptions,
  getBomMaterials,
  findProductions,
  previewCorrection,
  applyCorrection,
  getCorrections,
  getCorrectionById,
};