const ExpenseCategoriesPage = (() => {
  "use strict";

  // =========================================================
  // STATE
  // =========================================================

  const state = {
    categories: [],
    filteredCategories: [],
    editingId: null,
    deletingId: null,
    loading: false,
  };

  // =========================================================
  // ELEMENTS
  // =========================================================

  const elements = {};

  const qs = (selector, parent = document) => {
    return parent.querySelector(selector);
  };

  // =========================================================
  // AUTH
  // =========================================================

  function getToken() {
    return (
      localStorage.getItem("accessToken") || localStorage.getItem("token") || ""
    );
  }

  // =========================================================
  // HTML ESCAPE
  // =========================================================

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // =========================================================
  // API REQUEST
  // =========================================================

  async function apiRequest(url, options = {}) {
    const token = getToken();

    const config = {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined
          ? {
              "Content-Type": "application/json",
            }
          : {}),
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
        ...(options.headers || {}),
      },
    };

    if (options.body !== undefined) {
      config.body =
        typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body);
    }

    let response;

    try {
      response = await fetch(url, config);
    } catch (error) {
      console.error("API Request Error:", error);
      throw new Error("Unable to connect to server.");
    }

    if (response.status === 401) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("token");

      window.location.replace("/login");

      throw new Error("Session expired.");
    }

    let data = null;

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }
    } else {
      try {
        const text = await response.text();

        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = {
              message: text,
            };
          }
        }
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error ||
        `Request failed with status ${response.status}`;

      throw new Error(message);
    }

    return data;
  }

  // =========================================================
  // TOAST
  // =========================================================

  function showToast(message, type = "success") {
    if (!elements.toastContainer) {
      console.log(message);
      return;
    }

    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    const icon =
      type === "success"
        ? "fa-circle-check"
        : type === "error"
          ? "fa-circle-exclamation"
          : "fa-circle-info";

    toast.innerHTML = `
            <div class="toast-icon">
                <i class="fa-solid ${icon}"></i>
            </div>

            <div class="toast-content">
                ${escapeHtml(message)}
            </div>

            <button
                type="button"
                class="toast-close"
                aria-label="Close"
            >
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

    elements.toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    const closeToast = () => {
      toast.classList.remove("show");

      setTimeout(() => {
        toast.remove();
      }, 250);
    };

    toast.querySelector(".toast-close")?.addEventListener("click", closeToast);

    setTimeout(closeToast, 3500);
  }

  // =========================================================
  // NORMALIZE CATEGORY
  // =========================================================

  function normalizeCategory(item) {
    if (!item || typeof item !== "object") {
      return null;
    }

    return {
      id: item.id ?? item.category_id ?? null,

      name: item.name ?? item.category_name ?? "",

      is_active:
        item.is_active !== undefined
          ? Boolean(item.is_active)
          : item.active !== undefined
            ? Boolean(item.active)
            : true,

      created_at: item.created_at ?? null,

      updated_at: item.updated_at ?? null,
    };
  }

  // =========================================================
  // DATE FORMAT
  // =========================================================

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // =========================================================
  // LOADING
  // =========================================================

  function renderLoading() {
    if (!elements.rows) {
      return;
    }

    elements.rows.innerHTML = `
            <tr>
                <td colspan="3" class="table-loading">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    Loading expense categories...
                </td>
            </tr>
        `;
  }

  // =========================================================
  // EMPTY
  // =========================================================

  function renderEmpty() {
    if (!elements.rows) {
      return;
    }

    elements.rows.innerHTML = `
            <tr>
                <td colspan="3" class="expense-empty">
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fa-solid fa-tags"></i>
                        </div>

                        <h3>No Expense Categories</h3>

                        <p>
                            No expense categories have been created yet.
                        </p>

                        <button
                            type="button"
                            class="primary-button"
                            data-action="add"
                        >
                            <i class="fa-solid fa-plus"></i>
                            Add Category
                        </button>
                    </div>
                </td>
            </tr>
        `;
  }

  // =========================================================
  // ERROR
  // =========================================================

  function renderError(message) {
    if (!elements.rows) {
      return;
    }

    elements.rows.innerHTML = `
            <tr>
                <td colspan="3" class="expense-empty">
                    <div class="empty-state">
                        <div class="empty-icon danger">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </div>

                        <h3>Unable to Load Categories</h3>

                        <p>
                            ${escapeHtml(message)}
                        </p>

                        <button
                            type="button"
                            class="secondary-button"
                            data-action="reload"
                        >
                            <i class="fa-solid fa-rotate-right"></i>
                            Retry
                        </button>
                    </div>
                </td>
            </tr>
        `;
  }

  // =========================================================
  // RENDER TABLE
  // =========================================================

  function renderTable() {
    if (!elements.rows) {
      return;
    }

    const categories = state.filteredCategories;

    if (!categories.length) {
      renderEmpty();
      return;
    }

    elements.rows.innerHTML = categories
      .map((category) => {
        const id = escapeHtml(category.id);
        const name = escapeHtml(category.name);

        const active = Boolean(category.is_active);

        return `
                    <tr data-id="${id}">

                        <td>
                            <div class="category-name-wrap">

                                <div class="category-row-icon">
                                    <i class="fa-solid fa-tag"></i>
                                </div>

                                <div>
                                    <div class="category-name">
                                        ${name || "-"}
                                    </div>

                                    <div class="category-meta">
                                        Category ID: ${id || "-"}
                                    </div>
                                </div>

                            </div>
                        </td>

                        <td>
                            <span class="expense-status ${active ? "active" : "inactive"}">
                                <span class="status-dot"></span>
                                ${active ? "Active" : "Inactive"}
                            </span>
                        </td>

                        <td>
                            <div class="expense-actions">

                                <button
                                    type="button"
                                    class="expense-action table-action"
                                    data-action="view"
                                    data-id="${id}"
                                    title="View"
                                    aria-label="View category"
                                >
                                    <i class="fa-solid fa-eye"></i>
                                </button>

                                <button
                                    type="button"
                                    class="expense-action table-action"
                                    data-action="edit"
                                    data-id="${id}"
                                    title="Edit"
                                    aria-label="Edit category"
                                >
                                    <i class="fa-solid fa-pen"></i>
                                </button>

                                <button
                                    type="button"
                                    class="expense-action danger table-action"
                                    data-action="delete"
                                    data-id="${id}"
                                    title="Delete"
                                    aria-label="Delete category"
                                >
                                    <i class="fa-solid fa-trash"></i>
                                </button>

                            </div>
                        </td>

                    </tr>
                `;
      })
      .join("");
  }

  // =========================================================
  // LOAD CATEGORIES
  // =========================================================

  async function loadCategories() {
    state.loading = true;

    renderLoading();

    try {
      const response = await apiRequest("/api/expenses/categories");

      let data = response;

      if (Array.isArray(response)) {
        data = response;
      } else if (Array.isArray(response?.data)) {
        data = response.data;
      } else if (Array.isArray(response?.categories)) {
        data = response.categories;
      } else if (Array.isArray(response?.rows)) {
        data = response.rows;
      } else {
        data = [];
      }

      state.categories = data.map(normalizeCategory).filter(Boolean);

      state.filteredCategories = [...state.categories];

      renderTable();
    } catch (error) {
      console.error("Failed to load expense categories:", error);

      state.categories = [];
      state.filteredCategories = [];

      renderError(
        error.message || "Something went wrong while loading categories.",
      );
    } finally {
      state.loading = false;
    }
  }

  // =========================================================
  // FILTER
  // =========================================================

  function applyFilter(searchValue = "") {
    const search = String(searchValue).trim().toLowerCase();

    if (!search) {
      state.filteredCategories = [...state.categories];
    } else {
      state.filteredCategories = state.categories.filter((category) => {
        return String(category.name).toLowerCase().includes(search);
      });
    }

    renderTable();
  }

  // =========================================================
  // RESET FORM
  // =========================================================

  function resetForm() {
    state.editingId = null;

    if (elements.form) {
      elements.form.reset();
    }

    if (elements.categoryId) {
      elements.categoryId.value = "";
    }

    if (elements.name) {
      elements.name.value = "";
    }

    if (elements.active) {
      elements.active.checked = true;
    }

    if (elements.modalTitle) {
      elements.modalTitle.textContent = "Expense Category";
    }

    const modalDescription = elements.modalTitle
      ?.closest(".modal-title-wrap")
      ?.querySelector("p");

    if (modalDescription) {
      modalDescription.textContent = "Add or update an expense category.";
    }

    const submitButton = elements.form?.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.innerHTML = `
                <i class="fa-solid fa-check"></i>
                <span>Save Category</span>
            `;
    }
  }

  // =========================================================
  // OPEN FORM
  // =========================================================

  function openForm(category = null) {
    resetForm();

    if (category) {
      state.editingId = category.id;

      if (elements.categoryId) {
        elements.categoryId.value = category.id ?? "";
      }

      if (elements.name) {
        elements.name.value = category.name ?? "";
      }

      if (elements.active) {
        elements.active.checked = Boolean(category.is_active);
      }

      if (elements.modalTitle) {
        elements.modalTitle.textContent = "Edit Expense Category";
      }

      const modalDescription = elements.modalTitle
        ?.closest(".modal-title-wrap")
        ?.querySelector("p");

      if (modalDescription) {
        modalDescription.textContent = "Update the selected expense category.";
      }

      const submitButton = elements.form?.querySelector(
        'button[type="submit"]',
      );

      if (submitButton) {
        submitButton.innerHTML = `
                    <i class="fa-solid fa-check"></i>
                    <span>Update Category</span>
                `;
      }
    }

    if (!elements.modal) {
      return;
    }

    elements.modal.classList.add("show");
    elements.modal.setAttribute("aria-hidden", "false");

    setTimeout(() => {
      elements.name?.focus();
    }, 100);
  }

  // =========================================================
  // CLOSE FORM
  // =========================================================

  function closeForm() {
    if (!elements.modal) {
      return;
    }

    elements.modal.classList.remove("show");

    elements.modal.setAttribute("aria-hidden", "true");

    state.editingId = null;
  }

  // =========================================================
  // EDIT
  // =========================================================

  function editCategory(id) {
    const category = state.categories.find(
      (item) => String(item.id) === String(id),
    );

    if (!category) {
      showToast("Category not found.", "error");

      return;
    }

    openForm(category);
  }

  // =========================================================
  // VALIDATE
  // =========================================================

  function validateForm() {
    const name = elements.name?.value?.trim().replace(/\s+/g, " ");

    if (!name) {
      showToast("Please enter category name.", "error");

      elements.name?.focus();

      return false;
    }

    if (name.length < 2) {
      showToast("Category name must contain at least 2 characters.", "error");

      elements.name?.focus();

      return false;
    }

    const duplicate = state.categories.find((category) => {
      const sameName =
        String(category.name).trim().toLowerCase() === name.toLowerCase();

      const sameId = String(category.id) === String(state.editingId);

      return sameName && !sameId;
    });

    if (duplicate) {
      showToast("This expense category already exists.", "error");

      elements.name?.focus();

      return false;
    }

    return true;
  }

  // =========================================================
  // GET PAYLOAD
  // =========================================================

  function getPayload() {
    return {
      name: elements.name?.value?.trim().replace(/\s+/g, " "),

      is_active: elements.active?.checked !== false,
    };
  }

  // =========================================================
  // SAVE
  // =========================================================

  async function saveCategory(event) {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const payload = getPayload();

    const editing = state.editingId !== null && state.editingId !== "";

    const submitButton = elements.form?.querySelector('button[type="submit"]');

    const originalButtonHtml = submitButton?.innerHTML;

    try {
      if (submitButton) {
        submitButton.disabled = true;

        submitButton.innerHTML = `
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <span>
                        ${editing ? "Updating..." : "Saving..."}
                    </span>
                `;
      }

      if (editing) {
        await apiRequest(
          `/api/expenses/categories/${encodeURIComponent(state.editingId)}`,
          {
            method: "PUT",
            body: payload,
          },
        );

        showToast("Expense category updated successfully.", "success");
      } else {
        await apiRequest("/api/expenses/categories", {
          method: "POST",
          body: payload,
        });

        showToast("Expense category created successfully.", "success");
      }

      closeForm();

      await loadCategories();
    } catch (error) {
      console.error("Save category error:", error);

      showToast(error.message || "Unable to save expense category.", "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;

        if (originalButtonHtml) {
          submitButton.innerHTML = originalButtonHtml;
        }
      }
    }
  }

  // =========================================================
  // VIEW MODAL
  // =========================================================

  function showViewModal(category) {
    if (!category) {
      return;
    }

    let modal = document.getElementById("categoryViewModal");

    if (!modal) {
      modal = document.createElement("div");

      modal.id = "categoryViewModal";

      modal.className = "modal-backdrop";

      modal.innerHTML = `
                <div
                    class="expense-modal category-view-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="categoryViewTitle"
                >

                    <div class="modal-header">

                        <div class="modal-title-wrap">

                            <div class="modal-title-icon">
                                <i class="fa-solid fa-tag"></i>
                            </div>

                            <div>
                                <h2 id="categoryViewTitle">
                                    Category Details
                                </h2>

                                <p>
                                    Expense category information.
                                </p>
                            </div>

                        </div>

                        <button
                            type="button"
                            class="modal-close"
                            data-close-view
                            aria-label="Close"
                        >
                            <i class="fa-solid fa-xmark"></i>
                        </button>

                    </div>

                    <div class="category-view-content">

                        <div class="detail-row">
                            <span class="detail-label">
                                Category Name
                            </span>

                            <strong
                                class="detail-value"
                                data-view-name
                            ></strong>
                        </div>

                        <div class="detail-row">
                            <span class="detail-label">
                                Status
                            </span>

                            <span
                                class="detail-value"
                                data-view-status
                            ></span>
                        </div>

                        <div class="detail-row">
                            <span class="detail-label">
                                Category ID
                            </span>

                            <span
                                class="detail-value"
                                data-view-id
                            ></span>
                        </div>

                        <div class="detail-row">
                            <span class="detail-label">
                                Created
                            </span>

                            <span
                                class="detail-value"
                                data-view-created
                            ></span>
                        </div>

                        <div class="detail-row">
                            <span class="detail-label">
                                Last Updated
                            </span>

                            <span
                                class="detail-value"
                                data-view-updated
                            ></span>
                        </div>

                    </div>

                    <div class="modal-footer">

                        <button
                            type="button"
                            class="secondary-button"
                            data-close-view
                        >
                            Close
                        </button>

                        <button
                            type="button"
                            class="primary-button"
                            data-view-edit
                        >
                            <i class="fa-solid fa-pen"></i>
                            Edit Category
                        </button>

                    </div>

                </div>
            `;

      document.body.appendChild(modal);

      modal.addEventListener("click", (event) => {
        if (
          event.target === modal ||
          event.target.closest("[data-close-view]")
        ) {
          closeViewModal();
        }

        if (event.target.closest("[data-view-edit]")) {
          const id = modal.dataset.categoryId;

          closeViewModal();

          editCategory(id);
        }
      });
    }

    modal.dataset.categoryId = category.id ?? "";

    const name = modal.querySelector("[data-view-name]");

    const status = modal.querySelector("[data-view-status]");

    const id = modal.querySelector("[data-view-id]");

    const created = modal.querySelector("[data-view-created]");

    const updated = modal.querySelector("[data-view-updated]");

    if (name) {
      name.textContent = category.name || "-";
    }

    if (status) {
      status.innerHTML = `
                <span class="expense-status ${
                  category.is_active ? "active" : "inactive"
                }">
                    <span class="status-dot"></span>
                    ${category.is_active ? "Active" : "Inactive"}
                </span>
            `;
    }

    if (id) {
      id.textContent = category.id ?? "-";
    }

    if (created) {
      created.textContent = formatDate(category.created_at);
    }

    if (updated) {
      updated.textContent = formatDate(category.updated_at);
    }

    modal.classList.add("show");

    modal.setAttribute("aria-hidden", "false");
  }

  // =========================================================
  // CLOSE VIEW MODAL
  // =========================================================

  function closeViewModal() {
    const modal = document.getElementById("categoryViewModal");

    if (!modal) {
      return;
    }

    modal.classList.remove("show");

    modal.setAttribute("aria-hidden", "true");
  }

  // =========================================================
  // DELETE MODAL
  // =========================================================

  function showDeleteModal(category) {
    if (!category) {
      return;
    }

    let modal = document.getElementById("categoryDeleteModal");

    if (!modal) {
      modal = document.createElement("div");

      modal.id = "categoryDeleteModal";

      modal.className = "modal-backdrop";

      modal.innerHTML = `
                <div
                    class="expense-modal delete-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="categoryDeleteTitle"
                >

                    <div class="modal-header">

                        <div class="modal-title-wrap">

                            <div
                                class="modal-title-icon danger"
                            >
                                <i class="fa-solid fa-trash"></i>
                            </div>

                            <div>
                                <h2 id="categoryDeleteTitle">
                                    Delete Category
                                </h2>

                                <p>
                                    This action cannot be undone.
                                </p>
                            </div>

                        </div>

                        <button
                            type="button"
                            class="modal-close"
                            data-close-delete
                            aria-label="Close"
                        >
                            <i class="fa-solid fa-xmark"></i>
                        </button>

                    </div>

                    <div class="delete-content">

                        <div class="delete-warning">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </div>

                        <p>
                            Are you sure you want to delete
                            <strong data-delete-name></strong>?
                        </p>

                        <small>
                            If this category is already used
                            by expense bills, the server may
                            prevent deletion.
                        </small>

                    </div>

                    <div class="modal-footer">

                        <button
                            type="button"
                            class="secondary-button"
                            data-close-delete
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            class="primary-button danger-button"
                            data-confirm-delete
                        >
                            <i class="fa-solid fa-trash"></i>
                            Delete Category
                        </button>

                    </div>

                </div>
            `;

      document.body.appendChild(modal);

      modal.addEventListener("click", (event) => {
        if (
          event.target === modal ||
          event.target.closest("[data-close-delete]")
        ) {
          closeDeleteModal();
        }

        if (event.target.closest("[data-confirm-delete]")) {
          deleteCategoryConfirmed();
        }
      });
    }

    state.deletingId = category.id;

    modal.dataset.categoryId = category.id ?? "";

    const name = modal.querySelector("[data-delete-name]");

    if (name) {
      name.textContent = category.name || "this category";
    }

    modal.classList.add("show");

    modal.setAttribute("aria-hidden", "false");
  }

  // =========================================================
  // CLOSE DELETE MODAL
  // =========================================================

  function closeDeleteModal() {
    const modal = document.getElementById("categoryDeleteModal");

    if (!modal) {
      return;
    }

    modal.classList.remove("show");

    modal.setAttribute("aria-hidden", "true");

    state.deletingId = null;
  }

  // =========================================================
  // DELETE
  // =========================================================

  async function deleteCategoryConfirmed() {
    const id = state.deletingId;

    if (id === null || id === undefined || id === "") {
      return;
    }

    const modal = document.getElementById("categoryDeleteModal");

    const button = modal?.querySelector("[data-confirm-delete]");

    try {
      if (button) {
        button.disabled = true;

        button.innerHTML = `
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    Deleting...
                `;
      }

      await apiRequest(`/api/expenses/categories/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      closeDeleteModal();

      showToast("Expense category deleted successfully.", "success");

      await loadCategories();
    } catch (error) {
      console.error("Delete category error:", error);

      showToast(error.message || "Unable to delete expense category.", "error");
    } finally {
      if (button) {
        button.disabled = false;

        button.innerHTML = `
                    <i class="fa-solid fa-trash"></i>
                    Delete Category
                `;
      }
    }
  }

  // =========================================================
  // TABLE ACTION
  // =========================================================

  function handleTableAction(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const action = button.dataset.action;

    const id = button.dataset.id;

    if (action === "add") {
      openForm();
      return;
    }

    if (action === "reload") {
      loadCategories();
      return;
    }

    if (!id) {
      return;
    }

    const category = state.categories.find(
      (item) => String(item.id) === String(id),
    );

    if (!category) {
      showToast("Category not found.", "error");

      return;
    }

    switch (action) {
      case "view":
        showViewModal(category);
        break;

      case "edit":
        editCategory(id);
        break;

      case "delete":
        showDeleteModal(category);
        break;

      default:
        break;
    }
  }

  // =========================================================
  // KEYBOARD
  // =========================================================

  function handleKeyboard(event) {
    if (event.key !== "Escape") {
      return;
    }

    closeForm();
    closeViewModal();
    closeDeleteModal();
  }

  // =========================================================
  // MODAL BACKDROP
  // =========================================================

  function handleModalBackdrop(event) {
    if (event.target === elements.modal) {
      closeForm();
    }
  }

  // =========================================================
  // CACHE ELEMENTS
  // =========================================================

  function cacheElements() {
    elements.rows = qs("#rows");

    elements.addButton = qs("#add");

    elements.modal = qs("#modal");

    elements.close = qs("#close");

    elements.closeForm = qs("#closeForm");

    elements.form = qs("#form");

    elements.categoryId = qs("#categoryId");

    elements.name = qs("#name");

    elements.active = qs("#active");

    elements.toastContainer = qs("#toastContainer");

    elements.modalTitle = qs("#modalTitle");

    // Optional search box.
    elements.search =
      qs("#search") || qs("#categorySearch") || qs("[data-category-search]");
  }

  // =========================================================
  // BIND EVENTS
  // =========================================================

  function bindEvents() {
    elements.addButton?.addEventListener("click", () => openForm());

    elements.close?.addEventListener("click", closeForm);

    elements.closeForm?.addEventListener("click", closeForm);

    elements.form?.addEventListener("submit", saveCategory);

    elements.rows?.addEventListener("click", handleTableAction);

    elements.modal?.addEventListener("click", handleModalBackdrop);

    elements.search?.addEventListener("input", (event) => {
      applyFilter(event.target.value);
    });

    document.addEventListener("keydown", handleKeyboard);
  }

  // =========================================================
  // INIT
  // =========================================================

  async function init() {
    cacheElements();

    bindEvents();

    await loadCategories();
  }

  // =========================================================
  // PUBLIC API
  // =========================================================

  return {
    init,
    load: loadCategories,
  };
})();

// =============================================================
// INITIALIZE
// =============================================================

document.addEventListener("DOMContentLoaded", () => {
  ExpenseCategoriesPage.init();
});
