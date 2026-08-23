const ProductionPage = (() => {
  const state = {
    batches: [],
    filteredBatches: [],
    products: [],
    boms: [],
    page: 1,
    pageSize: 10,
    editingId: null,
    deletingId: null,
  };

  const elements = {};
  const qs = (selector) => document.querySelector(selector);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const getToken = () => localStorage.getItem("accessToken");

  const apiRequest = async (url, options = {}) => {
    const token = getToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

//   const setProductionDateLimit = () => {
//     const productionDateInput = document.querySelector("#productionDate");

//     if (!productionDateInput) return;

//     const today = new Date();

//     const year = today.getFullYear();
//     const month = String(today.getMonth() + 1).padStart(2, "0");
//     const day = String(today.getDate()).padStart(2, "0");

//     const todayString = `${year}-${month}-${day}`;

//     productionDateInput.max = todayString;

//     // જો હાલની selected date future હોય
//     if (
//         productionDateInput.value &&
//         productionDateInput.value > todayString
//     ) {
//         productionDateInput.value = todayString;
//     }
// };

const setProductionDateLimit = (input) => {
  if (!input) return;

  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  const todayString = `${year}-${month}-${day}`;

  // Past dates allowed
  // Today allowed
  // Tomorrow & future blocked
  input.max = todayString;

  // If current value is future date, reset to today
  if (input.value && input.value > todayString) {
    input.value = todayString;
  }
};

  const showToast = (message, type = "success") => {
    const container = document.getElementById("toastContainer");

    if (!container) {
      console.warn("Toast container not found.");
      return;
    }

    const icons = {
      success: "fa-circle-check",
      error: "fa-circle-exclamation",
      warning: "fa-triangle-exclamation",
      info: "fa-circle-info",
    };

    const icon = icons[type] || icons.success;

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;

    toast.innerHTML = `
    <i class="fa-solid ${icon} toast-icon"></i>

    <span class="toast-message">
      ${escapeHtml(message)}
    </span>

    <button
      type="button"
      class="toast-close"
      aria-label="Close"
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
      }, 2500);
    };

    toast.querySelector(".toast-close").addEventListener("click", removeToast);

    setTimeout(removeToast, 3000);
  };

  const formatNumber = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 3,
    });

  const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const todayISO = () => {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  };

  const normalizeProduct = (product) => ({
    id: Number(product.id),
    code: product.code ?? "",
    name: product.name ?? "",
    unit: product.unit ?? "NOS",
    is_active: Boolean(product.is_active ?? true),
  });

  const normalizeBom = (bom) => ({
    id: Number(bom.id),
    product_id: Number(bom.product_id),
    name: bom.name ?? "",
    is_active: Boolean(bom.is_active ?? true),
    items: Array.isArray(bom.items)
      ? bom.items.map((item) => ({
          id: item.id,
          raw_material_id: Number(item.raw_material_id),
          raw_material_code: item.raw_material_code ?? "",
          raw_material_name: item.raw_material_name ?? "Raw Material",
          quantity: Number(item.quantity ?? 0),
          unit: item.unit ?? "",
        }))
      : [],
  });

  const normalizeBatch = (batch) => ({
    id: batch.id,
    batch_no: batch.batch_no ?? batch.batchNo ?? "",
    product_id: Number(batch.product_id ?? 0),
    product_code: batch.product_code ?? "",
    product_name: batch.product_name ?? "Unknown Product",
    product_unit: batch.product_unit ?? batch.unit ?? "NOS",
    production_date: batch.production_date ?? "",
    planned_quantity: Number(batch.planned_quantity ?? 0),
    produced_quantity: Number(batch.produced_quantity ?? 0),
    wastage_quantity: Number(batch.wastage_quantity ?? batch.damaged_quantity ?? 0),
    damaged_quantity: Number(batch.damaged_quantity ?? batch.wastage_quantity ?? 0),
    shift: batch.shift ?? "Morning",
    machine: batch.machine ?? "",
    supervisor: batch.supervisor ?? "",
    remarks: batch.remarks ?? "",
    bom_id: Number(batch.bom_id ?? 0),
    bom_name: batch.bom_name ?? "",
    materials: Array.isArray(batch.materials) ? batch.materials : [],
  });

  /* DATA */

  const loadProduction = async () => {
    renderLoading();

    try {
      const payload = await apiRequest("/api/production");
      const rows = Array.isArray(payload)
        ? payload
        : payload?.batches || payload?.productions || payload?.data || [];

      console.log("Rows:",rows);
      state.batches = rows.map(normalizeBatch);
      state.page = 1;
      populateProductFilter();
      applyFilters();
    } catch (error) {
      console.error("Failed to load production:", error);
      renderError(error.message);
    }
  };

  const loadProducts = async () => {
    try {
      const payload = await apiRequest("/api/products");
      const rows = Array.isArray(payload)
        ? payload
        : payload?.products || payload?.data || [];

      state.products = rows
        .map(normalizeProduct)
        .filter((product) => product.is_active);

      populateProductFilter();
      populateProductionProductSelect();
    } catch (error) {
      console.error("Failed to load products:", error);
      state.products = [];
    }
  };

  const loadBomsForProduct = async (productId) => {
    elements.productionBom.disabled = true;
    elements.productionBom.innerHTML = `<option value="">Loading BOMs...</option>`;
    clearMaterials();

    if (!productId) {
      elements.productionBom.innerHTML = `<option value="">Select Product Design</option>`;
      return;
    }

    try {
      const payload = await apiRequest(
        `/api/product-boms?product_id=${encodeURIComponent(productId)}`,
      );

      const rows = Array.isArray(payload)
        ? payload
        : payload?.boms || payload?.data || [];

      state.boms = rows
        .map(normalizeBom)
        .filter((bom) => bom.product_id === Number(productId) && bom.is_active);

      elements.productionBom.innerHTML = `
        <option value="">Select Product Design</option>
        ${state.boms
          .map(
            (bom) =>
              `<option value="${bom.id}">${escapeHtml(bom.name)}</option>`,
          )
          .join("")}
      `;

      if (!state.boms.length) {
        elements.productionBom.innerHTML = `<option value="">No active BOM found</option>`;
      }

      elements.productionBom.disabled = !state.boms.length;
    } catch (error) {
      // console.error("Failed to load BOMs:", error);
      showToast(error.message, "error");
      state.boms = [];
      elements.productionBom.innerHTML = `<option value="">Unable to load BOMs</option>`;
    }
  };

  /* FILTERS */

  const populateProductFilter = () => {
    const current = elements.productFilter.value;

    const products = state.products.length
      ? state.products
      : [
          ...new Map(
            state.batches.map((batch) => [
              batch.product_id,
              {
                id: batch.product_id,
                code: batch.product_code,
                name: batch.product_name,
              },
            ]),
          ).values(),
        ];

    elements.productFilter.innerHTML = `
      <option value="">All Products</option>
      ${products
        .map(
          (product) =>
            `<option value="${product.id}">${escapeHtml(product.name)}</option>`,
        )
        .join("")}
    `;

    if (products.some((product) => String(product.id) === String(current))) {
      elements.productFilter.value = current;
    }
  };

  const populateProductionProductSelect = () => {
    const current = elements.productionProduct.value;

    elements.productionProduct.innerHTML = `
      <option value="">Select Product</option>
      ${state.products
        .map(
          (product) =>
            `<option value="${product.id}">${escapeHtml(product.name)}${product.code ? ` — ${escapeHtml(product.code)}` : ""}</option>`,
        )
        .join("")}
    `;

    if (
      state.products.some((product) => String(product.id) === String(current))
    ) {
      elements.productionProduct.value = current;
    }
  };

  const applyFilters = () => {
    const search = elements.search.value.trim().toLowerCase();
    const productId = elements.productFilter.value;
    const shift = elements.shiftFilter.value;
    const date = elements.dateFilter.value;

    state.filteredBatches = state.batches.filter((batch) => {
      const matchesSearch =
        !search ||
        batch.batch_no.toLowerCase().includes(search) ||
        batch.product_name.toLowerCase().includes(search) ||
        batch.product_code.toLowerCase().includes(search);

      const matchesProduct =
        !productId || String(batch.product_id) === String(productId);

      const matchesShift = !shift || batch.shift === shift;

      const matchesDate =
        !date || String(batch.production_date).slice(0, 10) === date;

      return matchesSearch && matchesProduct && matchesShift && matchesDate;
    });

    const totalPages = Math.max(
      1,
      Math.ceil(state.filteredBatches.length / state.pageSize),
    );

    state.page = Math.min(state.page, totalPages);

    renderProductionTable();
    renderProductWise();
    updateSummary();
  };

  /* RENDER */

  const renderLoading = () => {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="production-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading production...
          </div>
        </td>
      </tr>
    `;
    elements.productionEmpty.hidden = true;
  };

  const renderError = (message) => {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="production-loading">
            <i class="fa-solid fa-triangle-exclamation"></i>
            ${escapeHtml(message || "Unable to load production.")}
          </div>
        </td>
      </tr>
    `;

    elements.productionEmpty.hidden = true;
    state.batches = [];
    state.filteredBatches = [];
    renderProductWise();
    updateSummary();
  };

  const renderProductionTable = () => {
    const total = state.filteredBatches.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    const start = (state.page - 1) * state.pageSize;
    const rows = state.filteredBatches.slice(start, start + state.pageSize);

    elements.pageNumber.textContent = String(state.page);
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= totalPages;

    elements.count.textContent =
      total === 0
        ? "Showing 0 production batches"
        : `Showing ${start + 1}-${Math.min(start + rows.length, total)} of ${total} production batches`;

    if (!rows.length) {
      elements.tableBody.innerHTML = "";
      elements.productionEmpty.hidden = false;
      return;
    }

    elements.productionEmpty.hidden = true;

    elements.tableBody.innerHTML = rows
      .map((batch) => {
        const wastage =
          batch.wastage_quantity ||
          Math.max(batch.planned_quantity - batch.produced_quantity, 0);
        return `
          <tr>
            <td><span class="batch-no">${escapeHtml(batch.batch_no || `PB-${batch.id}`)}</span></td>
            <td>
              <div class="product-wise-name">
                <div class="product-row-icon"><i class="fa-solid fa-cube"></i></div>
                <div>
                  <div class="product-name">${escapeHtml(batch.product_name)}</div>
                  <div class="product-code">${escapeHtml(batch.product_code || "—")}</div>
                </div>
              </div>
            </td>
            <td>${escapeHtml(formatDate(batch.production_date))}</td>
            <td>
              <span class="quantity-value">
                ${formatNumber(batch.planned_quantity)}
              </span>
              <span class="quantity-unit">
                ${escapeHtml(batch.product_unit)}
              </span>
            </td>
            <td>
              <span class="quantity-value">
                ${formatNumber(batch.produced_quantity)}
              </span>
              <span class="quantity-unit">
                ${escapeHtml(batch.product_unit)}
              </span>
            </td>
            <td> 
              <span class="${wastage > 0 ? "balance-positive" : "balance-zero"}" >
                ${formatNumber(batch.wastage_quantity)} 
              </span> 
              <span class="quantity-unit"> 
                ${escapeHtml(batch.product_unit)} 
              </span>
            </td>
            <td> 
              <span class="shift-badge"> 
                ${escapeHtml(batch.shift || "—")} 
              </span> 
            </td>
            <td class="action-column">
              <div class="action-buttons">
                <button class="table-action" type="button" data-action="view" data-id="${batch.id}" title="View"><i class="fa-solid fa-eye"></i></button>
                <button class="table-action" type="button" data-action="edit" data-id="${batch.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="table-action danger" type="button" data-action="delete" data-id="${batch.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  };

  const renderProductWise = () => {
    const grouped = new Map();

    for (const batch of state.batches) {
      const key = String(batch.product_id);

      if (!grouped.has(key)) {
        grouped.set(key, {
          product_id: batch.product_id,
          product_name: batch.product_name,
          product_code: batch.product_code,
          unit: batch.product_unit,
          planned: 0,
          produced: 0,
        });
      }

      const row = grouped.get(key);
      row.planned += batch.planned_quantity;
      row.produced += batch.produced_quantity;
    }

    const rows = [...grouped.values()];

    if (!rows.length) {
      elements.productWiseTableBody.innerHTML = "";
      elements.productWiseEmpty.hidden = false;
      return;
    }

    elements.productWiseEmpty.hidden = true;

    elements.productWiseTableBody.innerHTML = rows
      .map((row) => {
        const balance = row.planned - row.produced;

        return `
          <tr>
            <td>
              <div class="product-wise-name">
                <div class="product-row-icon"><i class="fa-solid fa-cube"></i></div>
                <div>
                  <div class="product-name">${escapeHtml(row.product_name)}</div>
                  <div class="product-code">${escapeHtml(row.product_code || "—")}</div>
                </div>
              </div>
            </td>
            <td><span class="quantity-value">${formatNumber(row.planned)}</span><span class="quantity-unit">${escapeHtml(row.unit)}</span></td>
            <td><span class="quantity-value">${formatNumber(row.produced)}</span><span class="quantity-unit">${escapeHtml(row.unit)}</span></td>
            <td><span class="${balance > 0 ? "balance-positive" : "balance-zero"}">${formatNumber(balance)}</span><span class="quantity-unit">${escapeHtml(row.unit)}</span></td>
          </tr>
        `;
      })
      .join("");
  };

  const updateSummary = () => {
    const planned = state.batches.reduce(
      (sum, batch) => sum + batch.planned_quantity,
      0,
    );

    const produced = state.batches.reduce(
      (sum, batch) => sum + batch.produced_quantity,
      0,
    );

    const today = todayISO();

    const todayProduction = state.batches
      .filter((batch) => String(batch.production_date).slice(0, 10) === today)
      .reduce((sum, batch) => sum + batch.produced_quantity, 0);

    elements.totalBatches.textContent =
      state.batches.length.toLocaleString("en-IN");

    elements.todayProduction.innerHTML = `${formatNumber(todayProduction)} <small>NOS</small>`;

    elements.plannedQuantitySummary.innerHTML = `${formatNumber(planned)} <small>NOS</small>`;

    elements.producedQuantitySummary.innerHTML = `${formatNumber(produced)} <small>NOS</small>`;
  };

  /* MATERIALS */

  const clearMaterials = () => {
    elements.materialsBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="materials-placeholder">
            Select a product and BOM to view raw materials.
          </div>
        </td>
      </tr>
    `;
  };

  const renderMaterials = () => {
    const bom = state.boms.find(
      (item) => item.id === Number(elements.productionBom.value),
    );

    const produced = Number(elements.producedQuantity.value || 0);
    const damaged = Number(elements.damagedQuantity.value || 0);
    const totalQuantity = produced + damaged;

    if (!bom) {
      clearMaterials();
      return;
    }

    if (!bom.items.length) {
      elements.materialsBody.innerHTML = `
        <tr><td colspan="5"><div class="materials-placeholder">This BOM has no raw materials.</div></td></tr>
      `;
      return;
    }

    elements.materialsBody.innerHTML = bom.items
      .map((item, index) => {
        const standardQuantity = Number(item.quantity || 0);
        const actualQuantity = Number(item.actual_quantity ?? standardQuantity);
        const variance = actualQuantity - standardQuantity;

        return `
          <tr data-material-index="${index}">
            <td>
              <div class="product-name">${escapeHtml(item.raw_material_name)}</div>
              ${item.raw_material_code ? `<div class="product-code">${escapeHtml(item.raw_material_code)}</div>` : ""}
            </td>
            <td><span class="quantity-value">${formatNumber(standardQuantity)}</span></td>
            <td>
              <input
                class="material-actual-input"
                type="number"
                min="0.1"
                step="0.1"
                value="${actualQuantity > 0 ? actualQuantity : ""}"
                data-raw-material-id="${item.raw_material_id}"
                data-standard-quantity="${standardQuantity}"
                aria-label="Actual quantity for ${escapeHtml(item.raw_material_name)}"
              >
            </td>
            <td>
              <span class="material-variance ${variance > 0 ? "variance-positive" : variance < 0 ? "variance-negative" : "variance-zero"}">${formatNumber(variance)}</span>
            </td>
            <td><span class="quantity-unit">${escapeHtml(item.unit)}</span></td>
          </tr>
        `;
      })
      .join("");

    elements.materialsBody
      .querySelectorAll(".material-actual-input")
      .forEach((input) => {
        input.addEventListener("input", () => {
          const standard = Number(input.dataset.standardQuantity || 0);
          const actual = Number(input.value || 0);
          const variance = actual - standard;
          const row = input.closest("tr");
          const varianceElement = row?.querySelector(".material-variance");

          if (!varianceElement) return;

          varianceElement.textContent = formatNumber(variance);
          varianceElement.className = `material-variance ${
            variance > 0
              ? "variance-positive"
              : variance < 0
                ? "variance-negative"
                : "variance-zero"
          }`;
        });
      });
  };

  /* FORM */

  const clearErrors = () => {
    document
      .querySelectorAll("#productionForm .form-error")
      .forEach((element) => {
        element.textContent = "";
      });
  };

  const setError = (field, message) => {
    const element = document.querySelector(`[data-error-for="${field}"]`);
    if (element) element.textContent = message;
  };

  const resetForm = () => {
    elements.form.reset();
    elements.productionId.value = "";
    elements.productionDate.value = todayISO();
    elements.productionShift.value = "Morning";
    elements.productionBom.innerHTML = `<option value="">Select Product Design</option>`;
    elements.productionBom.disabled = true;
    state.editingId = null;
    state.boms = [];
    clearErrors();
    clearMaterials();
  };

  const validateForm = () => {
    clearErrors();

    const product = elements.productionProduct.value;
    const bom = elements.productionBom.value;
    const date = elements.productionDate.value;
    const produced = Number(elements.producedQuantity.value);
    const damaged = Number(elements.damagedQuantity.value || 0);

    let valid = true;

    if (!product) {
      setError("product", "Product is required.");
      valid = false;
    }

    if (!bom) {
      setError("bom", "BOM is required.");
      valid = false;
    }

    if (!date) {
      setError("date", "Production date is required.");
      valid = false;
    }

    if (!Number.isFinite(produced) || produced <= 0) {
      setError("produced", "Produced quantity must be greater than zero.");
      valid = false;
    }

    if (!Number.isFinite(damaged) || damaged < 0) {
      setError("damaged", "Damaged quantity cannot be negative.");
      valid = false;
    }

    const totalQuantity = produced + damaged;

    if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      valid = false;
    }

    document.querySelectorAll(".material-actual-input").forEach((input) => {
      const value = Number(input.value);
      const invalid = !Number.isFinite(value) || value <= 0;
      input.classList.toggle("input-error", invalid);
      if (invalid) valid = false;
    });

    return valid;
  };

  const openModal = () => {
    resetForm();
    elements.productionModal.hidden = false;
    document.body.style.overflow = "hidden";

    elements.productionModalTitle.textContent = "Create Production Batch";
    elements.productionModalDescription.textContent =
      "Create a production batch using an active product BOM.";
    elements.saveProduction.querySelector("span").textContent =
      "Save Production";

    setProductionDateLimit(elements.productionDate);
    

    requestAnimationFrame(() => elements.productionProduct.focus());
  };

  const closeModal = () => {
    elements.productionModal.hidden = true;
    document.body.style.overflow = "";
    resetForm();
  };

  /* =========================================================
   * EDIT PRODUCTION
   * ========================================================= */

  const clearEditMaterials = () => {
    elements.editProductionMaterialsBody.innerHTML = `
    <tr>
      <td colspan="5">
        <div class="materials-placeholder">
          Loading raw materials...
        </div>
      </td>
    </tr>
  `;
  };

  const renderEditMaterials = (materials = [], plannedQuantity = 0) => {
    if (!materials.length) {
      elements.editProductionMaterialsBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="materials-placeholder">
            No raw materials found.
          </div>
        </td>
      </tr>
    `;

      return;
    }

    const planned = Number(plannedQuantity || 0);

    elements.editProductionMaterialsBody.innerHTML = materials
      .map((material) => {
        const standardTotal = Number(material.standard_quantity || 0);

        const actualTotal = Number(material.actual_quantity || 0);

        const standardPerUnit =
          planned > 0 ? standardTotal / planned : standardTotal;

        const actualPerUnit = planned > 0 ? actualTotal / planned : actualTotal;

        const variance = actualPerUnit - standardPerUnit;

        const varianceClass =
          variance > 0
            ? "variance-positive"
            : variance < 0
              ? "variance-negative"
              : "variance-zero";

        return `
          <tr>

            <td>
              <div class="product-name">
                ${escapeHtml(
                  material.raw_material_name ||
                    material.material_name ||
                    "Raw Material",
                )}
              </div>

              ${
                material.raw_material_code
                  ? `
                    <div class="product-code">
                      ${escapeHtml(material.raw_material_code)}
                    </div>
                  `
                  : ""
              }
            </td>

            <td>
              <span class="quantity-value">
                ${formatNumber(standardPerUnit)}
              </span>
            </td>

            <td>
              <input
                class="material-actual-input edit-material-actual-input"
                type="number"
                min="0"
                step="0.001"
                value="${actualPerUnit}"
                data-raw-material-id="${material.raw_material_id}"
                data-standard-quantity="${standardPerUnit}"
                aria-label="Actual quantity for ${escapeHtml(
                  material.raw_material_name ||
                    material.material_name ||
                    "Raw Material",
                )}"
              />
            </td>

            <td>
              <span
                class="material-variance ${varianceClass}"
              >
                ${variance > 0 ? "+" : ""}
                ${formatNumber(variance)}
              </span>
            </td>

            <td>
              <span class="quantity-unit">
                ${escapeHtml(material.unit || "")}
              </span>
            </td>

          </tr>
        `;
      })
      .join("");

    /*
     * Variance calculation
     */

    elements.editProductionMaterialsBody
      .querySelectorAll(".edit-material-actual-input")
      .forEach((input) => {
        input.addEventListener("input", () => {
          const standard = Number(input.dataset.standardQuantity || 0);

          const actual = Number(input.value || 0);

          const variance = actual - standard;

          const varianceElement = input
            .closest("tr")
            ?.querySelector(".material-variance");

          if (!varianceElement) return;

          varianceElement.textContent = `${variance > 0 ? "+" : ""}${formatNumber(
            variance,
          )}`;

          varianceElement.className = `material-variance ${
            variance > 0
              ? "variance-positive"
              : variance < 0
                ? "variance-negative"
                : "variance-zero"
          }`;
        });
      });
  };

  const openEditProductionModal = async (batch) => {
    if (!batch?.id) return;

    elements.editProductionModal.hidden = false;
    document.body.style.overflow = "hidden";

    clearEditMaterials();

    setProductionDateLimit(elements.editProductionDate);

    elements.updateProduction.disabled = true;

    try {
  
      const response = await apiRequest(`/api/production/${batch.id}`);
      const details = response?.production ?? response?.data ?? response;

      if (!details) {
        throw new Error("Production details not found.");
      }

      const materials = Array.isArray(details.materials)
        ? details.materials
        : [];

      console.log("Batch:",details);

      elements.editProductionId.value = details.id;

      elements.editProductionDate.value = String(
        details.production_date ?? "",
      ).slice(0, 10);

      elements.editProducedQuantity.value = details.produced_quantity ?? "";
      elements.editDamagedQuantity.value = Number(
        details.damaged_quantity ?? details.wastage_quantity ?? 0,
      );

      elements.editProductionShift.value = details.shift || "Morning";

      elements.editProductionMachine.value = details.machine || "";

      elements.editProductionSupervisor.value = details.supervisor || "";

      elements.editProductionRemarks.value = details.remarks || "";

      /*
       * Product
       */

      elements.editProductionProduct.innerHTML = `
      <option value="${details.product_id}">
        ${escapeHtml(
          details.product_name || details.product?.name || "Product",
        )}
      </option>
    `;

      elements.editProductionProduct.value = String(details.product_id);


      await loadBomsForProduct(details.product_id);


      elements.editProductionBom.innerHTML = `
      <option value="">Select Product Design</option>
      ${state.boms
        .map(
          (bom) => `
            <option value="${bom.id}">
              ${escapeHtml(bom.name)}
            </option>
          `,
        )
        .join("")}
    `;

      elements.editProductionBom.value = String(details.bom_id || "");


      const editProducedQuantity = Number(details.produced_quantity || 0);
      const editDamagedQuantity = Number(
        details.damaged_quantity ?? details.wastage_quantity ?? 0,
      );

      renderEditMaterials(
        materials,
        editProducedQuantity + editDamagedQuantity,
      );
    } catch (error) {
      console.error("Failed to load production for edit:", error);

      elements.editProductionMaterialsBody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="materials-placeholder">
            <i class="fa-solid fa-triangle-exclamation"></i>
            ${escapeHtml(error.message || "Failed to load raw materials.")}
          </div>
        </td>
      </tr>
    `;
    } finally {
      elements.updateProduction.disabled = false;
    }
  };

  const closeEditProductionModal = () => {
    elements.editProductionModal.hidden = true;
    document.body.style.overflow = "";

    elements.editProductionForm.reset();

    elements.editProductionMaterialsBody.innerHTML = `
    <tr>
      <td colspan="5">
        <div class="materials-placeholder">
          No materials loaded.
        </div>
      </td>
    </tr>
  `;
  };

  const getFormPayload = () => {
    const bom = state.boms.find(
      (item) => item.id === Number(elements.productionBom.value),
    );

    const producedQuantity = Number(elements.producedQuantity.value || 0);
    const damagedQuantity = Number(elements.damagedQuantity.value || 0);
    const totalQuantity = producedQuantity + damagedQuantity;

    return {
      product_id: Number(elements.productionProduct.value),
      bom_id: Number(elements.productionBom.value),
      production_date: elements.productionDate.value,
      produced_quantity: producedQuantity,
      damaged_quantity: damagedQuantity,
      shift: elements.productionShift.value,
      machine: elements.productionMachine.value.trim() || null,
      supervisor: elements.productionSupervisor.value.trim() || null,
      remarks: elements.productionRemarks.value.trim() || null,
      materials: (bom?.items || []).map((item) => {
        const input = elements.materialsBody.querySelector(
          `.material-actual-input[data-raw-material-id="${item.raw_material_id}"]`,
        );

        return {
          raw_material_id: Number(item.raw_material_id),
          standard_quantity: Number(item.quantity || 0) * totalQuantity,
          actual_quantity: Number(input?.value || 0) * totalQuantity,
          unit: item.unit,
        };
      }),
    };
  };

  const validateProductionDate = () => {
    const input = document.querySelector("#productionDate");

    if (!input?.value) {
        return true;
    }

    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    const todayString = `${year}-${month}-${day}`;

    if (input.value > todayString) {
        showToast(
            "Production date cannot be a future date.",
            "error",
        );

        input.value = todayString;

        return false;
    }

    return true;
};

  const saveProduction = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;
    if (!validateProductionDate()) {
        return;
    }

    const payload = getFormPayload();
    const isEditing = Boolean(state.editingId);

    console.log("payload:", payload);

    elements.saveProduction.disabled = true;
    elements.saveProduction.querySelector("span").textContent = isEditing
      ? "Updating..."
      : "Saving...";

    try {
      const url = isEditing
        ? `/api/production/${state.editingId}`
        : "/api/production";

      await apiRequest(url, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      closeModal();
      await loadProduction();
            showToast(
        isEditing
          ? "Production updated successfully."
          : "Production Added successfully.",
      );
    } catch (error) {
      console.error("Failed to save production:", error);
      // window.alert(error.message || "Unable to save production.");
      showToast(error.message, "error");
    } finally {
      elements.saveProduction.disabled = false;
      elements.saveProduction.querySelector("span").textContent = isEditing
        ? "Update Production"
        : "Save Production";
    }
  };

  const getEditProductionPayload = () => {
    const producedQuantity = Number(
      elements.editProducedQuantity.value || 0,
    );

    const damagedQuantity = Number(
      elements.editDamagedQuantity.value || 0,
    );

    const totalQuantity = producedQuantity + damagedQuantity;

    const materials = Array.from(
      elements.editProductionMaterialsBody.querySelectorAll(
        ".edit-material-actual-input",
      ),
    ).map((input) => {
      const rawMaterialId = Number(input.dataset.rawMaterialId);
      const standardPerUnit = Number(
        input.dataset.standardQuantity || 0,
      );
      const actualPerUnit = Number(input.value || 0);

      return {
        raw_material_id: rawMaterialId,
        standard_quantity: standardPerUnit * totalQuantity,
        actual_quantity: actualPerUnit * totalQuantity,
        unit:
          input
            .closest("tr")
            ?.querySelector(".quantity-unit")
            ?.textContent?.trim() || "",
      };
    });

    return {
      product_id: Number(elements.editProductionProduct.value),
      bom_id: Number(elements.editProductionBom.value),
      production_date: elements.editProductionDate.value,
      produced_quantity: producedQuantity,
      damaged_quantity: damagedQuantity,
      materials,
      shift: elements.editProductionShift.value,
      machine: elements.editProductionMachine.value.trim() || null,
      supervisor: elements.editProductionSupervisor.value.trim() || null,
      remarks: elements.editProductionRemarks.value.trim() || null,
    };
  };

  const updateProduction = async (event) => {
    event.preventDefault();

    const id = elements.editProductionId.value;

    if (!id) {
      showToast("Production ID is missing.", "warning");
      return;
    }

    const produced = Number(elements.editProducedQuantity.value || 0);
    const damaged = Number(elements.editDamagedQuantity.value || 0);

    if (!elements.editProductionDate.value) {
      showToast("Production Date is missing.", "warning");
      return;
    }

    if (!Number.isFinite(produced) || produced <= 0) {
      showToast("Produced quantity must be greater than zero.", "warning");
      return;
    }

    if (!Number.isFinite(damaged) || damaged < 0) {
      showToast("Damaged quantity cannot be negative.", "warning");
      return;
    }

    const payload = getEditProductionPayload();

    elements.updateProduction.disabled = true;

    const buttonText = elements.updateProduction.querySelector("span");

    if (buttonText) {
      buttonText.textContent = "Updating...";
    }

    try {
      await apiRequest(`/api/production/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      closeEditProductionModal();
      await loadProduction();
    } catch (error) {
      console.error("Failed to update production:", error);
      showToast(error.message, "error");
    } finally {
      elements.updateProduction.disabled = false;

      if (buttonText) {
        buttonText.textContent = "Update Production";
      }
    }
  };

  /* VIEW */
  const openViewModal = async (batch) => {
    if (!batch?.id) return;

    elements.viewProductionBody.innerHTML = `
    <div class="materials-placeholder">
      <i class="fa-solid fa-spinner fa-spin"></i>
      Loading production details...
    </div>
  `;

    elements.viewProductionModal.hidden = false;
    document.body.style.overflow = "hidden";

    try {
      const response = await apiRequest(`/api/production/${batch.id}`);
      const details = response?.production ?? response?.data ?? response;

      if (!details) {
        throw new Error("Production details not found.");
      }

      const damagedQuantity = Number(
        details.damaged_quantity ?? details.wastage_quantity ?? 0,
      );

      const materials = Array.isArray(details.materials)
        ? details.materials
        : [];

      // console.log("Production materials:", materials);

      elements.viewProductionBody.innerHTML = `
      <div class="detail-grid">

        <div class="detail-item">
          <span>Batch No.</span>
          <strong>
            ${escapeHtml(details.batch_no || `PB-${details.id}`)}
          </strong>
        </div>

        <div class="detail-item">
          <span>Product</span>
          <strong>
            ${escapeHtml(details.product_name || "—")}
          </strong>
        </div>

        <div class="detail-item">
          <span>Production Date</span>
          <strong>
            ${escapeHtml(formatDate(details.production_date))}
          </strong>
        </div>

        <div class="detail-item">
          <span>Shift</span>
          <strong>
            ${escapeHtml(details.shift || "—")}
          </strong>
        </div>

        <div class="detail-item">
          <span>Machine</span>
          <strong>
            ${escapeHtml(details.machine || "—")}
          </strong>
        </div>

        <div class="detail-item">
          <span>Supervisor</span>
          <strong>
            ${escapeHtml(details.supervisor || "—")}
          </strong>
        </div>

      </div>

      <div class="detail-section">

        <h3>Production Summary</h3>

        <div class="detail-summary-grid">

          <div class="detail-summary">
            <span>Planned</span>
            <strong>
              ${formatNumber(details.planned_quantity)}
              ${escapeHtml(details.product_unit || "NOS")}
            </strong>
          </div>

          <div class="detail-summary">
            <span>Produced</span>
            <strong>
              ${formatNumber(details.produced_quantity)}
              ${escapeHtml(details.product_unit || "NOS")}
            </strong>
          </div>

          <div class="detail-summary">
            <span>Damaged</span>
            <strong>
              ${formatNumber(damagedQuantity)}
              ${escapeHtml(details.product_unit || "NOS")}
            </strong>
          </div>
        </div>

      </div>

      <div class="detail-section">

        <h3>Material Consumption</h3>

        <div class="table-responsive">

          <table class="data-table materials-table">

            <thead>
              <tr>
                <th>Material</th>
                <th>Standard</th>
                <th>Actual</th>
                <th>Variance</th>
                <th>Unit</th>
              </tr>
            </thead>

            <tbody>

              ${
                materials.length
                  ? materials
                      .map((item) => {
                        const standard = Number(item.standard_quantity || 0);

                        const actual = Number(item.actual_quantity || 0);

                        /*
                         * Prefer DB generated variance.
                         * Fallback to calculation.
                         */
                        const variance =
                          item.variance_quantity !== null &&
                          item.variance_quantity !== undefined
                            ? Number(item.variance_quantity)
                            : actual - standard;

                        const varianceClass =
                          variance > 0
                            ? "variance-positive"
                            : variance < 0
                              ? "variance-negative"
                              : "variance-zero";

                        const varianceText =
                          variance > 0
                            ? `+${formatNumber(variance)}`
                            : formatNumber(variance);

                        return `
                          <tr>

                            <td>
                              <div class="product-name">
                                ${escapeHtml(
                                  item.raw_material_name ||
                                    item.material_name ||
                                    "Raw Material",
                                )}
                              </div>

                              ${
                                item.raw_material_code
                                  ? `
                                    <div class="product-code">
                                      ${escapeHtml(item.raw_material_code)}
                                    </div>
                                  `
                                  : ""
                              }
                            </td>

                            <td>
                              ${formatNumber(standard)}
                            </td>

                            <td>
                              ${formatNumber(actual)}
                            </td>

                            <td>
                              <span
                                class="material-variance ${varianceClass}"
                              >
                                ${varianceText}
                              </span>
                            </td>

                            <td>
                              ${escapeHtml(item.unit || "")}
                            </td>

                          </tr>
                        `;
                      })
                      .join("")
                  : `
                    <tr>
                      <td colspan="5">
                        <div class="materials-placeholder">
                          No material consumption recorded.
                        </div>
                      </td>
                    </tr>
                  `
              }

            </tbody>

          </table>

        </div>

      </div>

      ${
        details.remarks
          ? `
            <div class="detail-section">

              <h3>Notes</h3>

              <div class="form-note">

                <i class="fa-solid fa-note-sticky"></i>

                <span>
                  ${escapeHtml(details.remarks)}
                </span>

              </div>

            </div>
          `
          : ""
      }
    `;
    } catch (error) {
      console.error("Failed to load production details:", error);

      elements.viewProductionBody.innerHTML = `
      <div class="materials-placeholder">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Failed to load production details.
      </div>
    `;
    }
  };
  const closeViewModal = () => {
    elements.viewProductionModal.hidden = true;
    document.body.style.overflow = "";
  };

  /* DELETE */

  const openDeleteModal = (batch) => {
    state.deletingId = batch.id;
    elements.deleteProductionMessage.textContent = `Delete ${batch.batch_no || `PB-${batch.id}`} for ${batch.product_name}? This will also remove related production material and wastage records.`;
    elements.deleteProductionModal.hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeDeleteModal = () => {
    elements.deleteProductionModal.hidden = true;
    state.deletingId = null;
    document.body.style.overflow = "";
  };

  const confirmDelete = async () => {
    if (!state.deletingId) return;

    const id = state.deletingId;
    elements.confirmDeleteProduction.disabled = true;

    try {
      await apiRequest(`/api/production/${id}`, {
        method: "DELETE",
      });

      closeDeleteModal();
      await loadProduction();
    } catch (error) {
      console.error("Failed to delete production:", error);
      // window.alert(error.message || "Unable to delete production.");
      showToast(error.message, "error");
    } finally {
      elements.confirmDeleteProduction.disabled = false;
    }
  };

  /* EVENTS */

  const handleTableAction = (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const batch = state.batches.find(
      (item) => String(item.id) === String(button.dataset.id),
    );

    if (!batch) return;

    if (button.dataset.action === "view") openViewModal(batch);
    if (button.dataset.action === "edit") openEditProductionModal(batch);
    if (button.dataset.action === "delete") openDeleteModal(batch);
  };

  const bindEvents = () => {
    elements.addButton.addEventListener("click", () => openModal());
    elements.emptyAdd.addEventListener("click", () => openModal());
    elements.closeModal.addEventListener("click", closeModal);
    elements.cancelProduction.addEventListener("click", closeModal);

    // elements.productionModal.addEventListener("click", (event) => {
    //   if (event.target === elements.productionModal) closeModal();
    // });

    elements.form.addEventListener("submit", saveProduction);

    elements.productionProduct.addEventListener("change", async () => {
      await loadBomsForProduct(elements.productionProduct.value);
      renderMaterials();
    });

    elements.productionBom.addEventListener("change", renderMaterials);
    // elements.plannedQuantity.addEventListener("input", renderMaterials);

    elements.search.addEventListener("input", () => {
      state.page = 1;
      applyFilters();
    });

    elements.productFilter.addEventListener("change", () => {
      state.page = 1;
      applyFilters();
    });

    elements.shiftFilter.addEventListener("change", () => {
      state.page = 1;
      applyFilters();
    });

    elements.dateFilter.addEventListener("change", () => {
      state.page = 1;
      applyFilters();
    });

    elements.resetFilters.addEventListener("click", () => {
      elements.search.value = "";
      elements.productFilter.value = "";
      elements.shiftFilter.value = "";
      elements.dateFilter.value = "";
      state.page = 1;
      applyFilters();
    });

    elements.previousPage.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderProductionTable();
      }
    });

    elements.nextPage.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(state.filteredBatches.length / state.pageSize),
      );

      if (state.page < totalPages) {
        state.page += 1;
        renderProductionTable();
      }
    });

    elements.tableBody.addEventListener("click", handleTableAction);

    elements.closeViewProductionModal.addEventListener("click", closeViewModal);
    elements.viewProductionModal.addEventListener("click", (event) => {
      if (event.target === elements.viewProductionModal) closeViewModal();
    });

    elements.cancelDeleteProduction.addEventListener("click", closeDeleteModal);
    elements.confirmDeleteProduction.addEventListener("click", confirmDelete);

    elements.deleteProductionModal.addEventListener("click", (event) => {
      if (event.target === elements.deleteProductionModal) closeDeleteModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (!elements.productionModal.hidden) closeModal();
      if (!elements.editProductionModal.hidden) {
        closeEditProductionModal();
      }
      if (!elements.viewProductionModal.hidden) closeViewModal();
      if (!elements.deleteProductionModal.hidden) closeDeleteModal();
    });
    elements.closeEditProductionModal.addEventListener(
      "click",
      closeEditProductionModal,
    );

    elements.cancelEditProduction.addEventListener(
      "click",
      closeEditProductionModal,
    );

    elements.editProductionForm.addEventListener("submit", updateProduction);

    // elements.editProductionModal.addEventListener("click", (event) => {
    //   if (event.target === elements.editProductionModal) {
    //     closeEditProductionModal();
    //   }
    // });
  };

  /* CACHE */

  const cacheElements = () => {
    elements.addButton = qs("#addProductionButton");
    elements.emptyAdd = qs("#emptyAddProduction");

    elements.totalBatches = qs("#totalBatches");
    elements.todayProduction = qs("#todayProduction");
    elements.plannedQuantitySummary = qs("#plannedQuantitySummary");
    elements.producedQuantitySummary = qs("#producedQuantitySummary");

    elements.productWiseTableBody = qs("#productWiseTableBody");
    elements.productWiseEmpty = qs("#productWiseEmpty");

    elements.search = qs("#productionSearch");
    elements.productFilter = qs("#productionProductFilter");
    elements.shiftFilter = qs("#productionShiftFilter");
    elements.dateFilter = qs("#productionDateFilter");
    elements.resetFilters = qs("#resetProductionFilters");

    elements.tableBody = qs("#productionTableBody");
    elements.productionEmpty = qs("#productionEmpty");
    elements.count = qs("#productionCount");
    elements.previousPage = qs("#previousProductionPage");
    elements.nextPage = qs("#nextProductionPage");
    elements.pageNumber = qs("#productionPageNumber");

    elements.productionModal = qs("#productionModal");
    elements.closeModal = qs("#closeProductionModal");
    elements.cancelProduction = qs("#cancelProduction");
    elements.form = qs("#productionForm");
    elements.productionId = qs("#productionId");
    elements.productionProduct = qs("#productionProduct");
    elements.productionBom = qs("#productionBom");
    elements.productionDate = qs("#productionDate");
    // elements.plannedQuantity = qs("#plannedQuantity");
    elements.producedQuantity = qs("#producedQuantity");
    elements.damagedQuantity = qs("#damagedQuantity");
    elements.productionShift = qs("#productionShift");
    elements.productionMachine = qs("#productionMachine");
    elements.productionSupervisor = qs("#productionSupervisor");
    elements.productionRemarks = qs("#productionRemarks");
    elements.materialsBody = qs("#productionMaterialsBody");
    elements.productionModalTitle = qs("#productionModalTitle");
    elements.productionModalDescription = qs("#productionModalDescription");
    elements.saveProduction = qs("#saveProduction");

    elements.viewProductionModal = qs("#viewProductionModal");
    elements.closeViewProductionModal = qs("#closeViewProductionModal");
    elements.viewProductionBody = qs("#viewProductionBody");

    elements.deleteProductionModal = qs("#deleteProductionModal");
    elements.deleteProductionMessage = qs("#deleteProductionMessage");
    elements.cancelDeleteProduction = qs("#cancelDeleteProduction");
    elements.confirmDeleteProduction = qs("#confirmDeleteProduction");

    // EDIT PRODUCTION MODAL
    elements.editProductionModal = qs("#editProductionModal");
    elements.closeEditProductionModal = qs("#closeEditProductionModal");
    elements.cancelEditProduction = qs("#cancelEditProduction");
    elements.editProductionForm = qs("#editProductionForm");
    elements.editProductionId = qs("#editProductionId");
    elements.editProductionProduct = qs("#editProductionProduct");
    elements.editProductionBom = qs("#editProductionBom");
    elements.editProductionDate = qs("#editProductionDate");
    // elements.editPlannedQuantity = qs("#editPlannedQuantity");
    elements.editProducedQuantity = qs("#editProducedQuantity");
    elements.editDamagedQuantity = qs("#editDamagedQuantity");
    elements.editProductionShift = qs("#editProductionShift");
    elements.editProductionMachine = qs("#editProductionMachine");
    elements.editProductionSupervisor = qs("#editProductionSupervisor");
    elements.editProductionRemarks = qs("#editProductionRemarks");
    elements.editProductionMaterialsBody = qs("#editProductionMaterialsBody");
    elements.updateProduction = qs("#updateProduction");
  };

  const init = async () => {
    cacheElements();
    bindEvents();

    elements.productionDate.value = todayISO();

    await Promise.all([loadProducts(), loadProduction()]);
  };

  return { init };
})();

const initProductionPage = () => ProductionPage.init();
