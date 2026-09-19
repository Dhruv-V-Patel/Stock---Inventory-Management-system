(() => {
  "use strict";

  const API_BASE = "/api/raw-materials";

  const getNextMaterialCode = async () => {
    try {
        elements.materialCode.value = "Generating...";

        const response = await request(`${API_BASE}/next-code`);

        const code = response?.code;

        if (!code) {
            throw new Error("Unable to generate material code.");
        }

        elements.materialCode.value = code;
    } catch (error) {
        console.error("[Raw Materials] code generation error:", error);

        elements.materialCode.value = "";
        showToast(
            error.message || "Unable to generate material code.",
            "error"
        );
    }
};

  const state = {
    materials: [],
    filteredMaterials: [],
    editingId: null,
    deletingId: null,
  };

  const $ = (selector) => document.querySelector(selector);

  const elements = {
    tableBody: $("#materialsTableBody"),
    resultCount: $("#tableResultCount"),
    searchInput: $("#searchInput"),
    categoryFilter: $("#categoryFilter"),
    statusFilter: $("#statusFilter"),
    resetFiltersButton: $("#resetFiltersButton"),

    totalMaterials: $("#totalMaterials"),
    activeMaterials: $("#activeMaterials"),
    totalCategories: $("#totalCategories"),
    inactiveMaterials: $("#inactiveMaterials"),

    addButton: $("#addMaterialButton"),
    modal: $("#materialModal"),
    modalTitle: $("#modalTitle"),
    modalSubtitle: $("#modalSubtitle"),
    closeModalButton: $("#closeModalButton"),
    cancelModalButton: $("#cancelModalButton"),
    form: $("#materialForm"),
    formError: $("#formError"),
    materialId: $("#materialId"),
    materialCode: $("#materialCode"),
    materialName: $("#materialName"),
    materialCategory: $("#materialCategory"),
    materialUnit: $("#materialUnit"),
    minimumStock: $("#minimumStock"),
    materialActive: $("#materialActive"),
    saveButton: $("#saveMaterialButton"),
    categorySuggestions: $("#categorySuggestions"),

    deleteModal: $("#deleteModal"),
    deleteMessage: $("#deleteMessage"),
    cancelDeleteButton: $("#cancelDeleteButton"),
    confirmDeleteButton: $("#confirmDeleteButton"),

    toastContainer: $("#toastContainer"),
  };

  const escapeHtml = (value) => {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
  };

  const formatNumber = (value) => {
    const number = Number(value ?? 0);
    return Number.isFinite(number)
      ? number.toLocaleString("en-IN", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        })
      : "0";
  };

  const normalize = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase();

  const formatCategoryName = (value) => {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  };

  const showToast = (message, type = "success") => {
    const container = $("#toastContainer");
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

  const setLoading = (message = "Loading raw materials...") => {
    elements.tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="table-state">
                    <div class="loading-state">
                        <span class="spinner"></span>
                        ${escapeHtml(message)}
                    </div>
                </td>
            </tr>
        `;
  };

  const renderEmpty = () => {
    elements.tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="table-state">
                    <div class="empty-state">
                        <i class="fa-solid fa-box-open"></i>
                        <strong>No raw materials found</strong>
                        <span>Try changing the search or filters.</span>
                    </div>
                </td>
            </tr>
        `;
  };

  const renderCategories = () => {
    const categoryMap = new Map();

    state.materials
      .map((material) => formatCategoryName(material.category))
      .filter(Boolean)
      .forEach((category) => {
        categoryMap.set(category.toLowerCase(), category);
      });

    const categories = [...categoryMap.values()].sort((a, b) =>
      a.localeCompare(b),
    );

    const current = formatCategoryName(elements.categoryFilter.value);

    elements.categoryFilter.innerHTML = `
        <option value="">All Categories</option>

        ${categories
          .map(
            (category) => `
            <option value="${escapeHtml(category)}">
                ${escapeHtml(category)}
            </option>
        `,
          )
          .join("")}
    `;

    elements.categoryFilter.value = categories.some(
      (category) => normalize(category) === normalize(current),
    )
      ? current
      : "";

    elements.categorySuggestions.innerHTML = categories
      .map((category) => `<option value="${escapeHtml(category)}"></option>`)
      .join("");
  };

  const renderSummary = () => {
    const total = state.materials.length;
    const active = state.materials.filter((item) =>
      Boolean(item.is_active),
    ).length;
    const inactive = total - active;

    const categories = new Set(
      state.materials.map((item) => normalize(item.category)).filter(Boolean),
    );

    elements.totalMaterials.textContent = total.toLocaleString("en-IN");
    elements.activeMaterials.textContent = active.toLocaleString("en-IN");
    elements.totalCategories.textContent =
      categories.size.toLocaleString("en-IN");
    elements.inactiveMaterials.textContent = inactive.toLocaleString("en-IN");
  };

  const renderTable = () => {
    const rows = state.filteredMaterials;

    elements.resultCount.textContent = `${rows.length.toLocaleString("en-IN")} ${rows.length === 1 ? "material" : "materials"}`;

    if (!rows.length) {
      renderEmpty();
      return;
    }

    elements.tableBody.innerHTML = rows
      .map((material) => {
        const id = Number(material.id);
        const active = Boolean(material.is_active);
        const category =
          formatCategoryName(material.category) || "Uncategorized";

        return `
                <tr>
                    <td>
                        <div class="material-name">
                            <div class="material-icon">
                                <i class="fa-solid fa-cubes"></i>
                            </div>
                            <div class="material-name-text">
                                <strong title="${escapeHtml(material.name)}">
                                    ${escapeHtml(material.name)}
                                </strong>
                                <span>Raw Material #${id}</span>
                            </div>
                        </div>
                    </td>

                    <td>
                        <strong>${escapeHtml(material.code)}</strong>
                    </td>

                    <td>
                        <span class="category-badge">
                            ${escapeHtml(category)}
                        </span>
                    </td>

                    <td>
                        <span class="unit-badge">
                            ${escapeHtml(material.unit)}
                        </span>
                    </td>

                    <td>
                        <span class="minimum-stock">
                            ${formatNumber(material.minimum_stock)}
                        </span>
                    </td>

                    <td>
                        <span class="status-badge ${active ? "active" : "inactive"}">
                            ${active ? "Active" : "Inactive"}
                        </span>
                    </td>

                    <td>
                        <div class="row-actions">
                            <button
                                class="icon-button"
                                type="button"
                                title="Edit"
                                data-action="edit"
                                data-id="${id}"
                            >
                                <i class="fa-solid fa-pen"></i>
                            </button>

                            <button
                                class="icon-button delete"
                                type="button"
                                title="${active ? "Deactivate" : "Activate"}"
                                data-action="${active ? "delete" : "activate"}"
                                data-id="${id}"
                            >
                                <i class="fa-solid ${active ? "fa-trash-can" : "fa-rotate-left"}"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
      })
      .join("");
  };

  const applyFilters = () => {
    const search = normalize(elements.searchInput.value);
    const category = normalize(elements.categoryFilter.value);
    const status = normalize(elements.statusFilter.value);

    state.filteredMaterials = state.materials.filter((material) => {
      const matchesSearch =
        !search ||
        normalize(material.code).includes(search) ||
        normalize(material.name).includes(search) ||
        normalize(material.category).includes(search);

      const matchesCategory =
        !category || normalize(material.category) === category;

      const matchesStatus =
        !status ||
        (status === "active" && Boolean(material.is_active)) ||
        (status === "inactive" && !Boolean(material.is_active));

      return matchesSearch && matchesCategory && matchesStatus;
    });

    renderTable();
  };

  const getToken = () => localStorage.getItem("accessToken");
  const request = async (url, options = {}) => {
    const token = getToken();

    const response = await fetch(url, {
      // credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
          data?.error ||
          `Request failed with status ${response.status}`,
      );
    }

    return data;
  };

  const loadMaterials = async () => {
    setLoading();

    try {
      const data = await request(API_BASE);

      state.materials = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : [];

      renderSummary();
      renderCategories();
      applyFilters();
    } catch (error) {
      console.error("[Raw Materials] load error:", error);

      elements.tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="table-state">
                        <div class="empty-state">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <strong>Failed to load raw materials</strong>
                            <span>${escapeHtml(error.message)}</span>
                        </div>
                    </td>
                </tr>
            `;

      showToast(error.message, "error");
    }
  };

  const openModal = (material = null) => {
    state.editingId = material ? Number(material.id) : null;

    elements.form.reset();
    elements.materialId.value = material?.id ?? "";
    elements.formError.textContent = "";
    elements.formError.classList.remove("show");

    elements.modalTitle.textContent = material
      ? "Edit Raw Material"
      : "Add Raw Material";

    elements.modalSubtitle.textContent = material
      ? "Update the raw material master record."
      : "Create a new raw material master record.";

    elements.materialCode.value = material?.code ?? "";
    elements.materialName.value = material?.name ?? "";
    elements.materialCategory.value = formatCategoryName(material?.category) ?? "";
    elements.materialUnit.value = material?.unit ?? "";
    elements.minimumStock.value = material?.minimum_stock ?? 0;
    elements.materialActive.checked = material
      ? Boolean(material.is_active)
      : true;

    elements.saveButton.innerHTML = `
            <i class="fa-solid fa-floppy-disk"></i>
            ${material ? "Update Material" : "Save Material"}
        `;

    elements.modal.classList.add("show");
    elements.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    if (!material) {
    getNextMaterialCode();
}
  };

  const closeModal = () => {
    elements.modal.classList.remove("show");
    elements.modal.setAttribute("aria-hidden", "true");

    if (!elements.deleteModal.classList.contains("show")) {
      document.body.style.overflow = "";
    }

    state.editingId = null;
  };

  const setFormError = (message) => {
    elements.formError.textContent = message;
    elements.formError.classList.toggle("show", Boolean(message));
  };

  const getPayload = () => ({
    code: elements.materialCode.value.trim(),
    name: elements.materialName.value.trim(),
    category: formatCategoryName(elements.materialCategory.value) || null,
    unit: elements.materialUnit.value.trim().toUpperCase(),
    minimum_stock: Number(elements.minimumStock.value || 0),
    is_active: Boolean(elements.materialActive.checked),
  });

  const validatePayload = (payload) => {
    // if (!payload.code) return "Material code is required.";
    if (!payload.name) return "Material name is required.";
    if (!payload.unit) return "Unit is required.";

    if (!Number.isFinite(payload.minimum_stock) || payload.minimum_stock < 0) {
      return "Minimum stock must be zero or greater.";
    }

    return "";
  };

  const saveMaterial = async (event) => {
    event.preventDefault();

    const payload = getPayload();
    const validationError = validatePayload(payload);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError("");
    elements.saveButton.disabled = true;
    elements.saveButton.innerHTML = `
            <span class="spinner"></span>
            Saving...
        `;

    try {
      const isEdit = Boolean(state.editingId);
      const url = isEdit ? `${API_BASE}/${state.editingId}` : API_BASE;
      await request(url, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      closeModal();
      showToast(
        isEdit
          ? "Raw material updated successfully."
          : "Raw material created successfully.",
      );

      await loadMaterials();
    } catch (error) {
      console.error("[Raw Materials] save error:", error);
      setFormError(error.message);
    } finally {
      elements.saveButton.disabled = false;
      elements.saveButton.innerHTML = `
                <i class="fa-solid fa-floppy-disk"></i>
                ${state.editingId ? "Update Material" : "Save Material"}
            `;
    }
  };

  const openDeleteModal = (material) => {
    state.deletingId = Number(material.id);

    // elements.deleteMessage.textContent = `“${material.name}” will be marked inactive. Existing purchase and production history will remain safe.`;

    elements.deleteMessage.textContent = `"${material.name}" will be permanently deleted. This action cannot be undone.`;

    elements.deleteModal.classList.add("show");
    elements.deleteModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  const closeDeleteModal = () => {
    elements.deleteModal.classList.remove("show");
    elements.deleteModal.setAttribute("aria-hidden", "true");

    if (!elements.modal.classList.contains("show")) {
      document.body.style.overflow = "";
    }

    state.deletingId = null;
  };

  const deactivateMaterial = async () => {
    if (!state.deletingId) return;

    elements.confirmDeleteButton.disabled = true;

    try {
      await request(`${API_BASE}/${state.deletingId}`, {
        method: "DELETE",
      });

      closeDeleteModal();
      showToast("Raw material Deleted successfully.");
      await loadMaterials();
    } catch (error) {
      console.error("[Raw Materials] delete error:", error);
       showToast(
            error.message || "Unable to delete raw material.",
            "error"
        );
    } finally {
      elements.confirmDeleteButton.disabled = false;
    }
  };

  const activateMaterial = async (material) => {
    try {
      await request(`${API_BASE}/${material.id}`, {
        method: "PUT",
        body: JSON.stringify({
          code: material.code,
          name: material.name,
          category: formatCategoryName(material.category) || null,
          unit: material.unit,
          minimum_stock: Number(material.minimum_stock || 0),
          is_active: true,
        }),
      });

      showToast("Raw material activated successfully.");
      await loadMaterials();
    } catch (error) {
      console.error("[Raw Materials] activate error:", error);
      showToast(error.message, "error");
    }
  };

  const handleTableAction = (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const id = Number(button.dataset.id);
    const material = state.materials.find((item) => Number(item.id) === id);

    if (!material) return;

    if (button.dataset.action === "edit") {
      openModal(material);
      return;
    }

    if (button.dataset.action === "delete") {
      openDeleteModal(material);
      return;
    }

    if (button.dataset.action === "activate") {
      activateMaterial(material);
    }
  };

  const bindEvents = () => {
    elements.searchInput.addEventListener("input", applyFilters);
    elements.categoryFilter.addEventListener("change", applyFilters);
    elements.statusFilter.addEventListener("change", applyFilters);

    elements.resetFiltersButton.addEventListener("click", () => {
      elements.searchInput.value = "";
      elements.categoryFilter.value = "";
      elements.statusFilter.value = "";
      applyFilters();
    });

    elements.addButton.addEventListener("click", () => openModal());
    elements.closeModalButton.addEventListener("click", closeModal);
    elements.cancelModalButton.addEventListener("click", closeModal);
    elements.form.addEventListener("submit", saveMaterial);

    elements.tableBody.addEventListener("click", handleTableAction);

    elements.cancelDeleteButton.addEventListener("click", closeDeleteModal);
    elements.confirmDeleteButton.addEventListener("click", deactivateMaterial);

    // elements.modal.addEventListener("click", (event) => {
    //   if (event.target === elements.modal) closeModal();
    // });

    elements.deleteModal.addEventListener("click", (event) => {
      if (event.target === elements.deleteModal) closeDeleteModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (elements.deleteModal.classList.contains("show")) {
        closeDeleteModal();
      } else if (elements.modal.classList.contains("show")) {
        closeModal();
      }
    });
  };

  const init = async () => {
    bindEvents();
    await loadMaterials();
  };

  document.addEventListener("DOMContentLoaded", init);
})();
