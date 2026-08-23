(() => {
  "use strict";

  const API_BASE = "/api/customers";
  const PAGE_SIZE = 20;

  let customers = [];
  let filteredCustomers = [];
  let currentPage = 1;
  let editingId = null;
  let deleteCustomerId = null;

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

    const name = normalizeName($("customerName").value);
    const mobile = normalizeMobile($("customerMobile").value);
    const gstin = normalizeGstin($("customerGstin").value);

    let valid = true;

    if (!name) {
      setFieldError("customerName", "Customer name is required.");
      valid = false;
    }

    if (name.length > 150) {
      setFieldError(
        "customerName",
        "Customer name cannot exceed 150 characters.",
      );
      valid = false;
    }

    if (mobile && !/^(?:\+91)?[6-9]\d{9}$/.test(mobile)) {
      setFieldError("customerMobile", "Enter a valid mobile number.");
      valid = false;
    }

    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
      setFieldError("customerGstin", "GSTIN must contain 15 characters.");
      valid = false;
    }

    return valid;
  };

  const updateSummary = (summary) => {
    $("totalCustomers").textContent = summary.total ?? 0;
    $("activeCustomers").textContent = summary.active ?? 0;
    $("gstCustomers").textContent = summary.with_gstin ?? 0;
    $("outstandingCustomers").textContent = formatCurrency(summary.due_amount);
  };

  const loadSummary = async () => {
    const result = await apiRequest(`${API_BASE}/summary`);
    updateSummary(result.data || result);
  };

  const loadCustomers = async () => {
    $("customersTableBody").innerHTML = `
      <tr>
        <td colspan="8">
          <div class="customers-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading customers...
          </div>
        </td>
      </tr>`;

    try {
      const result = await apiRequest(API_BASE);
      customers = Array.isArray(result.data) ? result.data : [];
      applyFilters();
    } catch (error) {
      $("customersTableBody").innerHTML = `
        <tr>
          <td colspan="8">
            <div class="customers-loading">${escapeHtml(error.message)}</div>
          </td>
        </tr>`;
      showToast(error.message, "error");
    }
  };


  const paymentTermsInput = document.getElementById("paymentTerms");

  paymentTermsInput.addEventListener("input", (event) => {
    const value = event.target.value;

    // Only allow numbers
    const days = value.replace(/\D/g, "");

    event.target.value = days ? `${days} Days` : "";
  });

  const applyFilters = () => {
    const search = $("customerSearch").value.trim().toLowerCase();
    const status = $("statusFilter").value;

    filteredCustomers = customers.filter((customer) => {
      const matchesSearch =
        !search ||
        [
          customer.name,
          customer.contact_person,
          customer.mobile,
          customer.gstin,
          customer.payment_terms,
          customer.address,
        ].some((value) =>
          String(value ?? "").toLowerCase().includes(search),
        );

      const matchesStatus =
        !status ||
        (status === "active" && customer.is_active === true) ||
        (status === "inactive" && customer.is_active === false);

      return matchesSearch && matchesStatus;
    });

    currentPage = 1;
    renderTable();
  };

  const renderTable = () => {
    const totalPages = Math.max(
      1,
      Math.ceil(filteredCustomers.length / PAGE_SIZE),
    );

    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filteredCustomers.slice(start, start + PAGE_SIZE);

    $("pageNumber").textContent = currentPage;
    $("previousPage").disabled = currentPage <= 1;
    $("nextPage").disabled = currentPage >= totalPages;

    $("customersCount").textContent =
      filteredCustomers.length === 0
        ? "Showing 0 customers"
        : `Showing ${start + 1}-${Math.min(
            start + PAGE_SIZE,
            filteredCustomers.length,
          )} of ${filteredCustomers.length} customers`;

    $("customersEmpty").hidden = pageRows.length !== 0;

    if (pageRows.length === 0) {
      $("customersTableBody").innerHTML = "";
      return;
    }

    $("customersTableBody").innerHTML = pageRows
      .map((customer) => {
        const statusClass = customer.is_active ? "active" : "inactive";
        const statusText = customer.is_active ? "Active" : "Inactive";

        return `
          <tr>
            <td>
              <div class="customer-name-cell">
                <div class="customer-row-icon">
                  <i class="fa-solid fa-user"></i>
                </div>
                <div>
                  <div class="customer-name">${escapeHtml(customer.name)}</div>
                  ${
                    customer.address
                      ? `<div class="customer-secondary">${escapeHtml(
                          customer.address,
                        ).slice(0, 70)}</div>`
                      : ""
                  }
                </div>
              </div>
            </td>

            <td>${escapeHtml(customer.contact_person || "—")}</td>
            <td class="customer-mobile">${escapeHtml(customer.mobile || "—")}</td>
            <td class="customer-gstin">${escapeHtml(customer.gstin || "—")}</td>
            <td class="customer-amount">${formatCurrency(customer.net_sales_amount)}</td>
            <td class="customer-amount ${
              Number(customer.due_amount) > 0 ? "due" : ""
            }">${formatCurrency(customer.due_amount)}</td>

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
                  data-id="${customer.id}"
                  title="View Customer"
                  aria-label="View Customer">
                  <i class="fa-solid fa-eye"></i>
                </button>

                <button
                  class="table-action"
                  type="button"
                  data-action="edit"
                  data-id="${customer.id}"
                  title="Edit Customer"
                  aria-label="Edit Customer">
                  <i class="fa-solid fa-pen"></i>
                </button>

                <button
                  class="table-action danger"
                  type="button"
                  data-action="delete"
                  data-id="${customer.id}"
                  title="Delete Customer"
                  aria-label="Delete Customer">
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
    $("customerForm").reset();
    $("customerId").value = "";
    $("customerStatus").value = "true";
    $("customerModalTitle").textContent = "Add Customer";
    $("customerModalDescription").textContent =
      "Create a customer master record.";
    $("saveCustomer").innerHTML =
      `<i class="fa-solid fa-check"></i><span>Save Customer</span>`;
    clearErrors();
  };

  const openModal = (customer = null) => {
    resetForm();

    if (customer) {
      editingId = customer.id;

      $("customerId").value = customer.id;
      $("customerName").value = customer.name || "";
      $("contactPerson").value = customer.contact_person || "";
      $("customerMobile").value = customer.mobile || "";
      $("customerGstin").value = customer.gstin || "";
      $("paymentTerms").value = customer.payment_terms || "";
      $("customerAddress").value = customer.address || "";
      $("customerStatus").value = String(Boolean(customer.is_active));

      $("customerModalTitle").textContent = "Edit Customer";
      $("customerModalDescription").textContent =
        "Update customer master details.";
      $("saveCustomer").innerHTML =
        `<i class="fa-solid fa-check"></i><span>Update Customer</span>`;
    }

    $("customerModal").hidden = false;
    document.body.style.overflow = "hidden";
    $("customerName").focus();
  };

  const closeModal = () => {
    $("customerModal").hidden = true;
    document.body.style.overflow = "";
    resetForm();
  };

  const openViewModal = (customer) => {
    $("viewCustomerName").textContent = customer.name || "—";
    $("viewCustomerContact").textContent = customer.contact_person || "—";
    $("viewCustomerMobile").textContent = customer.mobile || "—";
    $("viewCustomerGstin").textContent = customer.gstin || "—";
    $("viewCustomerAddress").textContent = customer.address || "—";
    $("viewCustomerTerms").textContent = customer.payment_terms || "—";
    $("viewCustomerStatus").textContent = customer.is_active ? "Active" : "Inactive";

    $("viewTotalSales").textContent = formatCurrency(customer.net_sales_amount);
    $("viewPaidAmount").textContent = formatCurrency(customer.paid_amount);
    $("viewDueAmount").textContent = formatCurrency(customer.due_amount);

    const sales = customer.recent_sales || [];
    $("recentSalesBody").innerHTML = sales.length
      ? sales
          .map(
            (sale) => `
              <tr>
                <td>${escapeHtml(sale.sale_no)}</td>
                <td>${escapeHtml(sale.sale_date || "—")}</td>
                <td>${formatCurrency(sale.total_amount)}</td>
                 <td>${formatCurrency(sale.sales_return_amount)}</td>
                <td>${formatCurrency(sale.net_sales_amount)}</td>
                <td>${escapeHtml(sale.payment_status || "—")}</td>
              </tr>`,
          )
          .join("")
      : `
        <tr>
          <td colspan="4" class="view-empty">No sales found.</td>
        </tr>`;

    $("customerViewModal").hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeViewModal = () => {
    $("customerViewModal").hidden = true;
    document.body.style.overflow = "";
  };

  const openDeleteModal = (customer) => {
    deleteCustomerId = customer.id;
    $("deleteCustomerName").textContent = customer.name;
    $("deleteCustomerModal").hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeDeleteModal = () => {
    $("deleteCustomerModal").hidden = true;
    document.body.style.overflow = "";
    deleteCustomerId = null;
  };

  const getFormPayload = () => ({
    name: normalizeName($("customerName").value),
    contact_person: $("contactPerson").value.trim() || null,
    mobile: normalizeMobile($("customerMobile").value) || null,
    gstin: normalizeGstin($("customerGstin").value) || null,
    address: $("customerAddress").value.trim() || null,
    payment_terms: $("paymentTerms").value.trim() || null,
    is_active: $("customerStatus").value === "true",
  });

  const saveCustomer = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;

    const button = $("saveCustomer");
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
      await Promise.all([loadCustomers(), loadSummary()]);

      showToast(
        wasEditing
          ? "Customer updated successfully."
          : "Customer created successfully.",
      );
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  };

  const viewCustomer = async (id) => {
    try {
      const result = await apiRequest(`${API_BASE}/${id}`);
      openViewModal(result.data || result);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const editCustomer = async (id) => {
    try {
      const result = await apiRequest(`${API_BASE}/${id}`);
      openModal(result.data || result);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const confirmDelete = async () => {
    if (!deleteCustomerId) return;

    const button = $("confirmDeleteCustomer");
    const customerId = deleteCustomerId;

    button.disabled = true;
    button.innerHTML =
      `<i class="fa-solid fa-spinner fa-spin"></i><span>Deleting...</span>`;

    try {
      await apiRequest(`${API_BASE}/${customerId}`, {
        method: "DELETE",
      });

      closeDeleteModal();
      await Promise.all([loadCustomers(), loadSummary()]);
      showToast("Customer deleted successfully.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML =
        `<i class="fa-solid fa-trash"></i><span>Delete Customer</span>`;
    }
  };

  const bindEvents = () => {
    $("addCustomerButton").addEventListener("click", () => openModal());
    $("emptyAddCustomer").addEventListener("click", () => openModal());

    $("closeCustomerModal").addEventListener("click", closeModal);
    $("cancelCustomer").addEventListener("click", closeModal);

    $("closeCustomerView").addEventListener("click", closeViewModal);
    $("closeCustomerViewButton").addEventListener("click", closeViewModal);

    $("cancelDeleteCustomer").addEventListener("click", closeDeleteModal);
    $("confirmDeleteCustomer").addEventListener("click", confirmDelete);

    $("customerForm").addEventListener("submit", saveCustomer);

    $("customerSearch").addEventListener("input", applyFilters);
    $("statusFilter").addEventListener("change", applyFilters);

    $("resetFilters").addEventListener("click", () => {
      $("customerSearch").value = "";
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
        Math.ceil(filteredCustomers.length / PAGE_SIZE),
      );

      if (currentPage < totalPages) {
        currentPage += 1;
        renderTable();
      }
    });

    $("customersTableBody").addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const customer = customers.find(
        (item) => String(item.id) === String(button.dataset.id),
      );

      if (!customer) return;

      if (button.dataset.action === "view") {
        viewCustomer(customer.id);
      } else if (button.dataset.action === "edit") {
        editCustomer(customer.id);
      } else if (button.dataset.action === "delete") {
        openDeleteModal(customer);
      }
    });

    $("customerGstin").addEventListener("input", (event) => {
      event.target.value = event.target.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      clearErrors();
    });

    $("customerMobile").addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/[^\d+\-\s()]/g, "");
    });

    $("customerGstin").addEventListener("blur", () => {
      const value = normalizeGstin($("customerGstin").value);
      if (value && !/^[0-9A-Z]{15}$/.test(value)) {
        setFieldError(
          "customerGstin",
          "GSTIN must contain exactly 15 characters.",
        );
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (!$("customerModal").hidden) closeModal();
      if (!$("customerViewModal").hidden) closeViewModal();
      if (!$("deleteCustomerModal").hidden) closeDeleteModal();
    });
  };

  window.initCustomersPage = async () => {
    bindEvents();

    try {
      await Promise.all([loadCustomers(), loadSummary()]);
    } catch (error) {
      showToast(error.message, "error");
    }
  };
})();
