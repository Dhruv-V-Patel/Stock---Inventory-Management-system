/* ========================================
   EXPENSE BILLS PAGE
   Purchase-page style architecture
======================================== */

const ExpenseBillsPage = (() => {
  const state = {
    bills: [],
    filteredBills: [],
    categories: [],
    page: 1,
    pageSize: 30,
    editingId: null,
    deletingId: null,
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

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const formatDate = (value) => {
    if (!value) return "—";

    const raw = String(value).slice(0, 10);
    const date = new Date(`${raw}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const today = () => new Date().toISOString().slice(0, 10);

  /* ========================================
     API
  ======================================== */

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

  /* ========================================
     TOAST
  ======================================== */

  const showToast = (message, type = "success") => {
    let container = qs("#toastContainer");

    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";

      document.body.appendChild(container);
    }

    const icons = {
      success: "fa-circle-check",
      error: "fa-circle-exclamation",
      warning: "fa-triangle-exclamation",
      info: "fa-circle-info",
    };

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;

    toast.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.success}"></i>

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
      }, 250);
    };

    toast
      .querySelector(".toast-close")
      ?.addEventListener("click", removeToast);

    setTimeout(removeToast, 3000);
  };

  /* ========================================
     NORMALIZE BILL
  ======================================== */

  const normalizeBill = (bill) => {
    const totalAmount = Number(bill.total_amount || 0);
    const paidAmount = Number(bill.paid_amount || 0);

    return {
      id: Number(bill.id),

      expense_no: bill.expense_no ?? "",

      category_id: Number(bill.category_id || 0),

      category_name: bill.category_name ?? "",

      vendor_name: bill.vendor_name ?? "",

      bill_number: bill.bill_number ?? "",

      bill_date: bill.bill_date ?? "",

      due_date: bill.due_date ?? "",

      total_amount: totalAmount,

      paid_amount: paidAmount,

      due_amount: Number(
        bill.due_amount ?? Math.max(0, totalAmount - paidAmount),
      ),

      payment_status: String(
        bill.payment_status || "PENDING",
      ).toUpperCase(),

      remarks: bill.remarks ?? "",
    };
  };

  /* ========================================
     CATEGORIES
  ======================================== */

  const loadCategories = async () => {
    const payload = await apiRequest("/api/expenses/categories");

    state.categories = Array.isArray(payload?.categories)
      ? payload.categories
      : Array.isArray(payload)
        ? payload
        : [];

    elements.categoryId.innerHTML = `
      <option value="">
        Select Category
      </option>

      ${state.categories
        .filter((category) => category.is_active !== false)
        .map(
          (category) => `
            <option value="${category.id}">
              ${escapeHtml(category.name)}
            </option>
          `,
        )
        .join("")}
    `;
  };

  /* ========================================
     LOADING / ERROR
  ======================================== */

  const renderLoading = () => {
    elements.rows.innerHTML = `
      <tr>
        <td colspan="10" class="table-loading">
          <i class="fa-solid fa-spinner fa-spin"></i>
          Loading expense bills...
        </td>
      </tr>
    `;
  };

  const renderError = (message) => {
    elements.rows.innerHTML = `
      <tr>
        <td colspan="10" class="table-loading">
          <i class="fa-solid fa-triangle-exclamation"></i>
          ${escapeHtml(message)}
        </td>
      </tr>
    `;
  };

  /* ========================================
     TABLE
  ======================================== */

  const getStatusClass = (status) =>
    String(status || "PENDING").toLowerCase();

  const renderTable = () => {
    const rows = state.filteredBills;

    if (!rows.length) {
      elements.rows.innerHTML = `
        <tr>
          <td colspan="10">
            <div class="expense-empty">
              <i class="fa-solid fa-file-invoice-dollar"></i>

              <h3>
                No expense bills found
              </h3>

              <p>
                Try changing your filters or
                create a new expense bill.
              </p>
            </div>
          </td>
        </tr>
      `;

      renderPaginationInfo(0);

      return;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(rows.length / state.pageSize),
    );

    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.pageSize;

    const pageRows = rows.slice(
      start,
      start + state.pageSize,
    );

    elements.rows.innerHTML = pageRows
      .map(
        (bill) => `
          <tr>

            <td>
              <span class="expense-number">
                ${escapeHtml(bill.expense_no || "—")}
              </span>
            </td>

            <td>
              <span class="expense-category">
                ${escapeHtml(bill.category_name || "—")}
              </span>
            </td>

            <td>
              <span class="expense-vendor">
                ${escapeHtml(bill.vendor_name || "—")}
              </span>
            </td>

            <td>
              <span class="expense-bill-number">
                ${escapeHtml(bill.bill_number || "—")}
              </span>
            </td>

            <td>
              <span class="expense-date">
                ${escapeHtml(formatDate(bill.bill_date))}
              </span>
            </td>

            <td>
              <span class="expense-amount">
                ${formatCurrency(bill.total_amount)}
              </span>
            </td>

            <td>
              <span class="expense-paid">
                ${formatCurrency(bill.paid_amount)}
              </span>
            </td>

            <td>
              <span class="expense-due">
                ${formatCurrency(bill.due_amount)}
              </span>
            </td>

            <td>
              <span
                class="expense-status ${getStatusClass(
                  bill.payment_status,
                )}"
              >
                ${escapeHtml(bill.payment_status)}
              </span>
            </td>

            <td>
              <div class="expense-actions">

                <button
                  type="button"
                  class="expense-action"
                  data-action="view"
                  data-id="${bill.id}"
                  title="View expense"
                  aria-label="View expense"
                >
                  <i class="fa-solid fa-eye"></i>
                </button>

                <button
                  type="button"
                  class="expense-action"
                  data-action="edit"
                  data-id="${bill.id}"
                  title="Edit expense"
                  aria-label="Edit expense"
                >
                  <i class="fa-solid fa-pen"></i>
                </button>

                <button
                  type="button"
                  class="expense-action danger"
                  data-action="delete"
                  data-id="${bill.id}"
                  title="Delete expense"
                  aria-label="Delete expense"
                >
                  <i class="fa-solid fa-trash"></i>
                </button>

              </div>
            </td>

          </tr>
        `,
      )
      .join("");

    renderPaginationInfo(
      rows.length,
      start,
      pageRows.length,
    );
  };

  /* ========================================
     PAGINATION INFO
  ======================================== */

  const renderPaginationInfo = (
    total,
    start = 0,
    count = 0,
  ) => {
    let info = qs("#expensePaginationInfo");

    if (!info) {
      info = document.createElement("div");

      info.id = "expensePaginationInfo";

      info.className = "expense-pagination-info";

      elements.rows
        .closest(".expense-table-wrap")
        ?.after(info);
    }

    if (!total) {
      info.textContent = "Showing 0 expenses";

      return;
    }

    info.textContent = `Showing ${start + 1}-${Math.min(
      start + count,
      total,
    )} of ${total} expenses`;
  };

  /* ========================================
     FILTERS
  ======================================== */

  const applyFilters = () => {
    const search = elements.search.value
      .trim()
      .toLowerCase();

    const status = elements.status.value;

    const fromDate = elements.fromDate.value;

    const toDate = elements.toDate.value;

    state.filteredBills = state.bills.filter(
      (bill) => {
        const billDate = String(
          bill.bill_date || "",
        ).slice(0, 10);

        const matchesSearch =
          !search ||
          bill.expense_no
            .toLowerCase()
            .includes(search) ||
          bill.category_name
            .toLowerCase()
            .includes(search) ||
          bill.vendor_name
            .toLowerCase()
            .includes(search) ||
          bill.bill_number
            .toLowerCase()
            .includes(search);

        const matchesStatus =
          !status ||
          bill.payment_status === status;

        const matchesFrom =
          !fromDate ||
          billDate >= fromDate;

        const matchesTo =
          !toDate ||
          billDate <= toDate;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesFrom &&
          matchesTo
        );
      },
    );

    state.page = 1;

    renderTable();
  };

  /* ========================================
     LOAD BILLS
  ======================================== */

  const loadBills = async () => {
    renderLoading();

    try {
      const query = new URLSearchParams();

      const search = elements.search.value.trim();

      const status = elements.status.value;

      const fromDate = elements.fromDate.value;

      const toDate = elements.toDate.value;

      if (search) {
        query.set("search", search);
      }

      if (status) {
        query.set("status", status);
      }

      if (fromDate) {
        query.set("from_date", fromDate);
      }

      if (toDate) {
        query.set("to_date", toDate);
      }

      const queryString = query.toString();

      const payload = await apiRequest(
        `/api/expenses/bills${
          queryString
            ? `?${queryString}`
            : ""
        }`,
      );

      const rows = Array.isArray(payload)
        ? payload
        : payload?.bills ||
          payload?.data ||
          [];

      state.bills = rows.map(normalizeBill);

      applyFilters();
    } catch (error) {
      console.error(
        "[Expense Bills] load error:",
        error,
      );

      state.bills = [];

      state.filteredBills = [];

      renderError(error.message);

      renderPaginationInfo(0);

      showToast(error.message, "error");
    }
  };

  /* ========================================
     FORM
  ======================================== */

  const resetForm = () => {
    state.editingId = null;

    elements.form.reset();

    elements.billId.value = "";

    elements.billDate.value = today();

    elements.dueDate.value = "";

    elements.totalAmount.value = "";

    if (elements.modalTitle) {
      elements.modalTitle.textContent =
        "Expense Bill";
    }

    const saveButton =
      elements.form.querySelector(
        'button[type="submit"]',
      );

    if (saveButton) {
      saveButton.disabled = false;

      const span =
        saveButton.querySelector("span");

      if (span) {
        span.textContent = "Save Bill";
      }
    }
  };

  const openModal = () => {
    resetForm();

    elements.modal.hidden = false;

    elements.modal.removeAttribute("hidden");

    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      elements.categoryId?.focus();
    });
  };

  const closeModal = () => {
    elements.modal.hidden = true;

    elements.modal.setAttribute("hidden", "");

    document.body.style.overflow = "";

    state.editingId = null;
  };

  /* ========================================
     EDIT
  ======================================== */

  const populateEditForm = (bill) => {
    state.editingId = Number(bill.id);

    elements.billId.value = String(bill.id);

    elements.categoryId.value = String(
      bill.category_id || "",
    );

    elements.vendorName.value =
      bill.vendor_name || "";

    elements.billNumber.value =
      bill.bill_number || "";

    elements.billDate.value = String(
      bill.bill_date || "",
    ).slice(0, 10);

    elements.dueDate.value = String(
      bill.due_date || "",
    ).slice(0, 10);

    elements.totalAmount.value =
      Number(bill.total_amount || 0);

    elements.remarks.value =
      bill.remarks || "";

    if (elements.modalTitle) {
      elements.modalTitle.textContent =
        `Edit Expense ${
          bill.expense_no || ""
        }`.trim();
    }

    const saveButton =
      elements.form.querySelector(
        'button[type="submit"]',
      );

    if (saveButton) {
      const span =
        saveButton.querySelector("span");

      if (span) {
        span.textContent = "Update Bill";
      }
    }
  };

  const openEdit = async (id) => {
    try {
      elements.modal.hidden = false;

      elements.modal.removeAttribute("hidden");

      document.body.style.overflow = "hidden";

      const payload = await apiRequest(
        `/api/expenses/bills/${encodeURIComponent(
          id,
        )}`,
      );

      if (!payload?.bill) {
        throw new Error(
          "Expense bill not found.",
        );
      }

      resetForm();

      populateEditForm(
        normalizeBill(payload.bill),
      );

      elements.vendorName.focus();
    } catch (error) {
      console.error(
        "[Expense Bills] edit load error:",
        error,
      );

      closeModal();

      showToast(error.message, "error");
    }
  };

  /* ========================================
     VALIDATION
  ======================================== */

  const validateForm = () => {
    const categoryId =
      elements.categoryId.value;

    const vendorName =
      elements.vendorName.value.trim();

    const billDate =
      elements.billDate.value;

    const totalAmount = Number(
      elements.totalAmount.value,
    );

    if (!categoryId) {
      showToast(
        "Expense category is required.",
        "warning",
      );

      elements.categoryId.focus();

      return false;
    }

    if (!vendorName) {
      showToast(
        "Vendor / Paid To is required.",
        "warning",
      );

      elements.vendorName.focus();

      return false;
    }

    if (!billDate) {
      showToast(
        "Bill date is required.",
        "warning",
      );

      elements.billDate.focus();

      return false;
    }

    if (
      !Number.isFinite(totalAmount) ||
      totalAmount <= 0
    ) {
      showToast(
        "Bill amount must be greater than 0.",
        "warning",
      );

      elements.totalAmount.focus();

      return false;
    }

    if (
      elements.dueDate.value &&
      elements.dueDate.value < billDate
    ) {
      showToast(
        "Due date cannot be before bill date.",
        "warning",
      );

      elements.dueDate.focus();

      return false;
    }

    return true;
  };

  /* ========================================
     PAYLOAD
  ======================================== */

  const getPayload = () => ({
    category_id: Number(
      elements.categoryId.value,
    ),

    vendor_name:
      elements.vendorName.value.trim(),

    bill_number:
      elements.billNumber.value.trim() ||
      null,

    bill_date:
      elements.billDate.value,

    due_date:
      elements.dueDate.value || null,

    total_amount:
      Number(elements.totalAmount.value),

    remarks:
      elements.remarks.value.trim() ||
      null,
  });

  /* ========================================
     SAVE / UPDATE
  ======================================== */

  const saveBill = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const isEdit =
      Number.isInteger(state.editingId) &&
      state.editingId > 0;

    const button =
      elements.form.querySelector(
        'button[type="submit"]',
      );

    if (button) {
      button.disabled = true;

      const span =
        button.querySelector("span");

      if (span) {
        span.textContent = isEdit
          ? "Updating..."
          : "Saving...";
      }
    }

    try {
      const payload = await apiRequest(
        isEdit
          ? `/api/expenses/bills/${state.editingId}`
          : "/api/expenses/bills",
        {
          method: isEdit
            ? "PUT"
            : "POST",

          body: JSON.stringify(
            getPayload(),
          ),
        },
      );

      const savedBill = payload?.bill;

      closeModal();

      showToast(
        isEdit
          ? `Expense ${
              savedBill?.expense_no || ""
            } updated successfully.`
          : `Expense ${
              savedBill?.expense_no || ""
            } saved successfully.`,
      );

      await loadBills();
    } catch (error) {
      console.error(
        `[Expense Bills] ${
          isEdit
            ? "update"
            : "save"
        } error:`,
        error,
      );

      showToast(
        error.message,
        "error",
      );
    } finally {
      if (button) {
        button.disabled = false;

        const span =
          button.querySelector("span");

        if (span) {
          span.textContent = isEdit
            ? "Update Bill"
            : "Save Bill";
        }
      }
    }
  };

  /* ========================================
     VIEW MODAL
  ======================================== */

  const getBillById = (id) =>
    state.bills.find(
      (bill) =>
        String(bill.id) ===
        String(id),
    );

  const openView = async (id) => {
    if (!elements.viewModal) {
      return;
    }

    elements.viewModal.hidden = false;

    elements.viewModal.setAttribute(
      "aria-hidden",
      "false",
    );

    document.body.style.overflow = "hidden";

    elements.viewTitle.textContent =
      "Expense Bill";

    elements.viewSubtitle.textContent =
      "Expense bill details";

    elements.details.innerHTML = `
      <div class="purchases-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Loading expense bill...
      </div>
    `;

    try {
      const payload =
        await apiRequest(
          `/api/expenses/bills/${encodeURIComponent(
            id,
          )}`,
        );

      const bill = payload?.bill;

      if (!bill) {
        throw new Error(
          "Expense bill not found.",
        );
      }

      const normalized =
        normalizeBill(bill);

      elements.viewTitle.textContent =
        normalized.expense_no ||
        "Expense Bill";

      elements.viewSubtitle.textContent =
        normalized.vendor_name ||
        "Expense bill details";

      elements.details.innerHTML = `
        <div class="details-grid">

          <div class="detail-box">
            <span>Expense No.</span>
            <strong>
              ${escapeHtml(
                normalized.expense_no ||
                  "—",
              )}
            </strong>
          </div>

          <div class="detail-box">
            <span>Expense Category</span>
            <strong>
              ${escapeHtml(
                normalized.category_name ||
                  "—",
              )}
            </strong>
          </div>

          <div class="detail-box">
            <span>Vendor / Paid To</span>
            <strong>
              ${escapeHtml(
                normalized.vendor_name ||
                  "—",
              )}
            </strong>
          </div>

          <div class="detail-box">
            <span>Bill Number</span>
            <strong>
              ${escapeHtml(
                normalized.bill_number ||
                  "—",
              )}
            </strong>
          </div>

          <div class="detail-box">
            <span>Bill Date</span>
            <strong>
              ${escapeHtml(
                formatDate(
                  normalized.bill_date,
                ),
              )}
            </strong>
          </div>

          <div class="detail-box">
            <span>Due Date</span>
            <strong>
              ${escapeHtml(
                formatDate(
                  normalized.due_date,
                ),
              )}
            </strong>
          </div>

          <div class="detail-box">
            <span>Payment Status</span>
            <strong>
              <span
                class="expense-status ${getStatusClass(
                  normalized.payment_status,
                )}"
              >
                ${escapeHtml(
                  normalized.payment_status ||
                    "PENDING",
                )}
              </span>
            </strong>
          </div>

          <div class="detail-box">
            <span>Total Amount</span>
            <strong>
              ${formatCurrency(
                normalized.total_amount,
              )}
            </strong>
          </div>

          <div class="detail-box">
            <span>Paid Amount</span>
            <strong>
              ${formatCurrency(
                normalized.paid_amount,
              )}
            </strong>
          </div>

          <div class="detail-box">
            <span>Due Amount</span>
            <strong>
              ${formatCurrency(
                normalized.due_amount,
              )}
            </strong>
          </div>

        </div>

        <div class="details-total">

          <span>
            Total:
            ${formatCurrency(
              normalized.total_amount,
            )}
          </span>

          <span>
            Paid:
            ${formatCurrency(
              normalized.paid_amount,
            )}
          </span>

          <strong>
            Due:
            ${formatCurrency(
              normalized.due_amount,
            )}
          </strong>

        </div>

        <div class="expense-view-remarks">

          <span>Remarks</span>

          <p>
            ${escapeHtml(
              normalized.remarks ||
                "—",
            )}
          </p>

        </div>
      `;
    } catch (error) {
      console.error(
        "[Expense Bills] view error:",
        error,
      );

      elements.details.innerHTML = `
        <div class="purchases-loading">
          <i class="fa-solid fa-triangle-exclamation"></i>

          ${escapeHtml(
            error.message ||
              "Unable to load expense bill.",
          )}
        </div>
      `;
    }
  };

  const closeView = () => {
    if (!elements.viewModal) {
      return;
    }

    elements.viewModal.hidden = true;

    elements.viewModal.setAttribute(
      "aria-hidden",
      "true",
    );

    document.body.style.overflow = "";
  };

  /* ========================================
     DELETE MODAL
  ======================================== */

  const openDeleteModal = (id) => {
    const bill = getBillById(id);

    if (!bill) {
      showToast(
        "Expense bill not found.",
        "error",
      );

      return;
    }

    state.deletingId = Number(id);

    elements.deleteMessage.textContent =
      `Delete ${
        bill.expense_no ||
        "this expense bill"
      }? This will permanently remove the expense bill record.`;

    elements.confirmDeleteButton.disabled =
      false;

    elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-trash-can"></i>
      Delete Bill
    `;

    elements.deleteModal.hidden = false;

    elements.deleteModal.setAttribute(
      "aria-hidden",
      "false",
    );

    document.body.style.overflow =
      "hidden";
  };

  const closeDeleteModal = () => {
    if (!elements.deleteModal) {
      return;
    }

    elements.deleteModal.hidden = true;

    elements.deleteModal.setAttribute(
      "aria-hidden",
      "true",
    );

    state.deletingId = null;

    document.body.style.overflow = "";
  };

  /* ========================================
     CONFIRM DELETE
  ======================================== */

  const deleteBillConfirmed =
    async () => {
      const id =
        state.deletingId;

      if (
        id === null ||
        id === undefined ||
        id === ""
      ) {
        closeDeleteModal();

        return;
      }

      const bill =
        getBillById(id);

      if (!bill) {
        showToast(
          "Expense bill not found.",
          "error",
        );

        closeDeleteModal();

        return;
      }

      try {
        elements.confirmDeleteButton.disabled =
          true;

        elements.confirmDeleteButton.innerHTML = `
          <i class="fa-solid fa-spinner fa-spin"></i>
          Deleting...
        `;

        await apiRequest(
          `/api/expenses/bills/${encodeURIComponent(
            id,
          )}`,
          {
            method: "DELETE",
          },
        );

        closeDeleteModal();

        showToast(
          `${
            bill.expense_no ||
            "Expense bill"
          } deleted successfully.`,
          "success",
        );

        await loadBills();
      } catch (error) {
        console.error(
          "[Expense Bills] delete error:",
          error,
        );

        showToast(
          error.message ||
            "Unable to delete expense bill.",
          "error",
        );
      } finally {
        if (
          elements.confirmDeleteButton
        ) {
          elements.confirmDeleteButton.disabled =
            false;

          elements.confirmDeleteButton.innerHTML = `
            <i class="fa-solid fa-trash-can"></i>
            Delete Bill
          `;
        }
      }
    };

  /* ========================================
     TABLE ACTION
  ======================================== */

  const handleTableAction = (
    event,
  ) => {
    const button =
      event.target.closest(
        "[data-action]",
      );

    if (!button) {
      return;
    }

    const action =
      button.dataset.action;

    const id =
      button.dataset.id;

    if (!id) {
      return;
    }

    const bill =
      getBillById(id);

    if (!bill) {
      showToast(
        "Expense bill not found.",
        "error",
      );

      return;
    }

    if (action === "view") {
      openView(id);
    } else if (
      action === "edit"
    ) {
      openEdit(id);
    } else if (
      action === "delete"
    ) {
      openDeleteModal(id);
    }
  };

  /* ========================================
     RESET FILTERS
  ======================================== */

  const resetFilters = () => {
    elements.search.value = "";

    elements.status.value = "";

    elements.fromDate.value = "";

    elements.toDate.value = "";

    loadBills();
  };

  /* ========================================
     EVENTS
  ======================================== */

  const bindEvents = () => {
    elements.add?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        openModal();
      },
    );

    elements.close?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        closeModal();
      },
    );

    elements.cancel?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        closeModal();
      },
    );

    elements.form?.addEventListener(
      "submit",
      saveBill,
    );

    elements.rows?.addEventListener(
      "click",
      handleTableAction,
    );

    elements.search?.addEventListener(
      "input",
      applyFilters,
    );

    elements.status?.addEventListener(
      "change",
      applyFilters,
    );

    elements.fromDate?.addEventListener(
      "change",
      applyFilters,
    );

    elements.toDate?.addEventListener(
      "change",
      applyFilters,
    );

    elements.resetFilters?.addEventListener(
      "click",
      resetFilters,
    );

    /* ========================================
       VIEW MODAL
    ======================================== */

    elements.closeView?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        closeView();
      },
    );

    elements.closeViewButton?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        closeView();
      },
    );

    elements.viewModal?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          elements.viewModal
        ) {
          closeView();
        }
      },
    );

    /* ========================================
       DELETE MODAL
    ======================================== */

    elements.cancelDeleteButton?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        closeDeleteModal();
      },
    );

    elements.confirmDeleteButton?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        deleteBillConfirmed();
      },
    );

    elements.deleteModal?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          elements.deleteModal
        ) {
          closeDeleteModal();
        }
      },
    );

    /* ========================================
       FORM MODAL
    ======================================== */

    elements.modal?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          elements.modal
        ) {
          closeModal();
        }
      },
    );

    /* ========================================
       ESCAPE
    ======================================== */

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key !== "Escape"
        ) {
          return;
        }

        if (
          elements.deleteModal &&
          !elements.deleteModal.hidden
        ) {
          closeDeleteModal();

          return;
        }

        if (
          elements.viewModal &&
          !elements.viewModal.hidden
        ) {
          closeView();

          return;
        }

        if (
          elements.modal &&
          !elements.modal.hidden
        ) {
          closeModal();
        }
      },
    );
  };

  /* ========================================
     CACHE DOM
  ======================================== */

  const cacheElements = () => {
    elements.add = qs("#add");

    elements.close = qs("#close");

    elements.cancel =
      qs("#cancelExpenseBill");

    elements.modal = qs("#modal");

    elements.modalTitle =
      qs("#expenseModalTitle");

    elements.form = qs("#form");

    elements.billId =
      qs("#billId");

    elements.categoryId =
      qs("#categoryId");

    elements.vendorName =
      qs("#vendorName");

    elements.billNumber =
      qs("#billNumber");

    elements.billDate =
      qs("#billDate");

    elements.dueDate =
      qs("#dueDate");

    elements.totalAmount =
      qs("#totalAmount");

    elements.remarks =
      qs("#remarks");

    elements.rows =
      qs("#rows");

    elements.search =
      qs("#filter_search");

    elements.status =
      qs("#filter_status");

    elements.fromDate =
      qs("#filter_from_date");

    elements.toDate =
      qs("#filter_to_date");

    elements.resetFilters =
      qs("#resetFilters");

    /* ========================================
       VIEW MODAL
    ======================================== */

    elements.viewModal =
      qs("#viewExpenseBillModal");

    elements.closeView =
      qs("#closeViewExpenseBillModal");

    elements.closeViewButton =
      qs("#closeViewExpenseBill");

    elements.viewTitle =
      qs("#viewExpenseBillTitle");

    elements.viewSubtitle =
      qs("#viewExpenseBillSubtitle");

    elements.details =
      qs("#expenseBillDetailsContent");

    /* ========================================
       DELETE MODAL
    ======================================== */

    elements.deleteModal =
      qs("#deleteExpenseBillModal");

    elements.deleteMessage =
      qs("#deleteExpenseBillMessage");

    elements.cancelDeleteButton =
      qs("#cancelDeleteExpenseBill");

    elements.confirmDeleteButton =
      qs("#confirmDeleteExpenseBill");
  };

  /* ========================================
     INIT
  ======================================== */

  const init = async () => {
    cacheElements();

    if (
      !elements.form ||
      !elements.rows
    ) {
      console.error(
        "[Expense Bills] Required DOM elements are missing.",
      );

      return;
    }

    bindEvents();

    try {
      await loadCategories();

      await loadBills();
    } catch (error) {
      console.error(
        "[Expense Bills] initialization error:",
        error,
      );

      showToast(
        error.message,
        "error",
      );
    }
  };

  return {
    init,
  };
})();

const initExpenseBillsPage =
  () =>
    ExpenseBillsPage.init();

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initExpenseBillsPage,
    {
      once: true,
    },
  );
} else {
  initExpenseBillsPage();
}