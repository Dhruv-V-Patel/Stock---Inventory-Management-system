(() => {
  "use strict";

  const state = {
    payables: [],
    filteredPayables: [],
    page: 1,
    pageSize: 30,
    loading: false,
  };

  const qs = (selector, parent = document) => parent.querySelector(selector);

  const qsa = (selector, parent = document) =>
    Array.from(parent.querySelectorAll(selector));

  function getToken() {
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      sessionStorage.getItem("token") ||
      ""
    );
  }

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

  function toNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
  }

  function formatCurrency(value) {
    const amount = toNumber(value);

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

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

  function getDateValue(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toISOString().slice(0, 10);
  }

  function normalizeStatus(status) {
    const value = String(status || "")
      .trim()
      .toUpperCase();

    if (value === "PAID" || value === "FULLY_PAID" || value === "COMPLETED") {
      return "PAID";
    }

    if (value === "PARTIAL" || value === "PARTIALLY_PAID") {
      return "PARTIAL";
    }

    if (value === "OVERDUE") {
      return "OVERDUE";
    }

    return "PENDING";
  }

  function getStatusLabel(status) {
    switch (normalizeStatus(status)) {
      case "PAID":
        return "Paid";

      case "PARTIAL":
        return "Partial";

      case "OVERDUE":
        return "Overdue";

      default:
        return "Pending";
    }
  }

  function getStatusClass(status) {
    return normalizeStatus(status).toLowerCase();
  }

  /* =====================================================
       API REQUEST
       ===================================================== */

  async function apiRequest(url, options = {}) {
    const token = getToken();

    const headers = {
      Accept: "application/json",
      ...(options.headers || {}),
    };

    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("accessToken");
      sessionStorage.removeItem("token");

      window.location.href = "/login.html";

      throw new Error("Session expired");
    }

    let data = null;

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();

      try {
        data = JSON.parse(text);
      } catch {
        data = text;
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

  /* =====================================================
       TOAST
       ===================================================== */

  function ensureToastContainer() {
    let container = qs("#toastContainer");

    if (container) {
      return container;
    }

    container = document.createElement("div");

    container.id = "toastContainer";

    container.className = "toast-container";

    document.body.appendChild(container);

    return container;
  }

  function showToast(message, type = "info") {
    const container = ensureToastContainer();

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;

    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-message">
          ${escapeHtml(message)}
        </span>
      </div>

      <button
        type="button"
        class="toast-close"
        aria-label="Close"
      >
        &times;
      </button>
    `;

    container.appendChild(toast);

    const closeButton = qs(".toast-close", toast);

    if (closeButton) {
      closeButton.addEventListener("click", () => {
        toast.remove();
      });
    }

    setTimeout(() => {
      toast.remove();
    }, 3500);
  }

  /* =====================================================
       NORMALIZE PAYABLE
       ===================================================== */

  function normalizePayable(item) {
    const totalAmount = toNumber(
      item.total_amount ?? item.total ?? item.amount,
    );

    const paidAmount = toNumber(
      item.paid_amount ?? item.paid ?? item.amount_paid,
    );

    let dueAmount;

    if (item.due_amount !== undefined && item.due_amount !== null) {
      dueAmount = toNumber(item.due_amount);
    } else {
      dueAmount = Math.max(totalAmount - paidAmount, 0);
    }

    return {
      id: item.id,

      expense_no:
        item.expense_no ||
        item.expense_number ||
        item.bill_no ||
        `EXP-${item.id}`,

      category_id: item.category_id ?? null,

      category_name: item.category_name || item.category || "-",

      vendor_name:
        item.vendor_name ||
        item.vendor ||
        item.paid_to ||
        item.party_name ||
        "-",

      bill_number:
        item.bill_number || item.invoice_number || item.reference_number || "",

      bill_date: item.bill_date || item.expense_date || item.date || null,

      due_date: item.due_date || null,

      total_amount: totalAmount,

      paid_amount: paidAmount,

      due_amount: dueAmount,

      payment_status: normalizeStatus(item.payment_status || item.status),

      remarks: item.remarks || item.notes || "",

      created_at: item.created_at || null,

      updated_at: item.updated_at || null,
    };
  }

  /* =====================================================
       LOAD PAYABLES
       ===================================================== */

  async function loadPayables() {
    if (state.loading) {
      return;
    }

    state.loading = true;

    renderLoading();

    try {
      const response = await apiRequest("/api/expenses/payables");

      let rows = [];

      if (Array.isArray(response)) {
        rows = response;
      } else if (Array.isArray(response?.data)) {
        rows = response.data;
      } else if (Array.isArray(response?.rows)) {
        rows = response.rows;
      } else if (Array.isArray(response?.payables)) {
        rows = response.payables;
      }

      state.payables = rows
        .map(normalizePayable)
        .filter((item) => item.due_amount > 0);

      state.page = 1;

      applyFilters();
    } catch (error) {
      console.error("Expense Payables Load Error:", error);

      renderError(error.message || "Failed to load expense payables.");

      showToast(error.message || "Failed to load expense payables.", "error");
    } finally {
      state.loading = false;
    }
  }

  /* =====================================================
       FILTER VALUES
       ===================================================== */

  function getFilterValues() {
    return {
      search: qs("#filter_search")?.value?.trim().toLowerCase() || "",

      status: qs("#filter_status")?.value?.trim().toUpperCase() || "",

      fromDate: qs("#filter_from_date")?.value || "",

      toDate: qs("#filter_to_date")?.value || "",
    };
  }

  /* =====================================================
       APPLY FILTERS
       ===================================================== */

  function applyFilters() {
    const filters = getFilterValues();

    state.filteredPayables = state.payables.filter((item) => {
      /* SEARCH */

      if (filters.search) {
        const searchText = [
          item.expense_no,
          item.category_name,
          item.vendor_name,
          item.bill_number,
          item.remarks,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchText.includes(filters.search)) {
          return false;
        }
      }

      /* STATUS */

      if (filters.status) {
        if (normalizeStatus(item.payment_status) !== filters.status) {
          return false;
        }
      }

      /* DATE FILTER */

      const billDate = getDateValue(item.bill_date);

      const dueDate = getDateValue(item.due_date);

      if (filters.fromDate) {
        const matchesFrom =
          !billDate ||
          billDate >= filters.fromDate ||
          !dueDate ||
          dueDate >= filters.fromDate;

        if (!matchesFrom) {
          return false;
        }
      }

      if (filters.toDate) {
        const matchesTo =
          !billDate ||
          billDate <= filters.toDate ||
          !dueDate ||
          dueDate <= filters.toDate;

        if (!matchesTo) {
          return false;
        }
      }

      return true;
    });

    const totalDue = state.filteredPayables.reduce(
      (sum, item) => sum + toNumber(item.due_amount),
      0,
    );

    const totalDueElement = qs("#totalDue");

    if (totalDueElement) {
      totalDueElement.textContent = formatCurrency(totalDue);
    }

    state.page = 1;

    renderTable();
  }

  /* =====================================================
       RESET FILTERS
       ===================================================== */

  function resetFilters() {
    const search = qs("#filter_search");

    const status = qs("#filter_status");

    const fromDate = qs("#filter_from_date");

    const toDate = qs("#filter_to_date");

    if (search) {
      search.value = "";
    }

    if (status) {
      status.value = "";
    }

    if (fromDate) {
      fromDate.value = "";
    }

    if (toDate) {
      toDate.value = "";
    }

    applyFilters();
  }

  /* =====================================================
       RENDER LOADING
       ===================================================== */

  function renderLoading() {
    const rows = qs("#rows");

    if (!rows) {
      return;
    }

    rows.innerHTML = `
      <tr>
        <td
          colspan="9"
          class="table-loading"
        >
          <i class="fa-solid fa-spinner fa-spin"></i>
          Loading expense payables...
        </td>
      </tr>
    `;
  }

  /* =====================================================
       RENDER ERROR
       ===================================================== */

  function renderError(message) {
    const rows = qs("#rows");

    if (!rows) {
      return;
    }

    rows.innerHTML = `
      <tr>
        <td
          colspan="9"
          class="table-error"
        >
          <i class="fa-solid fa-triangle-exclamation"></i>

          <span>
            ${escapeHtml(message)}
          </span>

          <button
            type="button"
            class="secondary-button"
            data-action="retry"
          >
            Retry
          </button>
        </td>
      </tr>
    `;
  }

  /* =====================================================
       RENDER EMPTY
       ===================================================== */

  function renderEmpty() {
    const rows = qs("#rows");

    if (!rows) {
      return;
    }

    rows.innerHTML = `
      <tr>
        <td
          colspan="9"
          class="table-empty"
        >
          <div class="empty-state">
            <i class="fa-solid fa-circle-check"></i>

            <strong>
              No outstanding expense bills
            </strong>

            <span>
              There are no pending or partially
              paid expense bills matching your filters.
            </span>
          </div>
        </td>
      </tr>
    `;
  }

  /* =====================================================
       RENDER TABLE
       ===================================================== */

  function renderTable() {
    const rows = qs("#rows");

    if (!rows) {
      return;
    }

    if (!state.filteredPayables.length) {
      renderEmpty();
      renderPagination();
      return;
    }

    const total = state.filteredPayables.length;

    const totalPages = Math.max(Math.ceil(total / state.pageSize), 1);

    if (state.page > totalPages) {
      state.page = totalPages;
    }

    const start = (state.page - 1) * state.pageSize;

    const end = start + state.pageSize;

    const pageItems = state.filteredPayables.slice(start, end);

    rows.innerHTML = pageItems.map(renderRow).join("");

    renderPagination();
  }

  /* =====================================================
       RENDER ROW
       ===================================================== */

  function renderRow(item) {
    const status = normalizeStatus(item.payment_status);

    const statusLabel = getStatusLabel(status);

    const statusClass = getStatusClass(status);

    return `
      <tr>

        <!-- EXPENSE NO -->
        <td>
          <div class="expense-number">
            ${escapeHtml(item.expense_no)}
          </div>
        </td>

        <!-- CATEGORY -->
        <td>
          <div class="expense-category">
            ${escapeHtml(item.category_name)}
          </div>
        </td>

        <!-- VENDOR -->
        <td>
          <div class="expense-vendor">
            ${escapeHtml(item.vendor_name)}
          </div>

          ${
            item.bill_number
              ? `
                <small class="expense-bill-number">
                  Bill:
                  ${escapeHtml(item.bill_number)}
                </small>
              `
              : ""
          }
        </td>

        <!-- DUE DATE -->
        <td>
          <div class="expense-date">
            ${formatDate(item.due_date || item.bill_date)}
          </div>
        </td>

        <!-- TOTAL -->
        <td class="text-right">
          <div class="expense-amount">
            ${formatCurrency(item.total_amount)}
          </div>
        </td>

        <!-- PAID -->
        <td class="text-right">
          <div class="expense-paid">
            ${formatCurrency(item.paid_amount)}
          </div>
        </td>

        <!-- DUE -->
        <td class="text-right">
          <div class="expense-due">
            ${formatCurrency(item.due_amount)}
          </div>
        </td>

        <!-- STATUS -->
        <td>
          <span
            class="
              expense-status
              ${statusClass}
            "
          >
            <span
              class="status-dot"
            ></span>

            ${escapeHtml(statusLabel)}
          </span>
        </td>

        <!-- ACTION -->
        <td>
          <div
            class="expense-actions"
          >

            <button
              type="button"
              class="
                expense-action
                view
              "
              data-action="view"
              data-id="${escapeHtml(item.id)}"
              title="View"
            >
              <i
                class="fa-solid fa-eye"
              ></i>
            </button>

            <button
              type="button"
              class="
                expense-action
                pay
              "
              data-action="pay"
              data-id="${escapeHtml(item.id)}"
              title="Pay Now"
            >
              <i
                class="
                  fa-solid
                  fa-money-bill-wave
                "
              ></i>
            </button>

          </div>
        </td>

      </tr>
    `;
  }

  /* =====================================================
       FIND PAYABLE
       ===================================================== */

  function findPayable(id) {
    return state.payables.find((item) => String(item.id) === String(id));
  }

  /* =====================================================
       VIEW MODAL
       PURCHASE STYLE
       ===================================================== */

  function showViewModal(id) {
    const item = findPayable(id);

    if (!item) {
      showToast("Expense payable not found.", "error");

      return;
    }

    const modal = qs("#expensePayableViewModal");

    const body = qs("#expensePayableViewBody");

    const title = qs("#expensePayableViewTitle");

    const subtitle = qs("#expensePayableViewSubtitle");

    if (!modal || !body) {
      showToast("Expense payable view modal is not available.", "error");

      return;
    }

    /* STORE ID */

    modal.dataset.id = item.id;

    /* SHOW MODAL */

    modal.hidden = false;

    modal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";

    /* TITLE */

    if (title) {
      title.textContent = item.expense_no || "Expense Payable";
    }

    /* SUBTITLE */

    if (subtitle) {
      subtitle.textContent =
        item.vendor_name || item.category_name || "Expense payable details";
    }

    const status = normalizeStatus(item.payment_status);

    /* DETAILS */

    body.innerHTML = `
      <div class="details-grid">

        <!-- EXPENSE NO -->

        <div class="detail-box">
          <span>
            Expense No.
          </span>

          <strong>
            ${escapeHtml(item.expense_no || "—")}
          </strong>
        </div>

        <!-- CATEGORY -->

        <div class="detail-box">
          <span>
            Expense Category
          </span>

          <strong>
            ${escapeHtml(item.category_name || "—")}
          </strong>
        </div>

        <!-- VENDOR -->

        <div class="detail-box">
          <span>
            Vendor / Paid To
          </span>

          <strong>
            ${escapeHtml(item.vendor_name || "—")}
          </strong>
        </div>

        <!-- BILL NUMBER -->

        <div class="detail-box">
          <span>
            Bill Number
          </span>

          <strong>
            ${escapeHtml(item.bill_number || "—")}
          </strong>
        </div>

        <!-- BILL DATE -->

        <div class="detail-box">
          <span>
            Bill Date
          </span>

          <strong>
            ${escapeHtml(formatDate(item.bill_date))}
          </strong>
        </div>

        <!-- DUE DATE -->

        <div class="detail-box">
          <span>
            Due Date
          </span>

          <strong>
            ${escapeHtml(formatDate(item.due_date))}
          </strong>
        </div>

        <!-- PAYMENT STATUS -->

        <div class="detail-box">
          <span>
            Payment Status
          </span>

          <strong>

            <span
              class="
                expense-status
                ${getStatusClass(status)}
              "
            >
              <span
                class="status-dot"
              ></span>

              ${escapeHtml(getStatusLabel(status))}
            </span>

          </strong>
        </div>

        <!-- TOTAL -->

        <div class="detail-box">
          <span>
            Total Amount
          </span>

          <strong>
            ${formatCurrency(item.total_amount)}
          </strong>
        </div>

        <!-- PAID -->

        <div class="detail-box">
          <span>
            Paid Amount
          </span>

          <strong>
            ${formatCurrency(item.paid_amount)}
          </strong>
        </div>

        <!-- DUE -->

        <div class="detail-box">
          <span>
            Due Amount
          </span>

          <strong
            class="expense-due"
          >
            ${formatCurrency(item.due_amount)}
          </strong>
        </div>

      </div>

      <!-- TOTAL SUMMARY -->

      <div class="details-total">

        <span>
          Total:
          ${formatCurrency(item.total_amount)}
        </span>

        <span>
          Paid:
          ${formatCurrency(item.paid_amount)}
        </span>

        <strong>
          Due:
          ${formatCurrency(item.due_amount)}
        </strong>

      </div>

      <!-- REMARKS -->

      <div
        class="expense-payable-remarks"
      >
        <span>
          Remarks
        </span>

        <p>
          ${escapeHtml(item.remarks || "—")}
        </p>
      </div>
    `;
  }

  /* =====================================================
       CLOSE VIEW MODAL
       ===================================================== */

  function closeViewModal() {
    const modal = qs("#expensePayableViewModal");

    if (!modal) {
      return;
    }

    modal.hidden = true;

    modal.setAttribute("aria-hidden", "true");

    modal.removeAttribute("data-id");

    document.body.style.overflow = "";
  }

  /* =====================================================
       PAY BILL
       ===================================================== */

  function payBill(id) {
    const item = findPayable(id);

    if (!item) {
      showToast("Expense payable not found.", "error");

      return;
    }

    if (toNumber(item.due_amount) <= 0) {
      showToast("This expense has no outstanding due.", "info");

      return;
    }

    window.location.href = `/payments`;
  }

  /* =====================================================
       RETRY
       ===================================================== */

  function retryLoad() {
    loadPayables();
  }

  /* =====================================================
       PAGINATION
       ===================================================== */

  function goToPage(page) {
    const total = state.filteredPayables.length;

    const totalPages = Math.max(Math.ceil(total / state.pageSize), 1);

    if (page < 1) {
      page = 1;
    }

    if (page > totalPages) {
      page = totalPages;
    }

    state.page = page;

    renderTable();
  }

  /* =====================================================
       EVENT DELEGATION
       ===================================================== */

  function handleClick(event) {
    const actionElement = event.target.closest("[data-action]");

    if (!actionElement) {
      return;
    }

    const action = actionElement.dataset.action;

    switch (action) {
      /* VIEW */

      case "view": {
        const id = actionElement.dataset.id;

        showViewModal(id);

        break;
      }

      /* PAY */

      case "pay": {
        const id = actionElement.dataset.id;

        payBill(id);

        break;
      }

      /* RETRY */

      case "retry":
        retryLoad();
        break;

      /* CLOSE VIEW */

      case "close-view":
        closeViewModal();
        break;

      /* PAY FROM MODAL */

      case "modal-pay": {
        const modal = qs("#expensePayableViewModal");

        const id = modal?.dataset?.id;

        if (id) {
          payBill(id);
        }

        break;
      }

      default:
        break;
    }
  }

  /* =====================================================
       FILTER EVENTS
       ===================================================== */

  function bindFilterEvents() {
    const search = qs("#filter_search");

    const status = qs("#filter_status");

    const fromDate = qs("#filter_from_date");

    const toDate = qs("#filter_to_date");

    const reset = qs("#resetFilters");

    if (search) {
      search.addEventListener("input", debounce(applyFilters, 200));
    }

    if (status) {
      status.addEventListener("change", applyFilters);
    }

    if (fromDate) {
      fromDate.addEventListener("change", applyFilters);
    }

    if (toDate) {
      toDate.addEventListener("change", applyFilters);
    }

    if (reset) {
      reset.addEventListener("click", resetFilters);
    }
  }

  /* =====================================================
       DEBOUNCE
       ===================================================== */

  function debounce(callback, delay = 250) {
    let timer = null;

    return function (...args) {
      clearTimeout(timer);

      timer = setTimeout(() => {
        callback.apply(this, args);
      }, delay);
    };
  }

  /* =====================================================
       MODAL EVENTS
       ===================================================== */

  function bindModalEvents() {
    const modal = qs("#expensePayableViewModal");

    const closeButton = qs("#closeExpensePayableViewModal");

    const closeFooterButton = qs("#closeExpensePayableView");

    const payButton = qs("#payExpensePayableView");

    /* X BUTTON */

    if (closeButton) {
      closeButton.addEventListener("click", (event) => {
        event.preventDefault();

        event.stopPropagation();

        closeViewModal();
      });
    }

    /* CLOSE BUTTON */

    if (closeFooterButton) {
      closeFooterButton.addEventListener("click", (event) => {
        event.preventDefault();

        event.stopPropagation();

        closeViewModal();
      });
    }

    /* PAY NOW */

    if (payButton) {
      payButton.addEventListener("click", (event) => {
        event.preventDefault();

        event.stopPropagation();

        const id = modal?.dataset?.id;

        if (id) {
          payBill(id);
        }
      });
    }

    /* BACKDROP CLICK */

    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeViewModal();
        }
      });
    }

    /* ESC */

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal && !modal.hidden) {
        closeViewModal();
      }
    });
  }

  /* =====================================================
       PAGINATION EVENTS
       ===================================================== */

  function bindPaginationEvents() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");

      if (!button) {
        return;
      }

      const page = Number(button.dataset.page);

      if (Number.isFinite(page)) {
        goToPage(page);
      }
    });
  }

  /* =====================================================
       PAGINATION RENDER
       ===================================================== */

  function renderPagination() {
    const container = qs("#expensePagination");

    if (!container) {
      return;
    }

    const total = state.filteredPayables.length;

    const totalPages = Math.ceil(total / state.pageSize);

    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    let html = "";

    /* PREVIOUS */

    html += `
      <button
        type="button"
        class="pagination-btn"
        data-page="${state.page - 1}"
        ${state.page <= 1 ? "disabled" : ""}
      >
        <i
          class="
            fa-solid
            fa-chevron-left
          "
        ></i>
      </button>
    `;

    const startPage = Math.max(1, state.page - 2);

    const endPage = Math.min(totalPages, state.page + 2);

    for (let page = startPage; page <= endPage; page++) {
      html += `
        <button
          type="button"
          class="
            pagination-btn
            ${page === state.page ? "active" : ""}
          "
          data-page="${page}"
        >
          ${page}
        </button>
      `;
    }

    /* NEXT */

    html += `
      <button
        type="button"
        class="pagination-btn"
        data-page="${state.page + 1}"
        ${state.page >= totalPages ? "disabled" : ""}
      >
        <i
          class="
            fa-solid
            fa-chevron-right
          "
        ></i>
      </button>
    `;

    container.innerHTML = html;
  }

  /* =====================================================
       INITIALIZATION
       ===================================================== */

  function init() {
    bindFilterEvents();

    bindModalEvents();

    bindPaginationEvents();

    document.addEventListener("click", handleClick);

    loadPayables();
  }

  /* =====================================================
       PUBLIC API
       ===================================================== */

  window.ExpensePayablesPage = {
    init,

    load: loadPayables,

    reload: loadPayables,

    payBill,

    resetFilters,

    applyFilters,

    showViewModal,

    closeViewModal,
  };

  /* =====================================================
       BACKWARD COMPATIBILITY
       ===================================================== */

  window.payBill = payBill;

  /* =====================================================
       DOM READY
       ===================================================== */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true,
    });
  } else {
    init();
  }
})();
