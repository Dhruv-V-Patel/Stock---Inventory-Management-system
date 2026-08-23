(() => {
  "use strict";

  const API_BASE = "/api/suppliers";
  const PAGE_SIZE = 20;

  let suppliers = [];
  let filteredSuppliers = [];
  let currentPage = 1;
  let editingId = null;
  let deleteSupplierId = null;

  const $ = (id) => document.getElementById(id);

  const getToken = () => localStorage.getItem("accessToken");

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(value ?? 0));

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
      throw new Error("Session expired");
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || "Request failed");
    }

    return data;
  };

  const showToast = (message, type = "success") => {
    const container = $("toastContainer");
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

  const clearErrors = () => {
    document.querySelectorAll("[data-error-for]").forEach((el) => {
      el.textContent = "";
    });
  };

  const setFieldError = (field, message) => {
    const el = document.querySelector(`[data-error-for="${field}"]`);
    if (el) el.textContent = message;
  };

  const normalizeName = (value) =>
    String(value ?? "").trim().replace(/\s+/g, " ");

  const normalizeGstin = (value) =>
    String(value ?? "").trim().toUpperCase().replace(/\s/g, "");

  const normalizeMobile = (value) =>
    String(value ?? "").trim().replace(/\s+/g, "");

  const validateForm = () => {
    clearErrors();

    const name = normalizeName($("supplierName").value);
    const mobile = normalizeMobile($("supplierMobile").value);
    const gstin = normalizeGstin($("supplierGstin").value);

    let valid = true;

    if (!name) {
      setFieldError("supplierName", "Supplier name is required.");
      valid = false;
    }

    if (name.length > 150) {
      setFieldError(
        "supplierName",
        "Supplier name cannot exceed 150 characters.",
      );
      valid = false;
    }

    if (mobile && !/^(?:\+91)?[6-9]\d{9}$/.test(mobile)) {
      setFieldError("supplierMobile", "Enter a valid mobile number.");
      valid = false;
    }

    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
      setFieldError("supplierGstin", "GSTIN must contain 15 characters.");
      valid = false;
    }

    return valid;
  };

  const paymentTermsInput = document.getElementById("paymentTerms");

  paymentTermsInput.addEventListener("input", (event) => {
    const value = event.target.value;

    // Only allow numbers
    const days = value.replace(/\D/g, "");

    event.target.value = days ? `${days} Days` : "";
  });


  const updateSummary = (summary) => {
    $("totalSuppliers").textContent = summary.total ?? 0;
    $("activeSuppliers").textContent = summary.active ?? 0;
    $("gstSuppliers").textContent = summary.with_gstin ?? 0;
    $("totalDueSuppliers").textContent = formatCurrency(summary.due_amount);
  };

  const loadSummary = async () => {
    const result = await apiRequest(`${API_BASE}/summary`);
    updateSummary(result.data || result);
  };

  const loadSuppliers = async () => {
    $("suppliersTableBody").innerHTML = `
      <tr>
        <td colspan="8">
          <div class="suppliers-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading suppliers...
          </div>
        </td>
      </tr>`;

    try {
      const result = await apiRequest(API_BASE);
      suppliers = Array.isArray(result.data) ? result.data : [];
      applyFilters();
    } catch (error) {
      $("suppliersTableBody").innerHTML = `
        <tr>
          <td colspan="8">
            <div class="suppliers-loading">${escapeHtml(error.message)}</div>
          </td>
        </tr>`;
      showToast(error.message, "error");
    }
  };

  const applyFilters = () => {
    const search = $("supplierSearch").value.trim().toLowerCase();
    const status = $("statusFilter").value;

    filteredSuppliers = suppliers.filter((supplier) => {
      const matchesSearch =
        !search ||
        [
          supplier.name,
          supplier.contact_person,
          supplier.mobile,
          supplier.gstin,
          supplier.payment_terms,
          supplier.address,
        ].some((value) =>
          String(value ?? "").toLowerCase().includes(search),
        );

      const matchesStatus =
        !status ||
        (status === "active" && supplier.is_active === true) ||
        (status === "inactive" && supplier.is_active === false);

      return matchesSearch && matchesStatus;
    });

    currentPage = 1;
    renderTable();
  };

  const renderTable = () => {
    const totalPages = Math.max(
      1,
      Math.ceil(filteredSuppliers.length / PAGE_SIZE),
    );

    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filteredSuppliers.slice(start, start + PAGE_SIZE);

    $("pageNumber").textContent = currentPage;
    $("previousPage").disabled = currentPage <= 1;
    $("nextPage").disabled = currentPage >= totalPages;

    $("suppliersCount").textContent =
      filteredSuppliers.length === 0
        ? "Showing 0 suppliers"
        : `Showing ${start + 1}-${Math.min(
            start + PAGE_SIZE,
            filteredSuppliers.length,
          )} of ${filteredSuppliers.length} suppliers`;

    $("suppliersEmpty").hidden = pageRows.length !== 0;

    if (pageRows.length === 0) {
      $("suppliersTableBody").innerHTML = "";
      return;
    }

    $("suppliersTableBody").innerHTML = pageRows
      .map((supplier) => {
        const statusClass = supplier.is_active ? "active" : "inactive";
        const statusText = supplier.is_active ? "Active" : "Inactive";

        return `
          <tr>
            <td>
              <div class="supplier-name-cell">
                <div class="supplier-row-icon">
                  <i class="fa-solid fa-user"></i>
                </div>
                <div>
                  <div class="supplier-name">${escapeHtml(supplier.name)}</div>
                  ${
                    supplier.address
                      ? `<div class="supplier-secondary">${escapeHtml(
                          supplier.address,
                        ).slice(0, 70)}</div>`
                      : ""
                  }
                </div>
              </div>
            </td>

            <td>${escapeHtml(supplier.contact_person || "—")}</td>
            <td class="supplier-mobile">${escapeHtml(supplier.mobile || "—")}</td>
            <td class="supplier-gstin">${escapeHtml(supplier.gstin || "—")}</td>
            <td class="supplier-amount">${formatCurrency(supplier.net_purchase_amount)}</td>
            <td class="supplier-amount ${
              Number(supplier.due_amount) > 0 ? "due" : ""
            }">${formatCurrency(supplier.due_amount)}</td>

            <td>
              <span class="status-badge ${statusClass}">
                ${statusText}
              </span>
            </td>

            <td class="action-column">
              <div class="action-buttons">
                <button
                  class="table-action"
                  type="button"
                  data-action="view"
                  data-id="${supplier.id}"
                  title="View Supplier"
                  aria-label="View Supplier">
                  <i class="fa-solid fa-eye"></i>
                </button>

                <button
                  class="table-action"
                  type="button"
                  data-action="edit"
                  data-id="${supplier.id}"
                  title="Edit Supplier"
                  aria-label="Edit Supplier">
                  <i class="fa-solid fa-pen"></i>
                </button>

                <button
                  class="table-action danger"
                  type="button"
                  data-action="delete"
                  data-id="${supplier.id}"
                  title="Delete Supplier"
                  aria-label="Delete Supplier">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>`;
      })
      .join("");
  };

  const resetForm = () => {
    editingId = null;
    $("supplierForm").reset();
    $("supplierId").value = "";
    $("supplierStatus").value = "true";
    $("supplierModalTitle").textContent = "Add Supplier";
    $("supplierModalDescription").textContent =
      "Create a supplier master record.";
    $("saveSupplier").innerHTML =
      `<i class="fa-solid fa-check"></i><span>Save Supplier</span>`;
    clearErrors();
  };

  const openModal = (supplier = null) => {
    resetForm();

    if (supplier) {
      editingId = supplier.id;

      $("supplierId").value = supplier.id;
      $("supplierName").value = supplier.name || "";
      $("contactPerson").value = supplier.contact_person || "";
      $("supplierMobile").value = supplier.mobile || "";
      $("supplierGstin").value = supplier.gstin || "";
      $("paymentTerms").value = supplier.payment_terms || "";
      $("supplierAddress").value = supplier.address || "";
      $("supplierStatus").value = String(Boolean(supplier.is_active));

      $("supplierModalTitle").textContent = "Edit Supplier";
      $("supplierModalDescription").textContent =
        "Update supplier master details.";
      $("saveSupplier").innerHTML =
        `<i class="fa-solid fa-check"></i><span>Update Supplier</span>`;
    }

    $("supplierModal").hidden = false;
    document.body.style.overflow = "hidden";
    $("supplierName").focus();
  };

  const closeModal = () => {
    $("supplierModal").hidden = true;
    document.body.style.overflow = "";
    resetForm();
  };

  const openViewModal = (supplier) => {
    $("viewSupplierName").textContent = supplier.name || "—";
    $("viewSupplierContact").textContent = supplier.contact_person || "—";
    $("viewSupplierMobile").textContent = supplier.mobile || "—";
    $("viewSupplierGstin").textContent = supplier.gstin || "—";
    $("viewSupplierAddress").textContent = supplier.address || "—";
    $("viewSupplierTerms").textContent = supplier.payment_terms || "—";
    $("viewSupplierStatus").textContent = supplier.is_active ? "Active" : "Inactive";

    $("viewTotalPurchase").textContent = formatCurrency(supplier.net_purchase_amount);
    $("viewPaidAmount").textContent = formatCurrency(supplier.paid_amount);
    $("viewDueAmount").textContent = formatCurrency(supplier.due_amount);

    const purchases = supplier.recent_purchases || [];
    $("recentPurchasesBody").innerHTML = purchases.length
      ? purchases
          .map(
            (purchase) => `
              <tr>
                <td>${escapeHtml(purchase.purchase_no)}</td>
                <td>${escapeHtml(purchase.purchase_date || "—")}</td>
                <td>${formatCurrency(purchase.total_amount)}</td>
                <td>${formatCurrency(purchase.purchase_return_amount)}</td>
                <td>${formatCurrency(purchase.net_purchase_amount)}</td>
                <td>${escapeHtml(purchase.payment_status || "—")}</td>
              </tr>`,
          )
          .join("")
      : `
        <tr>
          <td colspan="6" class="view-empty">No purchases found.</td>
        </tr>`;

    $("supplierViewModal").hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeViewModal = () => {
    $("supplierViewModal").hidden = true;
    document.body.style.overflow = "";
  };

  const openDeleteModal = (supplier) => {
    deleteSupplierId = supplier.id;
    $("deleteSupplierName").textContent = supplier.name;
    $("deleteSupplierModal").hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeDeleteModal = () => {
    $("deleteSupplierModal").hidden = true;
    document.body.style.overflow = "";
    deleteSupplierId = null;
  };

  const getFormPayload = () => ({
    name: normalizeName($("supplierName").value),
    contact_person: $("contactPerson").value.trim() || null,
    mobile: normalizeMobile($("supplierMobile").value) || null,
    gstin: normalizeGstin($("supplierGstin").value) || null,
    address: $("supplierAddress").value.trim() || null,
    payment_terms: $("paymentTerms").value.trim() || null,
    is_active: $("supplierStatus").value === "true",
  });

  const saveSupplier = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;

    const button = $("saveSupplier");
    const originalHtml = button.innerHTML;

    button.disabled = true;
    button.innerHTML =
      `<i class="fa-solid fa-spinner fa-spin"></i><span>Saving...</span>`;

    try {
      await apiRequest(
        editingId ? `${API_BASE}/${editingId}` : API_BASE,
        {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify(getFormPayload()),
        },
      );

      const wasEditing = Boolean(editingId);

      closeModal();
      await Promise.all([loadSuppliers(), loadSummary()]);

      showToast(
        wasEditing
          ? "Supplier updated successfully."
          : "Supplier created successfully.",
      );
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  };

  const viewSupplier = async (id) => {
    try {
      const result = await apiRequest(`${API_BASE}/${id}`);
      openViewModal(result.data || result);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const editSupplier = async (id) => {
    try {
      const result = await apiRequest(`${API_BASE}/${id}`);
      openModal(result.data || result);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleteSupplierId) return;

    const button = $("confirmDeleteSupplier");
    const supplierId = deleteSupplierId;

    button.disabled = true;
    button.innerHTML =
      `<i class="fa-solid fa-spinner fa-spin"></i><span>Deleting...</span>`;

    try {
      await apiRequest(`${API_BASE}/${supplierId}`, {
        method: "DELETE",
      });

      closeDeleteModal();
      await Promise.all([loadSuppliers(), loadSummary()]);
      showToast("Supplier deleted successfully.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML =
        `<i class="fa-solid fa-trash"></i><span>Delete Supplier</span>`;
    }
  };

  const bindEvents = () => {
    $("addSupplierButton").addEventListener("click", () => openModal());
    $("emptyAddSupplier").addEventListener("click", () => openModal());

    $("closeSupplierModal").addEventListener("click", closeModal);
    $("cancelSupplier").addEventListener("click", closeModal);

    $("closeSupplierView").addEventListener("click", closeViewModal);
    $("closeSupplierViewButton").addEventListener("click", closeViewModal);

    $("cancelDeleteSupplier").addEventListener("click", closeDeleteModal);
    $("confirmDeleteSupplier").addEventListener("click", confirmDelete);

    $("supplierForm").addEventListener("submit", saveSupplier);

    $("supplierSearch").addEventListener("input", applyFilters);
    $("statusFilter").addEventListener("change", applyFilters);

    $("resetFilters").addEventListener("click", () => {
      $("supplierSearch").value = "";
      $("statusFilter").value = "";
      applyFilters();
    });

    $("previousPage").addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage -= 1;
        renderTable();
      }
    });

    $("nextPage").addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(filteredSuppliers.length / PAGE_SIZE),
      );

      if (currentPage < totalPages) {
        currentPage += 1;
        renderTable();
      }
    });

    $("suppliersTableBody").addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const supplier = suppliers.find(
        (item) => String(item.id) === String(button.dataset.id),
      );

      if (!supplier) return;

      if (button.dataset.action === "view") {
        viewSupplier(supplier.id);
      } else if (button.dataset.action === "edit") {
        editSupplier(supplier.id);
      } else if (button.dataset.action === "delete") {
        openDeleteModal(supplier);
      }
    });

    $("supplierGstin").addEventListener("input", (event) => {
      event.target.value = event.target.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      clearErrors();
    });

    $("supplierMobile").addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/[^\d+\-\s()]/g, "");
    });

    $("supplierGstin").addEventListener("blur", () => {
      const value = normalizeGstin($("supplierGstin").value);
      if (value && !/^[0-9A-Z]{15}$/.test(value)) {
        setFieldError(
          "supplierGstin",
          "GSTIN must contain exactly 15 characters.",
        );
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (!$("supplierModal").hidden) closeModal();
      if (!$("supplierViewModal").hidden) closeViewModal();
      if (!$("deleteSupplierModal").hidden) closeDeleteModal();
    });
  };

  window.initSuppliersPage = async () => {
    bindEvents();

    try {
      await Promise.all([loadSuppliers(), loadSummary()]);
    } catch (error) {
      showToast(error.message, "error");
    }
  };
})();
