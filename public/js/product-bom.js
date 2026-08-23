const ProductBomPage = (() => {
  "use strict";

  const state = {
    boms: [],
    products: [],
    rawMaterials: [],
    filteredBoms: [],

    editingId: null,
    deletingId: null,
  };


  const elements = {};

  const qs = (selector) => document.querySelector(selector);

  const escapeHtml = (value) => {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  const apiRequest = async (url, options = {}) => {
    const token = localStorage.getItem("accessToken");

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
    const container = document.getElementById("toastContainer");
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
      <span class="toast-message">${escapeHtml(message)}</span>
      <button type="button" class="toast-close" aria-label="Close">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    const removeToast = () => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 250);
    };

    toast.querySelector(".toast-close").addEventListener("click", removeToast);
    setTimeout(removeToast, 3000);
  };

  /* ======================================
     NORMALIZE
  ====================================== */

  const normalizeProduct = (product) => ({
    id: product.id,
    code: product.code || "",
    name: product.name || "",
    unit: product.unit || "PCS",
    is_active: product.is_active !== false,
  });

  const normalizeRawMaterial = (material) => ({
    id: material.id,
    code: material.code || "",
    name: material.name || "",
    unit: material.unit || "",
    is_active: material.is_active !== false,
  });

  const normalizeBomItem = (item) => ({
    id: item.id ?? null,
    raw_material_id:
      item.raw_material_id ??
      item.rawMaterialId ??
      item.raw_material?.id ??
      null,
    raw_material_name: item.raw_material_name || item.raw_material?.name || "",
    raw_material_code: item.raw_material_code || item.raw_material?.code || "",
    quantity: Number(item.quantity || 0),
    unit: item.unit || "",
  });

  const normalizeBom = (bom) => ({
    id: bom.id,
    product_id: bom.product_id ?? bom.productId ?? bom.product?.id,
    product_name: bom.product_name || bom.product?.name || "",
    product_code: bom.product_code || bom.product?.code || "",
    name: bom.name || "",
    is_active: bom.is_active !== false,
    created_at: bom.created_at || null,
    updated_at: bom.updated_at || bom.created_at || null,
    items: Array.isArray(bom.items)
      ? bom.items.map(normalizeBomItem)
      : Array.isArray(bom.product_bom_items)
        ? bom.product_bom_items.map(normalizeBomItem)
        : [],
  });

  /* ======================================
     LOAD PRODUCTS
  ====================================== */

  const loadProducts = async () => {
    const payload = await apiRequest("/api/products");

    const rows = Array.isArray(payload)
      ? payload
      : payload?.products || payload?.data || [];

    state.products = rows
      .map(normalizeProduct)
      .filter((product) => product.is_active);

    populateProductSelect();
  };

  /* ======================================
     LOAD RAW MATERIALS
  ====================================== */

  const loadRawMaterials = async () => {
    const payload = await apiRequest("/api/raw-materials");

    const rows = Array.isArray(payload)
      ? payload
      : payload?.rawMaterials || payload?.raw_materials || payload?.data || [];

    state.rawMaterials = rows
      .map(normalizeRawMaterial)
      .filter((material) => material.is_active);
  };

  /* ======================================
     LOAD BOMS
  ====================================== */
  const loadBoms = async () => {
    renderLoading();
  try {
    const payload = await apiRequest("/api/product-boms");

    const rows = Array.isArray(payload)
      ? payload
      : payload?.boms ||
        payload?.productBoms ||
        payload?.product_boms ||
        payload?.data ||
        [];

    state.boms = rows.map(normalizeBom);

    applyFilters();

  } catch (error) {
    console.error(
      "Failed to load Product BOMs:",
      error
    );

    renderError(
      error.message ||
      "Unable to load Product BOMs."
    );
  }
};

  /* ======================================
     POPULATE PRODUCT SELECT
  ====================================== */

  const populateProductSelect = () => {
    const currentValue = elements.productId.value;

    elements.productId.innerHTML = `
      <option value="">
        Select Product
      </option>

      ${state.products
        .map(
          (product) => `
            <option value="${escapeHtml(product.id)}">
              ${escapeHtml(product.code)}
              — 
              ${escapeHtml(product.name)}
            </option>
          `,
        )
        .join("")}
    `;

    if (
      currentValue &&
      state.products.some(
        (product) => String(product.id) === String(currentValue),
      )
    ) {
      elements.productId.value = currentValue;
    }
  };

  /* ======================================
     MATERIAL OPTIONS
  ====================================== */

  const getMaterialOptions = (selectedId = null) => {
    return `
      <option value="">
        Select Raw Material
      </option>

      ${state.rawMaterials
        .map((material) => {
          const selected =
            String(material.id) === String(selectedId) ? "selected" : "";

          return `
            <option
              value="${escapeHtml(material.id)}"
              data-unit="${escapeHtml(material.unit)}"
              ${selected}
            >
              ${escapeHtml(material.code)}
              — 
              ${escapeHtml(material.name)}
            </option>
          `;
        })
        .join("")}
    `;
  };

  /* ======================================
     ADD MATERIAL ROW
  ====================================== */

  const addMaterialRow = (item = null) => {
    const row = document.createElement("div");
    row.className = "bom-material-row";
    row.dataset.rowId =
      crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const rawMaterialId = item?.raw_material_id ?? "";
    const quantity = item?.quantity ?? "";
    const unit = item?.unit ?? "";

    row.innerHTML = `
      <div class="bom-material-field">

        <label>
          Raw Material
        </label>

        <select
          class="bom-material-select"
          data-field="raw_material_id"
          required
        >
          ${getMaterialOptions(rawMaterialId)}
        </select>

      </div>


      <div class="bom-material-field">

        <label>
          Quantity
        </label>

        <input
          type="number"
          class="bom-material-quantity"
          data-field="quantity"
          min="0.1"
          step="any"
          value="${escapeHtml(quantity)}"
          placeholder="0.00"
          required
        >

      </div>


      <div class="bom-material-field">

        <label>
          Unit
        </label>

        <div
          class="bom-material-unit"
          data-field="unit"
        >
          ${escapeHtml(unit || "—")}
        </div>

      </div>


      <button
        type="button"
        class="bom-remove-material"
        title="Remove material"
        aria-label="Remove material"
      >
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;

    elements.materialList.appendChild(row);
    elements.materialEmptyState.classList.add("hidden");
    const select = row.querySelector(".bom-material-select");

    const updateUnit = () => {
      const option = select.options[select.selectedIndex];
      const materialUnit = option?.dataset?.unit || "";
      const unitElement = row.querySelector(".bom-material-unit");
      unitElement.textContent = materialUnit || "—";
    };

    select.addEventListener("change", updateUnit);

    row
      .querySelector(".bom-remove-material")
      .addEventListener("click", () => removeMaterialRow(row));

    updateUnit();
  };

  /* ======================================
     REMOVE MATERIAL
  ====================================== */

  const removeMaterialRow = (row) => {
    row.remove();

    const rows = elements.materialList.querySelectorAll(".bom-material-row");

    if (!rows.length) {
      elements.materialEmptyState.classList.remove("hidden");
    }
  };

  /* ======================================
     GET MATERIAL ROWS
  ====================================== */

  const getMaterialRows = () => {
    return [...elements.materialList.querySelectorAll(".bom-material-row")];
  };

  /* ======================================
     COLLECT MATERIALS
  ====================================== */

  const collectMaterials = () => {
    const rows = getMaterialRows();
    const items = [];
    const usedMaterials = new Set();

    for (const row of rows) {
      const rawMaterialId = row.querySelector(".bom-material-select")?.value;
      const quantityValue = row.querySelector(".bom-material-quantity")?.value;
      if (!rawMaterialId) {
        throw new Error("Please select a raw material for every row.");
      }

      const quantity = Number(quantityValue);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Material quantity must be greater than zero.");
      }

      if (usedMaterials.has(String(rawMaterialId))) {
        throw new Error(
          "The same raw material cannot be added more than once.",
        );
      }

      usedMaterials.add(String(rawMaterialId));

      const material = state.rawMaterials.find(
        (item) => String(item.id) === String(rawMaterialId),
      );

      if (!material) {
        throw new Error("Selected raw material is no longer available.");
      }

      items.push({
        raw_material_id: Number(rawMaterialId),
        quantity,
        unit: material.unit,
      });
    }

    if (!items.length) {
      throw new Error("Please add at least one raw material.");
    }

    return items;
  };

  /* ======================================
     FILTER
  ====================================== */
  const applyFilters = () => {
  const search = elements.search.value
    .trim()
    .toLowerCase();

  const status = elements.statusFilter.value;

  state.filteredBoms = state.boms.filter((bom) => {

    const matchesSearch =
      !search ||
      bom.name.toLowerCase().includes(search) ||
      bom.product_name.toLowerCase().includes(search) ||
      bom.product_code.toLowerCase().includes(search);

    const matchesStatus =
      !status ||
      status === "all" ||
      (status === "active" && bom.is_active) ||
      (status === "inactive" && !bom.is_active);

    return matchesSearch && matchesStatus;
  });

  renderBoms(state.filteredBoms);

  updateSummary();
};

  /* ======================================
     RENDER TABLE
  ====================================== */
const renderBoms = (boms) => {
  // Always clear the loading / previous table content first
  elements.tableBody.innerHTML = "";

  // No BOMs
  if (!boms.length) {
    elements.empty.hidden = false;
    return;
  }

  // BOMs available
  elements.empty.hidden = true;

  elements.tableBody.innerHTML = boms
    .map((bom, index) => {
      const updated = formatDate(bom.updated_at);

      return `
        <tr>
          <td>
            ${index + 1}
          </td>

          <td>
            <div class="bom-product">
              <div class="bom-product-icon">
                <i class="fa-solid fa-box"></i>
              </div>

              <div class="bom-product-info">
                <div class="bom-product-name">
                  ${escapeHtml(
                    bom.product_name || "Unknown Product"
                  )}
                </div>

                <div class="bom-product-code">
                  ${escapeHtml(
                    bom.product_code || "—"
                  )}
                </div>
              </div>
            </div>
          </td>

          <td>
            <div class="bom-name">
              ${escapeHtml(bom.name)}
            </div>
          </td>

          <td>
            <span class="material-count">
              ${bom.items.length}
              ${
                bom.items.length === 1
                  ? "Material"
                  : "Materials"
              }
            </span>
          </td>

          <td>
            <span
              class="bom-status ${
                bom.is_active
                  ? "active"
                  : "inactive"
              }"
            >
              ${
                bom.is_active
                  ? "Active"
                  : "Inactive"
              }
            </span>
          </td>

          <td>
            ${escapeHtml(updated)}
          </td>

          <td>
            <div class="bom-actions">

              <button
                type="button"
                class="bom-action-btn"
                data-action="edit"
                data-id="${escapeHtml(bom.id)}"
                title="Edit BOM"
              >
                <i class="fa-solid fa-pen"></i>
              </button>

              <button
                type="button"
                class="bom-action-btn delete"
                data-action="delete"
                data-id="${escapeHtml(bom.id)}"
                title="Delete BOM"
                aria-label="Delete BOM"
              >
                <i class="fa-solid fa-trash-can"></i>
              </button>

            </div>
          </td>
        </tr>
      `;
    })
    .join("");
};
  /* ======================================
     LOADING
  ====================================== */

  const renderLoading = () => {
    elements.tableBody.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="table-loading"
        >
          <i class="fa-solid fa-spinner fa-spin"></i>
          Loading BOMs...
        </td>
      </tr>
    `;

    elements.empty.hidden = true;
  };

  /* ======================================
     ERROR
  ====================================== */

  const renderError = (message) => {
    elements.tableBody.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="table-loading"
        >
          <i class="fa-solid fa-triangle-exclamation"></i>
          ${escapeHtml(message || "Unable to load Product BOMs.")}
        </td>
      </tr>
    `;

    elements.empty.hidden = true;

    updateSummary();
  };

  /* ======================================
     SUMMARY
  ====================================== */

  const updateSummary = () => {
    const total = state.boms.length;
    const active = state.boms.filter((bom) => bom.is_active).length;
    const products = new Set(state.boms.map((bom) => String(bom.product_id)))
      .size;

    const materials = new Set(
      state.boms.flatMap((bom) =>
        bom.items.map((item) => String(item.raw_material_id)),
      ),
    ).size;

    elements.totalBoms.textContent = total.toLocaleString("en-IN");
    elements.activeBoms.textContent = active.toLocaleString("en-IN");
    elements.productsCovered.textContent = products.toLocaleString("en-IN");
    elements.rawMaterialsUsed.textContent = materials.toLocaleString("en-IN");
  };

  /* ======================================
     DATE
  ====================================== */

  const formatDate = (value) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  /* ======================================
     FORM RESET
  ====================================== */

  const resetForm = () => {
    elements.form.reset();
    elements.bomId.value = "";
    elements.bomIsActive.checked = true;
    elements.modalTitle.textContent = "Create Product BOM";
    elements.saveBom.querySelector("span").textContent = "Save BOM";
    elements.formMessage.textContent = "";
    elements.formMessage.className = "bom-form-message";
    elements.materialList.innerHTML = "";
    elements.materialList.appendChild(elements.materialEmptyState);
    elements.materialEmptyState.classList.remove("hidden");
    state.editingId = null;
  };

  /* ======================================
     OPEN MODAL
  ====================================== */
const openModal = (bom = null) => {
  resetForm();

  if (bom) {
    state.editingId = bom.id;

    elements.modalTitle.textContent = "Edit Product BOM";

    elements.saveBom.querySelector("span").textContent =
      "Update BOM";

    elements.bomId.value = bom.id;
    elements.productId.value = String(bom.product_id);
    elements.bomName.value = bom.name;
    elements.bomIsActive.checked = bom.is_active;

    for (const item of bom.items) {
      addMaterialRow(item);
    }
  } else {
    elements.modalTitle.textContent = "Create Product BOM";

    elements.saveBom.querySelector("span").textContent =
      "Save BOM";
  }

  elements.modal.hidden = false;

  document.body.style.overflow = "hidden";

  requestAnimationFrame(() => {
    if (bom) {
      elements.bomName.focus();
    } else {
      elements.productId.focus();
    }
  });
};

const closeModal = () => {
  elements.modal.hidden = true;
  document.body.style.overflow = "";
  resetForm();
};
  /* ======================================
     FORM VALIDATION
  ====================================== */

  const validateForm = () => {
    const productId = elements.productId.value;

    const name = elements.bomName.value.trim();

    if (!productId) {
      throw new Error("Please select a product.");
    }

    if (!name) {
      throw new Error("BOM name is required.");
    }

    if (name.length > 150) {
      throw new Error("BOM name cannot exceed 150 characters.");
    }
  };

  /* ======================================
     FORM PAYLOAD
  ====================================== */

  const getFormPayload = () => {
    return {
      product_id: Number(elements.productId.value),
      name: elements.bomName.value.trim(),
      is_active: elements.bomIsActive.checked,
      items: collectMaterials(),
    };
  };

  /* ======================================
     SAVE BOM
  ====================================== */

  const saveBom = async (event) => {
    event.preventDefault();
    elements.formMessage.textContent = "";
    elements.formMessage.className = "bom-form-message";

    try {
      validateForm();

      const payload = getFormPayload();
      const isEditing = Boolean(state.editingId);
      elements.saveBom.disabled = true;
      elements.saveBom.querySelector("span").textContent = isEditing
        ? "Updating..."
        : "Saving...";

      const url = isEditing
        ? `/api/product-boms/${state.editingId}`
        : "/api/product-boms";

      const method = isEditing ? "PUT" : "POST";

      await apiRequest(url, {
        method,
        body: JSON.stringify(payload),
      });

      closeModal();

      await loadBoms();

      showToast(
        isEditing
          ? "Product Design updated successfully."
          : "product Design Added successfully.",
      );

    } catch (error) {
      console.error("Failed to save Product BOM:", error);
      elements.formMessage.textContent = error.message || "Unable to save BOM.";
      elements.formMessage.className = "bom-form-message error";
      showToast("Failed to save Product Design", "error");
    } finally {
      elements.saveBom.disabled = false;
      elements.saveBom.querySelector("span").textContent = state.editingId
        ? "Update BOM"
        : "Save BOM";
    }
  };

  /* ======================================
     DELETE
  ====================================== */


// const openDeleteModal = (id) => {
//   const bom = state.boms.find(
//     (item) => String(item.id) === String(id)
//   );

//   if (!bom) {
//     return;
//   }

//   state.deletingId = bom.id;

//   elements.deleteBomModal.hidden = false;

//   document.body.style.overflow = "hidden";
// };

// const closeDeleteModal = () => {
//   elements.deleteBomModal.hidden = true;

//   state.deletingId = null;

//   document.body.style.overflow = "";
// };


const openDeleteModal = (id) => {
  const bom = state.boms.find(
    (item) => String(item.id) === String(id)
  );

  if (!bom) {
    console.error("BOM not found:", id);
    return;
  }

  state.deletingId = bom.id;

  elements.deleteBomModal.hidden = false;
  elements.deleteBomModal.classList.add("show");

  document.body.style.overflow = "hidden";
};

const closeDeleteModal = () => {
  elements.deleteBomModal.classList.remove("show");
  elements.deleteBomModal.hidden = true;

  state.deletingId = null;

  document.body.style.overflow = "";
};
const deleteBom = async () => {
    if (!state.deletingId) {
      return;
    }

    const id = state.deletingId;

    elements.confirmDeleteButton.disabled = true;

    elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Deleting...
    `;

    try {
      await apiRequest(`/api/product-boms/${id}`, {
        method: "DELETE",
      });

      closeDeleteModal();

      await loadBoms();
      showToast("Product Design deleted successfully.");
    } catch (error) {
      console.error("Failed to delete BOM:", error);
      showToast(error.message || "Unable to delete product design.", "error");

    } finally {
      elements.confirmDeleteButton.disabled = false;

      elements.confirmDeleteButton.innerHTML = `
        <i class="fa-solid fa-trash-can"></i>
        Delete
      `;
    }
  };

  /* ======================================
     TABLE ACTIONS
  ====================================== */

  const handleTableAction = (event) => {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const id = button.dataset.id;
    const action = button.dataset.action;
    const bom = state.boms.find((item) => String(item.id) === String(id));

    if (!bom) {
      return;
    }

    if (action === "edit") {
      openModal(bom);
    }

    if (action === "delete") {
      openDeleteModal(id);
    }
  };

  /* ======================================
     CACHE ELEMENTS
  ====================================== */

  const cacheElements = () => {
    elements.addBomButton = qs("#addBomButton");
    elements.emptyAddBomButton = qs("#emptyAddBomButton");
    elements.totalBoms = qs("#totalBoms");
    elements.activeBoms = qs("#activeBoms");
    elements.productsCovered = qs("#productsCovered");
    elements.rawMaterialsUsed = qs("#rawMaterialsUsed");
    elements.search = qs("#bomSearch");
    elements.statusFilter = qs("#bomStatusFilter");
    elements.tableBody = qs("#bomTableBody");
    elements.empty = qs("#bomEmptyState");
    elements.modal = qs("#bomModal");
    elements.closeModal = qs("#closeBomModal");
    elements.cancel = qs("#cancelBomButton");
    elements.form = qs("#bomForm");
    elements.bomId = qs("#bomId");
    elements.productId = qs("#productId");
    elements.bomName = qs("#bomName");
    elements.bomIsActive = qs("#bomIsActive");
    elements.materialList = qs("#bomMaterialList");
    elements.materialEmptyState = qs("#materialEmptyState");
    elements.addMaterialButton = qs("#addMaterialButton");
    elements.formMessage = qs("#bomFormMessage");
    elements.modalTitle = qs("#bomModalTitle");
    elements.saveBom = qs("#saveBomButton");
    elements.deleteBomModal = qs("#deleteBomModal");
    elements.cancelDeleteButton = qs("#cancelDeleteButton");
    elements.confirmDeleteButton = qs("#confirmDeleteButton");
  };

  /* ======================================
     EVENTS
  ====================================== */

const bindEvents = () => {
  elements.addBomButton.addEventListener("click", () => {
    openModal();
  });

  elements.emptyAddBomButton.addEventListener("click", () => {
    openModal();
  });

  elements.closeModal.addEventListener("click", closeModal);

  elements.cancel.addEventListener("click", closeModal);

  // Click outside modal content
  // elements.modal.addEventListener("click", (event) => {
  //   if (event.target === elements.modal) {
  //     closeModal();
  //   }
  // });

  elements.addMaterialButton.addEventListener("click", () => {
    addMaterialRow();
  });

  elements.form.addEventListener("submit", saveBom);

  elements.search.addEventListener("input", applyFilters);

  elements.statusFilter.addEventListener("change", applyFilters);

  elements.tableBody.addEventListener("click", handleTableAction);

  // elements.cancelDeleteButton.addEventListener(
  //   "click",
  //   closeDeleteModal,
  // );

  // elements.confirmDeleteButton.addEventListener(
  //   "click",
  //   deleteBom,
  // );

  elements.confirmDeleteButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();

  deleteBom();
});

elements.cancelDeleteButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();

  closeDeleteModal();
});

  // Escape
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (!elements.modal.hidden) {
      closeModal();
      return;
    }

    if (!elements.deleteBomModal.hidden) {
      closeDeleteModal();
    }
  });
};
  
const init = async () => {
  try {
    cacheElements();

    bindEvents();

    await Promise.all([
      loadProducts(),
      loadRawMaterials(),
    ]);

    await loadBoms();

  } catch (error) {
    console.error(
      "Failed to initialize Product BOM:",
      error
    );

    if (elements.tableBody && elements.empty) {
      renderError(
        error.message ||
        "Unable to initialize Product BOM page."
      );
    }
  }
};

  return {
    init,
  };
})();

const initProductBomPage = () => {
  ProductBomPage.init();
};
