const ConsumptionCorrectionsPage = (() => {
  const state = {
    products: [],
    boms: [],
    rawMaterials: [],

    productions: [],
    selectedIds: new Set(),

    preview: null,

    corrections: [],
  };

  const elements = {};

  const qs = (selector) => document.querySelector(selector);

  const getToken = () => localStorage.getItem("accessToken");

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const apiRequest = async (url, options = {}) => {
    const token = getToken();

    const response = await fetch(url, {
      ...options,

      headers: {
        "Content-Type": "application/json",

        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),

        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      localStorage.removeItem("accessToken");

      window.location.replace("/login");

      throw new Error("Session expired.");
    }

    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          payload?.error ||
          `Request failed with status ${response.status}.`,
      );
    }

    return payload;
  };

  const showToast = (message, type = "success") => {
    const container = elements.toastContainer;

    if (!container) return;

    const icons = {
      success: "fa-circle-check",

      error: "fa-circle-exclamation",

      warning: "fa-triangle-exclamation",

      info: "fa-circle-info",
    };

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;

    toast.innerHTML = `

      <i class="fa-solid ${icons[type] || icons.success} toast-icon"></i>

      <span class="toast-message">
        ${escapeHtml(message)}
      </span>

      <button
        type="button"
        class="toast-close"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>

    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    const removeToast = () => {
      toast.classList.remove("show");

      setTimeout(() => {
        toast.remove();
      }, 250);
    };

    toast.querySelector(".toast-close")?.addEventListener("click", removeToast);

    setTimeout(removeToast, 3500);
  };

  const formatNumber = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 3,
    });

  const formatSignedNumber = (value) => {
    const number = Number(value || 0);

    if (number > 0) {
      return `+${formatNumber(number)}`;
    }

    if (number < 0) {
      return `-${formatNumber(Math.abs(number))}`;
    }

    return "0";
  };

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  /* =========================================================
   * LOAD OPTIONS
   * ========================================================= */

  const loadOptions = async () => {
    try {
      const payload = await apiRequest(
        "/api/production/consumption-corrections/options",
      );

      state.products = payload?.boms
        ? [
            ...new Map(
              payload.boms.map((bom) => [
                Number(bom.product_id),
                {
                  id: Number(bom.product_id),

                  name: bom.product_name || "",

                  code: bom.product_code || "",
                },
              ]),
            ).values(),
          ]
        : [];

      state.boms = Array.isArray(payload?.boms) ? payload.boms : [];

      state.rawMaterials = Array.isArray(payload?.rawMaterials)
        ? payload.rawMaterials
        : [];

      populateProducts();
    } catch (error) {
      console.error("Failed to load correction options:", error);

      showToast(error.message, "error");
    }
  };

  const populateProducts = () => {
    elements.product.innerHTML = `

      <option value="">
        Select Product
      </option>

      ${state.products
        .map(
          (product) => `

            <option
              value="${product.id}"
            >
              ${escapeHtml(product.name)}
              ${product.code ? ` — ${escapeHtml(product.code)}` : ""}
            </option>

          `,
        )
        .join("")}

    `;
  };

  const populateBoms = () => {
    const productId = Number(elements.product.value);

    state.selectedIds.clear();

    elements.bom.disabled = !productId;

    elements.material.disabled = true;

    elements.bom.innerHTML = `

      <option value="">
        Select Product Design
      </option>

      ${
        productId
          ? state.boms
              .filter(
                (bom) =>
                  Number(bom.product_id) === productId &&
                  Boolean(bom.is_active ?? true),
              )
              .map(
                (bom) => `

                  <option
                    value="${bom.id}"
                  >
                    ${escapeHtml(bom.bom_name || bom.name || "Product Design")}
                  </option>

                `,
              )
              .join("")
          : ""
      }

    `;

    resetCorrectionArea();
  };

  const populateMaterials = async () => {
    const bomId = Number(elements.bom.value);

    elements.material.disabled = true;

    elements.material.innerHTML = `

      <option value="">
        Loading Raw Materials...
      </option>

    `;

    if (!bomId) {
      elements.material.innerHTML = `

        <option value="">
          Select Raw Material
        </option>

      `;

      return;
    }

    try {
      const payload = await apiRequest(
        `/api/production/consumption-corrections/bom/${bomId}/materials`,
      );

      const materials = Array.isArray(payload?.materials)
        ? payload.materials
        : [];

      elements.material.innerHTML = `

        <option value="">
          Select Raw Material
        </option>

        ${materials
          .map(
            (material) => `

              <option
                value="${material.raw_material_id}"
              >
                ${escapeHtml(material.raw_material_name)}
                ${
                  material.raw_material_code
                    ? ` — ${escapeHtml(material.raw_material_code)}`
                    : ""
                }
              </option>

            `,
          )
          .join("")}

      `;

      elements.material.disabled = !materials.length;
    } catch (error) {
      elements.material.innerHTML = `

        <option value="">
          Unable to load materials
        </option>

      `;

      showToast(error.message, "error");
    }
  };

  /* =========================================================
   * FIND PRODUCTIONS
   * ========================================================= */

  const findProductions = async () => {
    const bomId = Number(elements.bom.value);

    const rawMaterialId = Number(elements.material.value);

    if (!bomId) {
      showToast("Please select Product Design / BOM.", "warning");

      return;
    }

    if (!rawMaterialId) {
      showToast("Please select Raw Material.", "warning");

      return;
    }

    elements.findButton.disabled = true;

    elements.findButton.innerHTML = `

      <i class="fa-solid fa-spinner fa-spin"></i>
      Finding...

    `;

    try {
      const payload = await apiRequest(
        "/api/production/consumption-corrections/find",
        {
          method: "POST",

          body: JSON.stringify({
            bomId,
            rawMaterialId,

            fromDate: elements.fromDate.value || null,

            toDate: elements.toDate.value || null,
          }),
        },
      );

      state.productions = Array.isArray(payload?.productions)
        ? payload.productions
        : [];

      state.selectedIds.clear();

      renderCorrectionDetails();

      renderProductions();

      elements.productionsCard.hidden = false;

      updateSelectionSummary();
    } catch (error) {
      showToast(error.message, "error");

      state.productions = [];

      elements.productionsCard.hidden = true;
    } finally {
      elements.findButton.disabled = false;

      elements.findButton.innerHTML = `

        <i class="fa-solid fa-magnifying-glass"></i>
        Find Productions

      `;
    }
  };

  /* =========================================================
   * CORRECTION DETAILS
   * ========================================================= */

  const renderCorrectionDetails = () => {
    if (!state.productions.length) {
      elements.detailsCard.hidden = true;

      return;
    }

    const first = state.productions[0];

    elements.productName.textContent = first.product_name || "—";

    elements.bomName.textContent = first.bom_name || "—";

    elements.materialName.textContent = first.raw_material_name || "—";

    const totalProductionQuantity = Number(first.produced_quantity || 0) + Number(first.wastage_quantity || 0);

    const standard = Number(first.standard_quantity || 0);

    const oldPerUnit = totalProductionQuantity > 0 ? standard / totalProductionQuantity : standard;

    const corrected = Number(first.current_bom_quantity || 0);

    const difference = oldPerUnit - corrected;

    elements.oldQty.textContent = `${formatNumber(oldPerUnit)} ${
      first.material_unit || first.current_bom_unit || ""
    }`;

    elements.newQty.textContent = `${formatNumber(corrected)} ${
      first.material_unit || first.current_bom_unit || ""
    }`;

    elements.difference.textContent = `${formatSignedNumber(difference)} ${
      first.material_unit || first.current_bom_unit || ""
    }`;

    elements.detailsCard.hidden = false;
  };

  /* =========================================================
   * PRODUCTION TABLE
   * ========================================================= */

  const renderProductions = () => {
    const rows = state.productions;

    if (!rows.length) {
      elements.productionsBody.innerHTML = `

        <tr>

          <td colspan="9">

            <div class="materials-placeholder">

              <i class="fa-solid fa-circle-info"></i>

              No affected production batches found.

            </div>

          </td>

        </tr>

      `;

      return;
    }

    elements.productionsBody.innerHTML = rows
      .map((row) => {
        const id = Number(row.production_batch_id);

        const alreadyCorrected = Boolean(row.already_corrected);

        const selected = state.selectedIds.has(id);

        const adjustment = Number(row.adjustment_quantity || 0);

        const unit = row.material_unit || row.current_bom_unit || "";

        let adjustmentHtml;

        if (adjustment > 0) {
          adjustmentHtml = `

                <span class="variance-positive">
                  +${formatNumber(adjustment)} ${escapeHtml(unit)}
                </span>

                <small>
                  Stock IN
                </small>

              `;
        } else if (adjustment < 0) {
          adjustmentHtml = `

                <span class="variance-negative">
                  -${formatNumber(Math.abs(adjustment))} ${escapeHtml(unit)}
                </span>

                <small>
                  Stock OUT
                </small>

              `;
        } else {
          adjustmentHtml = `

                <span class="variance-zero">
                  0 ${escapeHtml(unit)}
                </span>

              `;
        }

        return `

              <tr
                class="${alreadyCorrected ? "correction-row-disabled" : ""}"
              >

                <td class="checkbox-column">

                  <input
                    type="checkbox"
                    class="correction-checkbox"
                    data-id="${id}"
                    ${selected ? "checked" : ""}
                    ${alreadyCorrected ? "disabled" : ""}
                  />

                </td>


                <td>

                  <span class="batch-no">
                    ${escapeHtml(row.batch_no || `PB-${id}`)}
                  </span>

                </td>


                <td>
                  ${escapeHtml(formatDate(row.production_date))}
                </td>


                <td>

                  <div class="product-wise-name">

                    <div class="product-row-icon">
                      <i class="fa-solid fa-cube"></i>
                    </div>

                    <div>

                      <div class="product-name">
                        ${escapeHtml(row.product_name || "—")}
                      </div>

                      <div class="product-code">
                        ${escapeHtml(row.product_code || "—")}
                      </div>

                    </div>

                  </div>

                </td>


                <td>

                  ${formatNumber(row.produced_quantity)}

                  <span class="quantity-unit">
                    ${escapeHtml(row.product_unit || "NOS")}
                  </span>

                </td>


                <td>

                  ${formatNumber(row.actual_quantity)}

                  <span class="quantity-unit">
                    ${escapeHtml(unit)}
                  </span>

                </td>


                <td>

                  ${formatNumber(row.corrected_quantity)}

                  <span class="quantity-unit">
                    ${escapeHtml(unit)}
                  </span>

                </td>


                <td>

                  <div class="correction-adjustment">
                    ${adjustmentHtml}
                  </div>

                </td>


                <td>

                  ${
                    alreadyCorrected
                      ? `

                        <span class="shift-badge correction-status-corrected">
                          <i class="fa-solid fa-check"></i>
                          Corrected
                        </span>

                      `
                      : `

                        <span class="shift-badge correction-status-pending">
                          Pending
                        </span>

                      `
                  }

                </td>

              </tr>

            `;
      })
      .join("");
  };

  /* =========================================================
   * SELECTION
   * ========================================================= */

  const toggleSelection = (id, checked) => {
    if (checked) {
      state.selectedIds.add(Number(id));
    } else {
      state.selectedIds.delete(Number(id));
    }

    updateSelectionSummary();
  };

  const selectAll = () => {
    state.productions.forEach((row) => {
      if (row.already_corrected) {
        return;
      }

      state.selectedIds.add(Number(row.production_batch_id));
    });

    renderProductions();

    updateSelectionSummary();
  };

  const clearSelection = () => {
    state.selectedIds.clear();

    renderProductions();

    updateSelectionSummary();
  };

  const updateSelectionSummary = () => {
    const selectedRows = state.productions.filter((row) =>
      state.selectedIds.has(Number(row.production_batch_id)),
    );

    const totalProduced = selectedRows.reduce(
      (total, row) => total + Number(row.produced_quantity || 0),

      0,
    );

    const oldConsumption = selectedRows.reduce(
      (total, row) => total + Number(row.actual_quantity || 0),

      0,
    );

    const correctedConsumption = selectedRows.reduce(
      (total, row) => total + Number(row.corrected_quantity || 0),

      0,
    );

    const adjustment = oldConsumption - correctedConsumption;

    elements.selectedBatchCount.textContent = selectedRows.length;

    elements.selectedProducedQty.textContent = formatNumber(totalProduced);

    elements.selectedOldConsumption.textContent = formatNumber(oldConsumption);

    elements.selectedCorrectedConsumption.textContent =
      formatNumber(correctedConsumption);

    elements.selectedAdjustment.textContent =
      adjustment > 0
        ? `+${formatNumber(adjustment)} IN`
        : adjustment < 0
          ? `-${formatNumber(Math.abs(adjustment))} OUT`
          : "0";

    elements.correctionSummary.hidden = selectedRows.length === 0;

    elements.applyCard.hidden = selectedRows.length === 0;

    elements.finalBatchCount.textContent = selectedRows.length;

    elements.finalOldConsumption.textContent = formatNumber(oldConsumption);

    elements.finalCorrectedConsumption.textContent =
      formatNumber(correctedConsumption);

    if (adjustment > 0) {
      elements.finalStockMovement.textContent = `${formatNumber(
        adjustment,
      )} IN`;
    } else if (adjustment < 0) {
      elements.finalStockMovement.textContent = `${formatNumber(
        Math.abs(adjustment),
      )} OUT`;
    } else {
      elements.finalStockMovement.textContent = "No Adjustment";
    }

    const selectable = state.productions.filter(
      (row) => !row.already_corrected,
    );

    elements.selectAllCheckbox.checked =
      selectable.length > 0 &&
      selectable.every((row) =>
        state.selectedIds.has(Number(row.production_batch_id)),
      );
  };

  /* =========================================================
   * PREVIEW
   * ========================================================= */

  const generatePreview = async () => {
    const selectedIds = Array.from(state.selectedIds);

    if (!selectedIds.length) {
      showToast("Please select at least one production batch.", "warning");

      return false;
    }

    try {
      const payload = await apiRequest(
        "/api/production/consumption-corrections/preview",
        {
          method: "POST",

          body: JSON.stringify({
            bomId: Number(elements.bom.value),

            rawMaterialId: Number(elements.material.value),

            productionBatchIds: selectedIds,
          }),
        },
      );

      state.preview = payload?.preview || null;

      if (!state.preview) {
        throw new Error("Unable to generate correction preview.");
      }

      return true;
    } catch (error) {
      showToast(error.message, "error");

      return false;
    }
  };

  /* =========================================================
   * APPLY
   * ========================================================= */

  const requestApplyCorrection = async () => {
    const reason = elements.reason.value.trim();

    elements.reasonError.textContent = "";

    if (!reason) {
      elements.reasonError.textContent = "Correction reason is required.";

      elements.reason.focus();

      return;
    }

    const previewReady = await generatePreview();

    if (!previewReady) {
      return;
    }

    elements.confirmMessage.textContent = `Apply correction for ${
      state.selectedIds.size
    } production batch${
      state.selectedIds.size === 1 ? "" : "es"
    }? Historical production actual quantity will remain unchanged.`;

    elements.confirmModal.hidden = false;

    document.body.style.overflow = "hidden";
  };

  const closeConfirmModal = () => {
    elements.confirmModal.hidden = true;

    document.body.style.overflow = "";
  };

  const applyCorrection = async () => {
    const reason = elements.reason.value.trim();

    const selectedIds = Array.from(state.selectedIds);

    if (!selectedIds.length || !reason) {
      return;
    }

    elements.confirmButton.disabled = true;

    elements.confirmButton.innerHTML = `

        <i class="fa-solid fa-spinner fa-spin"></i>
        Applying...

      `;

    try {
      const payload = await apiRequest(
        "/api/production/consumption-corrections",
        {
          method: "POST",

          body: JSON.stringify({
            bomId: Number(elements.bom.value),

            rawMaterialId: Number(elements.material.value),

            productionBatchIds: selectedIds,

            reason,
          }),
        },
      );

      closeConfirmModal();

      showToast(
        payload?.message || "Consumption correction applied successfully.",
        "success",
      );

      resetCorrectionArea();

      await loadHistory();

      await findProductions();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      elements.confirmButton.disabled = false;

      elements.confirmButton.innerHTML = `

          <i class="fa-solid fa-check"></i>
          Confirm Correction

        `;
    }
  };

  /* =========================================================
   * HISTORY
   * ========================================================= */

  const loadHistory = async () => {
    elements.historyBody.innerHTML = `

        <tr>

          <td colspan="8">

            <div class="production-loading">

              <i class="fa-solid fa-spinner fa-spin"></i>

              Loading correction history...

            </div>

          </td>

        </tr>

      `;

    try {
      const payload = await apiRequest(
        "/api/production/consumption-corrections",
      );

      state.corrections = Array.isArray(payload?.corrections)
        ? payload.corrections
        : [];

      renderHistory();
    } catch (error) {
      console.error("Failed to load correction history:", error);

      elements.historyBody.innerHTML = `

          <tr>

            <td colspan="8">

              <div class="materials-placeholder">

                <i class="fa-solid fa-triangle-exclamation"></i>

                ${escapeHtml(
                  error.message || "Failed to load correction history.",
                )}

              </div>

            </td>

          </tr>

        `;
    }
  };

  const renderHistory = () => {
    if (!state.corrections.length) {
      elements.historyBody.innerHTML = "";

      elements.historyEmpty.hidden = false;

      return;
    }

    elements.historyEmpty.hidden = true;

    elements.historyBody.innerHTML = state.corrections
      .map((correction) => {
        const adjustment = Number(correction.total_adjustment_quantity || 0);

        return `

                <tr>

                  <td>

                    <span class="batch-no">
                      ${escapeHtml(correction.correction_no)}
                    </span>

                  </td>


                  <td>
                    ${escapeHtml(formatDate(correction.created_at))}
                  </td>


                  <td>

                    <div class="product-wise-name">

                      <div class="product-row-icon">
                        <i class="fa-solid fa-cube"></i>
                      </div>

                      <div>

                        <div class="product-name">
                          ${escapeHtml(correction.product_name || "—")}
                        </div>

                        <div class="product-code">
                          ${escapeHtml(correction.product_code || "—")}
                        </div>

                      </div>

                    </div>

                  </td>


                  <td>
                    ${escapeHtml(correction.raw_material_name || "—")}
                  </td>


                  <td>
                    ${formatNumber(correction.total_batches)}
                  </td>


                  <td>

                    <span class="variance-positive">
                      ${formatNumber(adjustment)}
                      ${
                        correction.raw_material_unit
                          ? escapeHtml(` ${correction.raw_material_unit}`)
                          : ""
                      }
                    </span>

                  </td>


                  <td>
                    ${escapeHtml(correction.created_by_name || "—")}
                  </td>


                  <td class="action-column">

                    <div class="action-buttons">

                      <button
                        class="table-action"
                        type="button"
                        data-history-action="view"
                        data-id="${correction.id}"
                        title="View"
                      >
                        <i class="fa-solid fa-eye"></i>
                      </button>

                    </div>

                  </td>

                </tr>

              `;
      })
      .join("");
  };

  /* =========================================================
   * VIEW HISTORY
   * ========================================================= */

  const openHistoryView = async (id) => {
    elements.viewBody.innerHTML = `

        <div class="materials-placeholder">

          <i class="fa-solid fa-spinner fa-spin"></i>

          Loading correction details...

        </div>

      `;

    elements.viewModal.hidden = false;

    document.body.style.overflow = "hidden";

    try {
      const payload = await apiRequest(
        `/api/production/consumption-corrections/${id}`,
      );

      const correction = payload?.correction;

      if (!correction) {
        throw new Error("Correction details not found.");
      }

      renderHistoryDetails(correction);
    } catch (error) {
      elements.viewBody.innerHTML = `

          <div class="materials-placeholder">

            <i class="fa-solid fa-triangle-exclamation"></i>

            ${escapeHtml(error.message || "Failed to load correction details.")}

          </div>

        `;
    }
  };

  const renderHistoryDetails = (correction) => {
    const movement = correction.stockMovements?.[0];

    const direction = movement?.direction || "—";

    const quantity = Number(
      movement?.quantity || correction.total_adjustment_quantity || 0,
    );

    elements.viewBody.innerHTML = `

        <div class="detail-grid">

          <div class="detail-item">

            <span>Correction No.</span>

            <strong>
              ${escapeHtml(correction.correction_no)}
            </strong>

          </div>


          <div class="detail-item">

            <span>Correction Date</span>

            <strong>
              ${escapeHtml(formatDate(correction.created_at))}
            </strong>

          </div>


          <div class="detail-item">

            <span>Product</span>

            <strong>
              ${escapeHtml(correction.product_name || "—")}
            </strong>

          </div>


          <div class="detail-item">

            <span>Product Design</span>

            <strong>
              ${escapeHtml(correction.bom_name || "—")}
            </strong>

          </div>


          <div class="detail-item">

            <span>Raw Material</span>

            <strong>
              ${escapeHtml(correction.raw_material_name || "—")}
            </strong>

          </div>


          <div class="detail-item">

            <span>Stock Movement</span>

            <strong>
              ${formatNumber(quantity)}
              ${escapeHtml(correction.raw_material_unit || "")}
              ${escapeHtml(direction)}
            </strong>

          </div>

        </div>


        <div class="detail-section">

          <h3>
            Correction Summary
          </h3>


          <div class="detail-summary-grid">

            <div class="detail-summary">

              <span>Old BOM Qty / Unit</span>

              <strong>
                ${formatNumber(correction.old_quantity)}
              </strong>

            </div>


            <div class="detail-summary">

              <span>Correct BOM Qty / Unit</span>

              <strong>
                ${formatNumber(correction.corrected_quantity)}
              </strong>

            </div>


            <div class="detail-summary">

              <span>Difference / Unit</span>

              <strong>
                ${formatSignedNumber(correction.difference_per_unit)}
              </strong>

            </div>


            <div class="detail-summary">

              <span>Total Batches</span>

              <strong>
                ${formatNumber(correction.total_batches)}
              </strong>

            </div>

          </div>

        </div>


        <div class="detail-section">

          <h3>
            Corrected Production Batches
          </h3>


          <div class="table-responsive">

            <table class="data-table materials-table">

              <thead>

                <tr>

                  <th>Batch</th>

                  <th>Date</th>

                  <th>Produced</th>

                  <th>Old Consumption</th>

                  <th>Corrected Consumption</th>

                  <th>Adjustment</th>

                </tr>

              </thead>


              <tbody>

                ${
                  correction.items?.length
                    ? correction.items
                        .map(
                          (item) => `

                            <tr>

                              <td>
                                ${escapeHtml(item.batch_no || "—")}
                              </td>

                              <td>
                                ${escapeHtml(formatDate(item.production_date))}
                              </td>

                              <td>
                                ${formatNumber(item.produced_quantity)}
                              </td>

                              <td>
                                ${formatNumber(item.old_quantity)}
                              </td>

                              <td>
                                ${formatNumber(item.corrected_quantity)}
                              </td>

                              <td>

                                <span
                                  class="${
                                    Number(item.adjustment_quantity) > 0
                                      ? "variance-positive"
                                      : Number(item.adjustment_quantity) < 0
                                        ? "variance-negative"
                                        : "variance-zero"
                                  }"
                                >
                                  ${formatSignedNumber(
                                    item.adjustment_quantity,
                                  )}
                                </span>

                              </td>

                            </tr>

                          `,
                        )
                        .join("")
                    : `

                      <tr>

                        <td colspan="6">

                          <div class="materials-placeholder">
                            No correction items found.
                          </div>

                        </td>

                      </tr>

                    `
                }

              </tbody>

            </table>

          </div>

        </div>


        <div class="detail-section">

          <h3>
            Reason
          </h3>

          <div class="form-note">

            <i class="fa-solid fa-note-sticky"></i>

            <span>
              ${escapeHtml(correction.reason || "—")}
            </span>

          </div>

        </div>

      `;
  };

  /* =========================================================
   * RESET
   * ========================================================= */

  const resetCorrectionArea = () => {
    state.productions = [];

    state.selectedIds.clear();

    state.preview = null;

    elements.detailsCard.hidden = true;

    elements.productionsCard.hidden = true;

    elements.applyCard.hidden = true;

    elements.reason.value = "";

    elements.reasonError.textContent = "";

    elements.productionsBody.innerHTML = `

        <tr>

          <td colspan="9">

            <div class="materials-placeholder">

              <i class="fa-solid fa-magnifying-glass"></i>

              Find production batches to continue.

            </div>

          </td>

        </tr>

      `;

    updateSelectionSummary();
  };

  const resetFilters = () => {
    elements.product.value = "";

    elements.bom.innerHTML = `

        <option value="">
          Select Product Design
        </option>

      `;

    elements.bom.disabled = true;

    elements.material.innerHTML = `

        <option value="">
          Select Raw Material
        </option>

      `;

    elements.material.disabled = true;

    elements.fromDate.value = "";

    elements.toDate.value = "";

    resetCorrectionArea();
  };

  /* =========================================================
   * EVENTS
   * ========================================================= */

  const bindEvents = () => {
    elements.product.addEventListener("change", populateBoms);

    elements.bom.addEventListener("change", populateMaterials);

    elements.findButton.addEventListener("click", findProductions);

    elements.resetFilters.addEventListener("click", resetFilters);

    elements.selectAll.addEventListener("click", selectAll);

    elements.clearSelection.addEventListener("click", clearSelection);

    elements.selectAllCheckbox.addEventListener("change", (event) => {
      if (event.target.checked) {
        selectAll();
      } else {
        clearSelection();
      }
    });

    elements.productionsBody.addEventListener("change", (event) => {
      const checkbox = event.target.closest(".correction-checkbox");

      if (!checkbox) {
        return;
      }

      toggleSelection(checkbox.dataset.id, checkbox.checked);
    });

    elements.applyButton.addEventListener("click", requestApplyCorrection);

    elements.cancelCorrection.addEventListener("click", () => {
      elements.reason.value = "";

      updateSelectionSummary();
    });

    elements.cancelConfirm.addEventListener("click", closeConfirmModal);

    elements.confirmButton.addEventListener("click", applyCorrection);

    elements.refreshHistory.addEventListener("click", loadHistory);

    elements.historyBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-history-action]");

      if (!button) return;

      if (button.dataset.historyAction === "view") {
        openHistoryView(Number(button.dataset.id));
      }
    });

    elements.closeViewModal.addEventListener("click", closeViewModal);

    elements.viewModal.addEventListener("click", (event) => {
      if (event.target === elements.viewModal) {
        closeViewModal();
      }
    });

    elements.confirmModal.addEventListener("click", (event) => {
      if (event.target === elements.confirmModal) {
        closeConfirmModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (!elements.viewModal.hidden) {
        closeViewModal();
      }

      if (!elements.confirmModal.hidden) {
        closeConfirmModal();
      }
    });
  };

  const closeViewModal = () => {
    elements.viewModal.hidden = true;

    document.body.style.overflow = "";
  };

  /* =========================================================
   * CACHE ELEMENTS
   * ========================================================= */

  const cacheElements = () => {
    elements.product = qs("#correctionProduct");

    elements.bom = qs("#correctionBom");

    elements.material = qs("#correctionRawMaterial");

    elements.fromDate = qs("#correctionFromDate");

    elements.toDate = qs("#correctionToDate");

    elements.findButton = qs("#findCorrectionProductions");

    elements.resetFilters = qs("#resetCorrectionFilters");

    elements.detailsCard = qs("#correctionDetailsCard");

    elements.productName = qs("#correctionProductName");

    elements.bomName = qs("#correctionBomName");

    elements.materialName = qs("#correctionMaterialName");

    elements.oldQty = qs("#correctionOldQty");

    elements.newQty = qs("#correctionNewQty");

    elements.difference = qs("#correctionDifference");

    elements.productionsCard = qs("#correctionProductionsCard");

    elements.productionsBody = qs("#correctionProductionsBody");

    elements.selectAll = qs("#selectAllCorrection");

    elements.clearSelection = qs("#clearCorrectionSelection");

    elements.selectAllCheckbox = qs("#selectAllCorrectionCheckbox");

    elements.correctionSummary = qs("#correctionSummary");

    elements.selectedBatchCount = qs("#selectedBatchCount");

    elements.selectedProducedQty = qs("#selectedProducedQty");

    elements.selectedOldConsumption = qs("#selectedOldConsumption");

    elements.selectedCorrectedConsumption = qs("#selectedCorrectedConsumption");

    elements.selectedAdjustment = qs("#selectedAdjustment");

    elements.applyCard = qs("#applyCorrectionCard");

    elements.reason = qs("#correctionReason");

    elements.reasonError = qs("#correctionReasonError");

    elements.cancelCorrection = qs("#cancelCorrection");

    elements.applyButton = qs("#applyCorrection");

    elements.finalBatchCount = qs("#finalBatchCount");

    elements.finalOldConsumption = qs("#finalOldConsumption");

    elements.finalCorrectedConsumption = qs("#finalCorrectedConsumption");

    elements.finalStockMovement = qs("#finalStockMovement");

    elements.historyBody = qs("#correctionHistoryBody");

    elements.historyEmpty = qs("#correctionHistoryEmpty");

    elements.refreshHistory = qs("#refreshCorrectionHistory");

    elements.viewModal = qs("#viewCorrectionModal");

    elements.closeViewModal = qs("#closeViewCorrectionModal");

    elements.viewBody = qs("#viewCorrectionBody");

    elements.confirmModal = qs("#confirmCorrectionModal");

    elements.confirmMessage = qs("#confirmCorrectionMessage");

    elements.cancelConfirm = qs("#cancelConfirmCorrection");

    elements.confirmButton = qs("#confirmApplyCorrection");

    elements.toastContainer = qs("#toastContainer");
  };

  /* =========================================================
   * INIT
   * ========================================================= */

  const init = async () => {
    cacheElements();

    bindEvents();

    await loadOptions();

    await loadHistory();
  };

  return {
    init,
  };
})();

const initConsumptionCorrectionsPage = () => ConsumptionCorrectionsPage.init();
