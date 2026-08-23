const pool = require("../config/db");
const { createAuditLog } = require("./auditLogService");

const generateBatchNo = async (client) => {
  const { rows } = await client.query(`
    SELECT
      COALESCE(
        MAX(
          CASE
            WHEN batch_no ~ '^PB-[0-9]+$'
            THEN CAST(SUBSTRING(batch_no FROM 4) AS BIGINT)
            ELSE 0
          END
        ),
        0
      ) + 1 AS next_no
    FROM production_batches
  `);

  return `PB-${String(rows[0].next_no).padStart(4, "0")}`;
};

const getProducts = async () => {
  const { rows } = await pool.query(`
    SELECT
      id,
      code,
      name,
      unit,
      is_active
    FROM products
    WHERE is_active = TRUE
    ORDER BY name ASC
  `);

  return rows;
};

const getProductions = async () => {
  const { rows } = await pool.query(`
    SELECT
      pb.id,
      pb.batch_no,
      pb.product_id,

      p.code AS product_code,
      p.name AS product_name,
      p.unit AS product_unit,

      pb.production_date::text AS production_date,
      pb.planned_quantity,
      pb.produced_quantity,
      pb.wastage_quantity,
      pb.shift,
      pb.machine,
      pb.supervisor,
      pb.remarks,

      pb.created_by,
      pb.created_at,
      pb.updated_at

    FROM production_batches pb

    INNER JOIN products p
      ON p.id = pb.product_id

    ORDER BY
      pb.production_date DESC,
      pb.id DESC
  `);

  return rows;
};

const getProductionById = async (id) => {
  const { rows } = await pool.query(
    `
      SELECT
        pb.id,
        pb.batch_no,
        pb.product_id,

        pb.bom_id,

        b.name AS bom_name,
        b.is_active AS bom_is_active,

        p.code AS product_code,
        p.name AS product_name,
        p.unit AS product_unit,

        pb.production_date::text AS production_date,
        pb.planned_quantity,
        pb.produced_quantity,
        pb.wastage_quantity,
        pb.wastage_quantity AS damaged_quantity,
        pb.shift,
        pb.machine,
        pb.supervisor,
        pb.remarks,

        pb.created_by,
        pb.created_at,
        pb.updated_at,

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', pm.id,
                'raw_material_id', pm.raw_material_id,
                'raw_material_name', rm.name,
                'raw_material_code', rm.code,
                'standard_quantity', pm.standard_quantity,
                'actual_quantity', pm.actual_quantity,
                'variance_quantity', pm.variance_quantity,
                'unit', pm.unit
              )
              ORDER BY pm.id
            )
            FROM production_materials pm

            INNER JOIN raw_materials rm
              ON rm.id = pm.raw_material_id

            WHERE pm.production_batch_id = pb.id
          ),
          '[]'::json
        ) AS materials,

        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', pw.id,
                'quantity', pw.quantity,
                'reason', pw.reason,
                'remarks', pw.remarks
              )
              ORDER BY pw.id
            )
            FROM production_wastage pw

            WHERE pw.production_batch_id = pb.id
          ),
          '[]'::json
        ) AS wastage_records

      FROM production_batches pb

      INNER JOIN products p
        ON p.id = pb.product_id

      INNER JOIN product_boms b
        ON b.id = pb.bom_id

      WHERE pb.id = $1
    `,
    [id],
  );

  return rows[0] || null;
};

const validateProduct = async (client, productId) => {
  const { rows } = await client.query(
    `
      SELECT
        id,
        code,
        name,
        unit,
        is_active
      FROM products
      WHERE id = $1
    `,
    [productId],
  );

  if (!rows.length) {
    throw new Error("Product not found.");
  }

  if (!rows[0].is_active) {
    throw new Error("Selected product is inactive.");
  }

  return rows[0];
};

const getRawMaterialStock = async (client, rawMaterialId) => {
  const { rows } = await client.query(
    `
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN direction = 'IN'
                THEN quantity

              WHEN direction = 'OUT'
                THEN -quantity

              ELSE 0
            END
          ),
          0
        ) AS current_stock

      FROM stock_movements

      WHERE
        item_type = 'RAW_MATERIAL'
        AND item_id = $1
    `,
    [rawMaterialId],
  );

  return Number(rows[0]?.current_stock || 0);
};

const getProductStock = async (client, productId) => {
  const { rows } = await client.query(
    `
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN direction = 'IN'
                THEN quantity

              WHEN direction = 'OUT'
                THEN -quantity

              ELSE 0
            END
          ),
          0
        ) AS current_stock

      FROM stock_movements

      WHERE
        item_type = 'PRODUCT'
        AND item_id = $1
    `,
    [productId],
  );

  return Number(rows[0]?.current_stock || 0);
};

const createProduction = async (payload, {userId = null, ipAddress}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const productId = Number(payload.product_id);

    const bomId = payload.bom_id ? Number(payload.bom_id) : null;

    const producedQuantity = Number(payload.produced_quantity);

    const damagedQuantity = Number(payload.damaged_quantity || 0);

    const plannedQuantity = producedQuantity + damagedQuantity;

    const materials = Array.isArray(payload.materials) ? payload.materials : [];

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new Error("Valid product is required.");
    }

    if (!Number.isFinite(producedQuantity) || producedQuantity <= 0) {
      throw new Error("Produced quantity must be greater than zero.");
    }

    if (!Number.isFinite(damagedQuantity) || damagedQuantity < 0) {
      throw new Error("Damaged quantity cannot be negative.");
    }

    if (!bomId) {
      throw new Error("BOM is required.");
    }

    if (!materials.length) {
      throw new Error("Production raw materials are required.");
    }

    const product = await validateProduct(client, productId);

    const bomResult = await client.query(
      `
        SELECT
          id,
          product_id,
          name
        FROM product_boms
        WHERE
          id = $1
          AND product_id = $2
          AND is_active = TRUE
      `,
      [bomId, productId],
    );

    if (!bomResult.rows.length) {
      throw new Error("Selected BOM is invalid or inactive.");
    }

    const validatedMaterials = [];

    for (const material of materials) {
      const rawMaterialId = Number(material.raw_material_id);

      const standardQuantity = Number(material.standard_quantity);

      const actualQuantity = Number(material.actual_quantity);

      if (!Number.isInteger(rawMaterialId) || rawMaterialId <= 0) {
        throw new Error("Invalid raw material.");
      }

      if (!Number.isFinite(standardQuantity) || standardQuantity < 0) {
        throw new Error("Invalid standard material quantity.");
      }

      if (!Number.isFinite(actualQuantity) || actualQuantity <= 0) {
        throw new Error("Actual material quantity must be greater than zero.");
      }

      const materialResult = await client.query(
        `
          SELECT
            id,
            code,
            name,
            unit,
            is_active
          FROM raw_materials
          WHERE id = $1
        `,
        [rawMaterialId],
      );

      if (!materialResult.rows.length) {
        throw new Error(`Raw material ${rawMaterialId} not found.`);
      }

      const rawMaterial = materialResult.rows[0];

      if (!rawMaterial.is_active) {
        throw new Error(`Raw material "${rawMaterial.name}" is inactive.`);
      }

      const currentStock = await getRawMaterialStock(client, rawMaterialId);

      if (currentStock < actualQuantity) {
        throw new Error(
          `Insufficient stock for ${rawMaterial.name}. ` +
            `Required ${actualQuantity} ${rawMaterial.unit}, ` +
            `available ${currentStock} ${rawMaterial.unit}.`,
        );
      }

      validatedMaterials.push({
        rawMaterial,
        standardQuantity,
        actualQuantity,
        unit: material.unit || rawMaterial.unit,
      });
    }

    const batchNo = await generateBatchNo(client);
    const wastageQuantity = damagedQuantity;

    const batchResult = await client.query(
      `
        INSERT INTO production_batches (
          batch_no,
          product_id,
          production_date,
          planned_quantity,
          produced_quantity,
          wastage_quantity,
          shift,
          machine,
          supervisor,
          remarks,
          bom_id,
          created_by
        )
        VALUES (
          $1,
          $2,
          COALESCE($3::date, CURRENT_DATE),
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12
        )
        RETURNING *
      `,
      [
        batchNo,
        productId,
        payload.production_date || null,
        plannedQuantity,

        producedQuantity,
        wastageQuantity,

        payload.shift || null,
        payload.machine || null,
        payload.supervisor || null,
        payload.remarks || null,
        bomId,
        userId || null,
      ],
    );

    const batch = batchResult.rows[0];

    for (const material of validatedMaterials) {
      await client.query(
        `
          INSERT INTO production_materials (
            production_batch_id,
            raw_material_id,
            standard_quantity,
            actual_quantity,
            unit
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          batch.id,
          material.rawMaterial.id,
          material.standardQuantity,
          material.actualQuantity,
          material.unit,
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
            'PRODUCTION_CONSUMPTION',
            'PRODUCTION_BATCH',
            $3,
            NOW(),
            $4,
            $5
          )
        `,
        [
          material.rawMaterial.id,
          material.actualQuantity,
          batch.id,
          `Raw material consumed for ${batch.batch_no}`,
          userId || null,
        ],
      );
    }

    if (wastageQuantity > 0) {
      await client.query(
        `
          INSERT INTO production_wastage (
            production_batch_id,
            quantity,
            reason,
            remarks
          )
          VALUES ($1, $2, $3, $4)
        `,
        [
          batch.id,
          wastageQuantity,
          "Production Damage",
          "Recorded as damaged quantity during production.",
        ],
      );
    }

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
          'IN',
          $2,
          'PRODUCTION_OUTPUT',
          'PRODUCTION_BATCH',
          $3,
          NOW(),
          $4,
          $5
        )
      `,
      [
        product.id,
        producedQuantity,
        batch.id,
        `Finished stock received from production ${batch.batch_no}`,
        userId || null,
      ],
    );

    await client.query("COMMIT");

    const newProduction = await getProductionById(batch.id);

    await createAuditLog({
      userId: userId || null,
      module: "PRODUCTION",
      action: "CREATE",
      recordId: Number(batch.id),
      oldData: null,
      newData: newProduction,
      ipAddress: ipAddress || null,
    });

    return newProduction;
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

const updateProduction = async (id, payload, {userId = null, ipAddress}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existingResult = await client.query(
      `
        SELECT *
        FROM production_batches
        WHERE id = $1
        FOR UPDATE
      `,
      [id],
    );

    if (!existingResult.rows.length) {
      throw new Error("Production batch not found.");
    }

    const existingBatch = existingResult.rows[0];

    const oldProduction = await getProductionById(id);

    const productId = Number(payload.product_id);

    const bomId = payload.bom_id
      ? Number(payload.bom_id)
      : Number(existingBatch.bom_id);

    const producedQuantity = Number(payload.produced_quantity);

    const damagedQuantity = Number(payload.damaged_quantity || 0);

    /*
     * Internal calculated planned quantity.
     */
    const plannedQuantity = producedQuantity + damagedQuantity;

    const materials = Array.isArray(payload.materials) ? payload.materials : [];

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new Error("Valid product is required.");
    }

    if (!Number.isFinite(producedQuantity) || producedQuantity <= 0) {
      throw new Error("Produced quantity must be greater than zero.");
    }

    if (!Number.isFinite(damagedQuantity) || damagedQuantity < 0) {
      throw new Error("Damaged quantity cannot be negative.");
    }

    if (!Number.isInteger(bomId) || bomId <= 0) {
      throw new Error("BOM is required.");
    }

    if (!materials.length) {
      throw new Error("Production raw materials are required.");
    }

    const product = await validateProduct(client, productId);

    const bomResult = await client.query(
      `
        SELECT
          id,
          product_id,
          name
        FROM product_boms
        WHERE
          id = $1
          AND product_id = $2
          AND is_active = TRUE
      `,
      [bomId, productId],
    );

    if (!bomResult.rows.length) {
      throw new Error("Selected BOM is invalid or inactive.");
    }

    const oldMaterialsResult = await client.query(
      `
          SELECT
            raw_material_id,
            actual_quantity,
            standard_quantity,
            unit
          FROM production_materials
          WHERE production_batch_id = $1
        `,
      [id],
    );

    const oldMaterials = oldMaterialsResult.rows;

    const oldMaterialMap = new Map(
      oldMaterials.map((material) => [
        Number(material.raw_material_id),
        {
          actualQuantity: Number(material.actual_quantity),
          standardQuantity: Number(material.standard_quantity),
          unit: material.unit,
        },
      ]),
    );

    const newMaterialMap = new Map();

    const validatedMaterials = [];

    for (const material of materials) {
      const rawMaterialId = Number(material.raw_material_id);

      const standardQuantity = Number(material.standard_quantity);

      const actualQuantity = Number(material.actual_quantity);

      if (!Number.isInteger(rawMaterialId) || rawMaterialId <= 0) {
        throw new Error("Invalid raw material.");
      }

      if (!Number.isFinite(standardQuantity) || standardQuantity < 0) {
        throw new Error("Invalid standard material quantity.");
      }

      if (!Number.isFinite(actualQuantity) || actualQuantity <= 0) {
        throw new Error("Actual material quantity must be greater than zero.");
      }

      if (newMaterialMap.has(rawMaterialId)) {
        throw new Error("Duplicate raw material in production materials.");
      }

      const materialResult = await client.query(
        `
            SELECT
              id,
              code,
              name,
              unit,
              is_active
            FROM raw_materials
            WHERE id = $1
          `,
        [rawMaterialId],
      );

      if (!materialResult.rows.length) {
        throw new Error(`Raw material ${rawMaterialId} not found.`);
      }

      const rawMaterial = materialResult.rows[0];

      if (!rawMaterial.is_active) {
        throw new Error(`Raw material "${rawMaterial.name}" is inactive.`);
      }

      const validated = {
        rawMaterial,
        standardQuantity,
        actualQuantity,
        unit: material.unit || rawMaterial.unit,
      };

      validatedMaterials.push(validated);

      newMaterialMap.set(rawMaterialId, validated);
    }

    const allRawMaterialIds = new Set([
      ...oldMaterialMap.keys(),
      ...newMaterialMap.keys(),
    ]);

    for (const rawMaterialId of allRawMaterialIds) {
      const oldQuantity =
        oldMaterialMap.get(rawMaterialId)?.actualQuantity || 0;

      const newQuantity =
        newMaterialMap.get(rawMaterialId)?.actualQuantity || 0;

      const difference = newQuantity - oldQuantity;

      if (Math.abs(difference) < 0.000001) {
        continue;
      }

      const materialResult = await client.query(
        `
            SELECT
              id,
              name,
              unit,
              is_active
            FROM raw_materials
            WHERE id = $1
          `,
        [rawMaterialId],
      );

      if (!materialResult.rows.length) {
        throw new Error("Raw material not found.");
      }

      const rawMaterial = materialResult.rows[0];

      if (!rawMaterial.is_active) {
        throw new Error(`Raw material "${rawMaterial.name}" is inactive.`);
      }

      if (difference > 0) {
        const currentStock = await getRawMaterialStock(client, rawMaterialId);

        if (currentStock < difference) {
          throw new Error(
            `Insufficient stock for ${rawMaterial.name}. ` +
              `Additional ${difference} ${rawMaterial.unit} required, ` +
              `available ${currentStock} ${rawMaterial.unit}.`,
          );
        }

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
              'PRODUCTION_EDIT_ADJUSTMENT',
              'PRODUCTION_BATCH',
              $3,
              NOW(),
              $4,
              $5
            )
          `,
          [
            rawMaterialId,
            difference,
            id,
            `Additional raw material consumption adjustment for production PB-${id}.`,
            userId || null,
          ],
        );
      } else {
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
              'PRODUCTION_EDIT_ADJUSTMENT',
              'PRODUCTION_BATCH',
              $3,
              NOW(),
              $4,
              $5
            )
          `,
          [
            rawMaterialId,
            Math.abs(difference),
            id,
            `Raw material consumption correction for production PB-${id}.`,
            userId || null,
          ],
        );
      }
    }

    const oldProductId = Number(existingBatch.product_id);

    const oldProducedQuantity = Number(existingBatch.produced_quantity);

    if (oldProductId === productId) {
      const finishedStockDifference = producedQuantity - oldProducedQuantity;

      if (Math.abs(finishedStockDifference) >= 0.000001) {
        if (finishedStockDifference > 0) {
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
                'IN',
                $2,
                'PRODUCTION_EDIT_ADJUSTMENT',
                'PRODUCTION_BATCH',
                $3,
                NOW(),
                $4,
                $5
              )
            `,
            [
              productId,
              finishedStockDifference,
              id,
              `Additional finished stock from production edit PB-${id}.`,
              userId || null,
            ],
          );
        } else {
          const currentFinishedStock = await getProductStock(client, productId);

          const quantityToRemove = Math.abs(finishedStockDifference);

          if (currentFinishedStock < quantityToRemove) {
            throw new Error(
              `Cannot reduce produced quantity. ` +
                `${product.name} has only ${currentFinishedStock} ${product.unit} ` +
                `available in finished stock, but ${quantityToRemove} ${product.unit} ` +
                `must be removed.`,
            );
          }

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
                'OUT',
                $2,
                'PRODUCTION_EDIT_ADJUSTMENT',
                'PRODUCTION_BATCH',
                $3,
                NOW(),
                $4,
                $5
              )
            `,
            [
              productId,
              quantityToRemove,
              id,
              `Finished stock correction from production edit PB-${id}.`,
              userId || null,
            ],
          );
        }
      }
    } else {
      const oldFinishedStock = await getProductStock(client, oldProductId);

      if (oldFinishedStock < oldProducedQuantity) {
        throw new Error(
          `Cannot change product. Existing finished stock for the old product ` +
            `is ${oldFinishedStock}, but ${oldProducedQuantity} must be removed.`,
        );
      }
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
            'OUT',
            $2,
            'PRODUCTION_EDIT_ADJUSTMENT',
            'PRODUCTION_BATCH',
            $3,
            NOW(),
            $4,
            $5
          )
        `,
        [
          oldProductId,
          oldProducedQuantity,
          id,
          `Finished stock reversal because production product changed for PB-${id}.`,
          userId || null,
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
            'PRODUCT',
            $1,
            'IN',
            $2,
            'PRODUCTION_EDIT_ADJUSTMENT',
            'PRODUCTION_BATCH',
            $3,
            NOW(),
            $4,
            $5
          )
        `,
        [
          productId,
          producedQuantity,
          id,
          `Finished stock received after production product change for PB-${id}.`,
          userId || null,
        ],
      );
    }
    const wastageQuantity = damagedQuantity;

    await client.query(
      `
        UPDATE production_batches
        SET
          product_id = $1,

          production_date =
            COALESCE(
              $2::date,
              production_date
            ),

          planned_quantity = $3,

          produced_quantity = $4,
          wastage_quantity = $5,

          shift = $6,
          machine = $7,
          supervisor = $8,
          remarks = $9,
          bom_id = $10,
          updated_at = NOW()

        WHERE id = $11
      `,
      [
        productId,
        payload.production_date || null,

        plannedQuantity,
        producedQuantity,
        wastageQuantity,

        payload.shift || null,
        payload.machine || null,
        payload.supervisor || null,
        payload.remarks || null,
        bomId,
        id,
      ],
    );

    await client.query(
      `
        DELETE FROM production_materials
        WHERE production_batch_id = $1
      `,
      [id],
    );

    for (const material of validatedMaterials) {
      await client.query(
        `
          INSERT INTO production_materials (
            production_batch_id,
            raw_material_id,
            standard_quantity,
            actual_quantity,
            unit
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          id,
          material.rawMaterial.id,
          material.standardQuantity,
          material.actualQuantity,
          material.unit,
        ],
      );
    }

    await client.query(
      `
        DELETE FROM production_wastage
        WHERE production_batch_id = $1
      `,
      [id],
    );

    if (wastageQuantity > 0) {
      await client.query(
        `
          INSERT INTO production_wastage (
            production_batch_id,
            quantity,
            reason,
            remarks
          )
          VALUES ($1, $2, $3, $4)
        `,
        [
          id,
          wastageQuantity,
          "Production Damage",
          "Recorded as damaged quantity during production.",
        ],
      );
    }

    await client.query("COMMIT");
    
    const newProduction = await getProductionById(id);

    await createAuditLog({
      userId: userId || null,
      module: "PRODUCTION",
      action: "UPDATE",
      recordId: Number(id),
      oldData: oldProduction,
      newData: newProduction,
      ipAddress: ipAddress || null,
    });

    return newProduction;
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

const deleteProduction = async (id, {userId = null, ipAddress}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const batchResult = await client.query(
      `
          SELECT *
          FROM production_batches
          WHERE id = $1
          FOR UPDATE
        `,
      [id],
    );

    if (!batchResult.rows.length) {
      throw new Error("Production batch not found.");
    }

    const batch = batchResult.rows[0];
    const oldProduction = await getProductionById(id);

    const materialsResult = await client.query(
      `
          SELECT
            raw_material_id,
            actual_quantity
          FROM production_materials
          WHERE production_batch_id = $1
        `,
      [id],
    );

    for (const material of materialsResult.rows) {
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
            'PRODUCTION_DELETE_REVERSAL',
            'PRODUCTION_BATCH',
            $3,
            NOW(),
            $4,
            $5
          )
        `,
        [
          material.raw_material_id,
          material.actual_quantity,
          id,
          `Raw material stock restored after deleting production ${batch.batch_no}.`,
          userId || null,
        ],
      );
    }

    const currentFinishedStock = await getProductStock(
      client,
      batch.product_id,
    );

    const producedQuantity = Number(batch.produced_quantity);

    if (currentFinishedStock < producedQuantity) {
      throw new Error(
        `Cannot delete ${batch.batch_no}. ` +
          `Finished stock has only ${currentFinishedStock} available, ` +
          `but ${producedQuantity} units from this production are required to reverse.`,
      );
    }

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
          'OUT',
          $2,
          'PRODUCTION_DELETE_REVERSAL',
          'PRODUCTION_BATCH',
          $3,
          NOW(),
          $4,
          $5
        )
      `,
      [
        batch.product_id,
        producedQuantity,
        id,
        `Finished stock reversed after deleting production ${batch.batch_no}.`,
        userId || null,
      ],
    );

    await client.query(
      `
        DELETE FROM production_wastage
        WHERE production_batch_id = $1
      `,
      [id],
    );

    await client.query(
      `
        DELETE FROM production_materials
        WHERE production_batch_id = $1
      `,
      [id],
    );

    await client.query(
      `
        DELETE FROM production_batches
        WHERE id = $1
      `,
      [id],
    );

    await client.query("COMMIT");

    await createAuditLog({
      userId: userId || null,
      module: "PRODUCTION",
      action: "DELETE",
      recordId: Number(id),
      oldData: oldProduction,
      newData: null,
      ipAddress: ipAddress || null,
    });

    return {
      id,
      message: "Production batch deleted successfully.",
    };
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getProducts,
  getProductions,
  getProductionById,
  createProduction,
  updateProduction,
  deleteProduction,
};
