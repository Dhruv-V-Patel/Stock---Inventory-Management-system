const PaymentsPage = (() => {
  const state = {
    payments: [],
    filtered: [],
    customers: [],
    suppliers: [],
    expenseCategories: [],
    expenseBills: [],
    page: 1,
    pageSize: 30,
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

  const token = () => localStorage.getItem("accessToken");

  const apiRequest = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token()
          ? {
              Authorization: `Bearer ${token()}`,
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
    } catch (_) {}

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          payload?.error ||
          `Request failed with status ${response.status}.`,
      );
    }

    return payload;
  };

  const currency = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const formatDate = (value) => {
    if (!value) return "-";

    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);

    if (Number.isNaN(d.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  };

  const today = () => {
    const d = new Date();

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const showToast = (message, type = "success") => {
    const container = qs("#toastContainer");

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

    toast.querySelector(".toast-close")?.addEventListener("click", removeToast);

    setTimeout(removeToast, 3000);
  };

  const normalizePayment = (payment) => ({
    ...payment,
    id: Number(payment.id),
    amount: Number(payment.amount || 0),
    payment_type: payment.payment_type || "",
    payment_mode: payment.payment_mode || "INVOICE",
    expense_category_id: payment.expense_category_id
      ? Number(payment.expense_category_id)
      : null,
    paid_to: payment.paid_to || "",
    expense_bill_id: payment.expense_bill_id
      ? Number(payment.expense_bill_id)
      : null,
    payment_date: payment.payment_date || "",
    payment_no: payment.payment_no || "",
    party_name: payment.party_name || "",
    party_mobile: payment.party_mobile || "",
    document_no: payment.document_no || "",
    payment_method: payment.payment_method || "",
    reference_no: payment.reference_no || "",
    remarks: payment.remarks || "",
    total_amount: Number(payment.total_amount || 0),
    paid_before: Number(payment.paid_before || 0),
    outstanding: Number(payment.outstanding || 0),
    allocated_amount: Number(payment.allocated_amount || 0),
  });

  const getSelectedParty = () => {
    const type = elements.paymentType.value;

    const id = Number(
      type === "CUSTOMER"
        ? elements.customerId.value
        : elements.supplierId.value,
    );

    if (!id) {
      return null;
    }

    const list = type === "CUSTOMER" ? state.customers : state.suppliers;

    return list.find((party) => Number(party.id) === id) || null;
  };

  const getPartyDue = () => {
    const party = getSelectedParty();
    return Number(party?.total_due ?? party?.outstanding ?? party?.due ?? 0);
  };

  const getPartyAdvance = () => {
    const party = getSelectedParty();

    return Number(party?.available_advance ?? party?.advance ?? 0);
  };

  const getEditingPaymentAmount = () => {
    if (!state.editingId) {
      return 0;
    }

    const payment = state.payments.find(
      (p) => Number(p.id) === Number(state.editingId),
    );

    return Number(payment?.amount || 0);
  };

  // const loadOptions = async () => {
  //   const payload = await apiRequest("/api/payments/options");

  //   state.customers = payload.customers || [];
  //   state.suppliers = payload.suppliers || [];
  //   state.expenseCategories = payload.expense_categories || [];
  //   state.expenseBills = payload.expense_bills || [];

  //   renderPartyOptions();
  //   renderExpenseOptions();

  //   updatePartyBalance();
  // };

  const loadOptions = async () => {
  const payload = await apiRequest("/api/payments/options");

  state.customers = payload.customers || [];
  state.suppliers = payload.suppliers || [];

  state.expenseCategories = (
    payload.expense_categories || []
  )
    .map((category) => ({
      ...category,
      id: Number(category.id),
      name: category.name || "",
      total_due: Number(category.total_due || 0),
      available_advance: Number(category.available_advance || 0),
    }))
    .filter(
      (category) =>
        Number.isInteger(category.id) &&
        category.id > 0,
    );

  state.expenseBills = payload.expense_bills || [];

  renderPartyOptions();
  renderExpenseOptions();

  updatePartyBalance();
};

///  

  const renderPartyOptions = () => {
    elements.customerId.innerHTML = `
      <option value="">Select Customer</option>

      ${state.customers
        .map(
          (customer) => `
            <option value="${customer.id}">
              ${escapeHtml(customer.name)}
              ${customer.mobile ? ` — ${escapeHtml(customer.mobile)}` : ""}
            </option>
          `,
        )
        .join("")}
    `;

    elements.supplierId.innerHTML = `
      <option value="">Select Supplier</option>

      ${state.suppliers
        .map(
          (supplier) => `
            <option value="${supplier.id}">
              ${escapeHtml(supplier.name)}
              ${supplier.mobile ? ` — ${escapeHtml(supplier.mobile)}` : ""}
            </option>
          `,
        )
        .join("")}
    `;
  };

  const renderExpenseOptions = () => {
    if (elements.expenseCategoryId) {
      elements.expenseCategoryId.innerHTML = `
        <option value="">Select Category</option>
        ${state.expenseCategories
          .map(
            (category) => `
          <option value="${category.id}">${escapeHtml(category.name)}</option>
        `,
          )
          .join("")}
      `;
    }
  };

  const updateSummary = () => {
    elements.totalPayments.textContent =
      state.payments.length.toLocaleString("en-IN");

    const customerReceived = state.payments
      .filter((payment) => payment.payment_type === "CUSTOMER")
      .reduce((total, payment) => total + Number(payment.amount || 0), 0);

    const supplierPaid = state.payments
      .filter((payment) => payment.payment_type === "SUPPLIER")
      .reduce((total, payment) => total + Number(payment.amount || 0), 0);

    elements.receivedAmount.textContent = currency(customerReceived);

    elements.supplierPaidAmount.textContent = currency(supplierPaid);

    const due =
      state.customers.reduce(
        (total, customer) =>
          total + Number(customer.total_due ?? customer.outstanding ?? 0),
        0,
      ) +
      state.suppliers.reduce(
        (total, supplier) =>
          total + Number(supplier.total_due ?? supplier.outstanding ?? 0),
        0,
      );

    elements.outstandingAmount.textContent = currency(due);
  };

  const render = () => {
    const rows = state.filtered;

    if (!rows.length) {
      elements.tableBody.innerHTML = "";
      elements.empty.hidden = false;
      elements.count.textContent = "Showing 0 payments";
      pagination();
      return;
    }

    elements.empty.hidden = true;
    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    elements.tableBody.innerHTML = pageRows
      .map(
        (payment) => `
            <tr>

              <td>
                <span class="payment-number">
                  ${escapeHtml(payment.payment_no)}
                </span>
              </td>

              <td>
                <span class="type-badge ${String(
                  payment.payment_type,
                ).toLowerCase()}">
                  ${
                    payment.payment_type === "CUSTOMER"
                      ? "Customer Receipt"
                      : payment.payment_type === "SUPPLIER"
                        ? "Supplier Payment"
                        : "Expense Payment"
                  }
                </span>
              </td>

              <td>
                <div class="party-cell">
                  <strong>
                    ${escapeHtml(payment.party_name || "—")}
                  </strong>

                  ${
                    payment.payment_type === "EXPENSE" &&
                    payment.expense_category_name
                      ? `<small>${escapeHtml(payment.expense_category_name)}</small>`
                      : payment.party_mobile
                        ? `<small>${escapeHtml(payment.party_mobile)}</small>`
                        : ""
                  }
                </div>
              </td>

              <td>
                ${
                  payment.document_no
                    ? escapeHtml(payment.document_no)
                    : payment.payment_mode === "ADVANCE"
                      ? `<span class="text-muted">Advance</span>`
                      : `<span class="text-muted">Auto FIFO</span>`
                }
              </td>

              <td>
                ${escapeHtml(formatDate(payment.payment_date))}
              </td>

              <td>
                <span class="payment-amount">
                  ${currency(payment.amount)}
                </span>
              </td>

              <td>
                <span class="method-badge">
                  ${escapeHtml(payment.payment_method || "—")}
                </span>
              </td>

              <td class="action-column">
                <div class="payment-actions">

                  <button
                    class="table-action"
                    data-action="view"
                    data-id="${payment.id}"
                    title="View"
                  >
                    <i class="fa-solid fa-eye"></i>
                  </button>

                  <button
                    class="table-action"
                    data-action="edit"
                    data-id="${payment.id}"
                    title="Edit"
                  >
                    <i class="fa-solid fa-pen"></i>
                  </button>

                  <button
                    class="table-action danger"
                    data-action="delete"
                    data-id="${payment.id}"
                    title="Delete"
                  >
                    <i class="fa-solid fa-trash"></i>
                  </button>

                </div>
              </td>

            </tr>
          `,
      )
      .join("");

    elements.count.textContent = `Showing ${start + 1}-${Math.min(
      start + pageRows.length,
      rows.length,
    )} of ${rows.length} payments`;

    pagination();
  };

  const pagination = () => {
    const pages = Math.max(
      1,
      Math.ceil(state.filtered.length / state.pageSize),
    );

    elements.pageNumber.textContent = String(state.page);
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= pages;
  };

  const applyFilters = () => {
    const q = elements.search.value.trim().toLowerCase();
    const type = elements.typeFilter.value;
    const method = elements.methodFilter.value;
    const d = elements.dateFilter.value;
    state.filtered = state.payments.filter((payment) => {
      const haystack = [
        payment.payment_no,
        payment.party_name,
        payment.party_mobile,
        payment.document_no,
        payment.reference_no,
        payment.remarks,
        payment.payment_mode,
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!q || haystack.includes(q)) &&
        (!type || payment.payment_type === type) &&
        (!method || payment.payment_method === method) &&
        (!d || String(payment.payment_date).slice(0, 10) === d)
      );
    });

    state.page = 1;

    render();
  };

  const loadPayments = async () => {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="payments-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading payments...
          </div>
        </td>
      </tr>
    `;

    try {
      const payload = await apiRequest("/api/payments");

      state.payments = (payload.payments || payload.data || []).map(
        normalizePayment,
      );

      updateSummary();
      applyFilters();
    } catch (error) {
      elements.tableBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="payments-loading payments-error">
              <i class="fa-solid fa-triangle-exclamation"></i>
              ${escapeHtml(error.message)}
            </div>
          </td>
        </tr>
      `;
    }
  };

  // const updatePartyBalance = () => {
  //   const type = elements.paymentType.value;
  //   const mode = elements.paymentMode.value || "INVOICE";

  //   const isExpense = type === "EXPENSE";

  //   elements.customerGroup.hidden = type !== "CUSTOMER";
  //   elements.supplierGroup.hidden = type !== "SUPPLIER";
  //   elements.expenseCategoryGroup.hidden = !isExpense;
  //   elements.paidToGroup.hidden = !isExpense;

  //   if (elements.expensePaymentInfo) {
  //     elements.expensePaymentInfo.hidden = !isExpense;
  //   }

  //   if (elements.paymentAllocationInfo) {
  //     elements.paymentAllocationInfo.hidden =
  //       isExpense ||
  //       !(
  //         (type === "CUSTOMER" && elements.customerId.value) ||
  //         (type === "SUPPLIER" && elements.supplierId.value)
  //       );
  //   }

  //   if (isExpense) {
  //     const categoryId = Number(elements.expenseCategoryId?.value || 0);

  //     const category = state.expenseCategories.find(
  //       (item) => Number(item.id) === categoryId,
  //     );

  //     const totalDue = Number(category?.total_due || 0);

  //     const availableAdvance = Number(category?.available_advance || 0);

  //     const amount = Number(elements.amount.value || 0);

  //     elements.referenceTotal.textContent = currency(totalDue);

  //     elements.referencePaid.textContent = currency(availableAdvance);

  //     if (mode === "INVOICE") {
  //       const remainingDue = Math.max(totalDue - amount, 0);

  //       elements.referenceDue.textContent = currency(remainingDue);

  //       elements.outstandingHint.textContent = category
  //         ? `Maximum payable: ${currency(totalDue)}`
  //         : "Select an expense category.";

  //       if (elements.paymentAllocationInfo) {
  //         elements.paymentAllocationInfo.hidden = !category;
  //       }

  //       if (elements.paymentAdvanceInfo) {
  //         elements.paymentAdvanceInfo.hidden = true;
  //       }
  //     } else if (mode === "ADVANCE") {
  //       elements.referenceDue.textContent = currency(totalDue);

  //       elements.outstandingHint.textContent = category
  //         ? "Advance payment will be automatically adjusted against future expense bills."
  //         : "Select an expense category.";

  //       if (elements.paymentAllocationInfo) {
  //         elements.paymentAllocationInfo.hidden = true;
  //       }

  //       if (elements.paymentAdvanceInfo) {
  //         elements.paymentAdvanceInfo.hidden = !category;
  //       }
  //     } else {
  //       elements.referenceDue.textContent = currency(totalDue);

  //       elements.outstandingHint.textContent = category
  //         ? "Quick expense does not require a bill."
  //         : "Select an expense category.";

  //       if (elements.paymentAllocationInfo) {
  //         elements.paymentAllocationInfo.hidden = true;
  //       }

  //       if (elements.paymentAdvanceInfo) {
  //         elements.paymentAdvanceInfo.hidden = true;
  //       }
  //     }

  //     return;
  //   }

  //   const party = getSelectedParty();
  //   const due = Number(
  //     party?.total_due ?? party?.outstanding ?? party?.due ?? 0,
  //   );
  //   const advance = Number(party?.available_advance ?? party?.advance ?? 0);
  //   const amount = Number(elements.amount.value || 0);

  //   if (mode === "INVOICE") {
  //     const editingAmount = getEditingPaymentAmount();
  //     const availableDue = due + editingAmount;
  //     const remainingDue = Math.max(availableDue - amount, 0);
  //     elements.referenceTotal.textContent = currency(availableDue);
  //     elements.referencePaid.textContent = currency(advance);
  //     elements.referenceDue.textContent = currency(remainingDue);
  //     elements.outstandingHint.textContent = party
  //       ? `Maximum payable: ${currency(availableDue)}`
  //       : "";
  //     if (elements.paymentAdvanceInfo)
  //       elements.paymentAdvanceInfo.hidden = true;
  //   } else {
  //     elements.referenceTotal.textContent = currency(due);
  //     elements.referencePaid.textContent = currency(advance);
  //     elements.referenceDue.textContent = currency(due);
  //     elements.outstandingHint.textContent = party
  //       ? "Advance payment has no invoice limit."
  //       : "";
  //     if (elements.paymentAllocationInfo)
  //       elements.paymentAllocationInfo.hidden = true;
  //     if (elements.paymentAdvanceInfo) {
  //       elements.paymentAdvanceInfo.hidden = !party;
  //     }
  //   }
  // };

  const updatePartyBalance = () => {
  const type = elements.paymentType.value;
  const mode = elements.paymentMode.value;
  const amount = Number(elements.amount.value || 0);

  let totalDue = 0;
  let availableAdvance = 0;

  if (type === "CUSTOMER") {
    const customerId = Number(elements.customerId.value || 0);
    const customer = state.customers.find(
      (item) => Number(item.id) === customerId,
    );

    totalDue = Number(customer?.total_due || 0);
    availableAdvance = Number(customer?.available_advance || 0);

    if (state.editingId) {
      totalDue += getEditingPaymentAmount();
    }
  } else if (type === "SUPPLIER") {
    const supplierId = Number(elements.supplierId.value || 0);
    const supplier = state.suppliers.find(
      (item) => Number(item.id) === supplierId,
    );

    totalDue = Number(supplier?.total_due || 0);
    availableAdvance = Number(supplier?.available_advance || 0);

    if (state.editingId) {
      totalDue += getEditingPaymentAmount();
    }
  } else if (type === "EXPENSE") {
    const categoryId = Number(elements.expenseCategoryId.value || 0);

    const category = state.expenseCategories.find(
      (item) => Number(item.id) === categoryId,
    );

    totalDue = Number(category?.total_due || 0);
    availableAdvance = Number(category?.available_advance || 0);

    // IMPORTANT:
    // While editing, add the current payment back.
    // The category total_due already reflects the existing payment.
    if (state.editingId) {
      totalDue += getEditingPaymentAmount();
    }
  }

  const remainingDue =
    mode === "ADVANCE"
      ? totalDue
      : Math.max(totalDue - amount, 0);

  elements.referenceTotal.textContent = currency(totalDue);
  elements.referencePaid.textContent = currency(availableAdvance);
  elements.referenceDue.textContent = currency(remainingDue);

  if (amount > 0 && mode !== "ADVANCE") {
    elements.outstandingHint.textContent =
      `Maximum payable: ${currency(totalDue)}`;
  } else {
    elements.outstandingHint.textContent = "";
  }
};

  const setType = (type) => {
    const normalizedType = ["CUSTOMER", "SUPPLIER", "EXPENSE"].includes(type)
      ? type
      : "CUSTOMER";

    elements.paymentType.value = normalizedType;
    document.querySelectorAll(".payment-type-option").forEach((button) => {
      button.classList.toggle("active", button.dataset.type === normalizedType);
    });

    elements.customerGroup.hidden = normalizedType !== "CUSTOMER";
    elements.supplierGroup.hidden = normalizedType !== "SUPPLIER";
    elements.expenseCategoryGroup.hidden = normalizedType !== "EXPENSE";
    elements.paidToGroup.hidden = normalizedType !== "EXPENSE";

    const quickButton = document.querySelector(
      '.payment-mode-option[data-mode="QUICK"]',
    );
    if (quickButton) quickButton.hidden = normalizedType !== "EXPENSE";

    if (
      normalizedType === "EXPENSE" &&
      elements.paymentMode.value === "INVOICE"
    ) {
      // Keep Against Bill as default for expenses.
    } else if (
      normalizedType !== "EXPENSE" &&
      elements.paymentMode.value === "QUICK"
    ) {
      setPaymentMode("INVOICE");
      return;
    }

    updatePartyBalance();
  };

  const setPaymentMode = (mode) => {
    const type = elements.paymentType.value;
    let normalizedMode = mode === "ADVANCE" ? "ADVANCE" : "INVOICE";
    if (type === "EXPENSE" && mode === "QUICK") normalizedMode = "QUICK";

    elements.paymentMode.value = normalizedMode;
    document.querySelectorAll(".payment-mode-option").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === normalizedMode);
    });

    updatePartyBalance();
  };

  const resetForm = () => {
    elements.form.reset();
    state.editingId = null;
    elements.paymentType.value = "CUSTOMER";
    elements.paymentMode.value = "INVOICE";
    elements.paymentDate.value = today();
    elements.paymentMethod.value = "";
    elements.amount.value = "";
    elements.expenseCategoryId.value = "";
    elements.paidTo.value = "";

    setType("CUSTOMER");

    setPaymentMode("INVOICE");

    elements.amount.classList.remove("stock-exceeded");
    elements.outstandingHint.textContent = "";
    elements.referenceTotal.textContent = currency(0);
    elements.referencePaid.textContent = currency(0);
    elements.referenceDue.textContent = currency(0);

    if (elements.paymentAllocationInfo) {
      elements.paymentAllocationInfo.hidden = false;

      elements.paymentAllocationInfo.innerHTML = `
        <i class="fa-solid fa-arrows-rotate"></i>

        <div>
          <strong>Automatic FIFO Allocation</strong>

          <span>
            Select a party and enter payment amount.
            The system will automatically apply it
            to old outstanding invoices first.
          </span>
        </div>
      `;
    }

    if (elements.paymentAdvanceInfo) {
      elements.paymentAdvanceInfo.hidden = true;
    }

    document
      .querySelectorAll(".form-error")
      .forEach((error) => (error.textContent = ""));
  };

  const openModal = async (payment = null) => {
    resetForm();

    elements.modal.hidden = false;
    document.body.style.overflow = "hidden";

    if (!payment) {
      elements.paymentModalTitle.textContent = "New Payment";
      elements.paymentModalDescription.textContent =
        "Record a customer receipt or supplier payment.";
      elements.savePayment.querySelector("span").textContent = "Save Payment";
      updatePartyBalance();
      return;
    }

    state.editingId = Number(payment.id);
    setType(payment.payment_type);

    if (payment.payment_type === "CUSTOMER") {
      elements.customerId.value = String(payment.customer_id || "");
    } else if (payment.payment_type === "SUPPLIER") {
      elements.supplierId.value = String(payment.supplier_id || "");
    } else {
      elements.expenseCategoryId.value = String(
        payment.expense_category_id || "",
      );
      elements.paidTo.value = payment.paid_to || "";
    }

    setPaymentMode(payment.payment_mode || "INVOICE");
    elements.paymentDate.value = String(payment.payment_date || "").slice(
      0,
      10,
    );

    elements.amount.value = payment.amount ?? "";
    elements.paymentMethod.value = payment.payment_method || "";
    elements.referenceNo.value = payment.reference_no || "";
    elements.remarks.value = payment.remarks || "";
    elements.paymentModalTitle.textContent = "Edit Payment";
    elements.paymentModalDescription.textContent = "Update the payment record.";
    elements.savePayment.querySelector("span").textContent = "Update Payment";
    updatePartyBalance();
  };

  const closeModal = () => {
    elements.modal.hidden = true;

    document.body.style.overflow = "";

    resetForm();
  };

  const validate = () => {
    document
      .querySelectorAll(".form-error")
      .forEach((error) => (error.textContent = ""));
    elements.amount.classList.remove("stock-exceeded");

    let valid = true;
    const type = elements.paymentType.value;
    const mode = elements.paymentMode.value || "INVOICE";

    if (type === "CUSTOMER" && !elements.customerId.value) {
      qs('[data-error-for="customer"]').textContent = "Customer is required.";
      valid = false;
    }

    if (type === "SUPPLIER" && !elements.supplierId.value) {
      qs('[data-error-for="supplier"]').textContent = "Supplier is required.";
      valid = false;
    }

    if (type === "EXPENSE") {
      if (!elements.expenseCategoryId.value) {
        qs('[data-error-for="expense-category"]').textContent =
          "Expense category is required.";
        valid = false;
      }
      if (!elements.paidTo.value.trim()) {
        qs('[data-error-for="paid-to"]').textContent =
          "Paid To / Vendor is required.";
        valid = false;
      }
    }

    if (!elements.paymentDate.value) {
      qs('[data-error-for="date"]').textContent = "Payment date is required.";
      valid = false;
    }

    const amount = Number(elements.amount.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      qs('[data-error-for="amount"]').textContent = "Enter a valid amount.";
      valid = false;
    }

    if (valid && type !== "EXPENSE" && mode === "INVOICE") {
      const due = getPartyDue() + getEditingPaymentAmount();
      if (amount > due + 0.000001) {
        qs('[data-error-for="amount"]').textContent =
          `Maximum payable amount is ${currency(due)}.`;
        elements.amount.classList.add("stock-exceeded");
        valid = false;
      }
    }

    if (!elements.paymentMethod.value) {
      showToast("Payment method is required.", "error");
      valid = false;
    }

    return valid;
  };

  const save = async (event) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    const isEdit = Boolean(state.editingId);
    const type = elements.paymentType.value;
    const mode = elements.paymentMode.value || "INVOICE";

    const expenseCategoryValue =
      type === "EXPENSE"
        ? String(elements.expenseCategoryId?.value || "").trim()
        : "";

    const expenseCategoryId =
      expenseCategoryValue && /^\d+$/.test(expenseCategoryValue)
        ? Number(expenseCategoryValue)
        : null;

    if (type === "EXPENSE" && !expenseCategoryId) {
      qs('[data-error-for="expense-category"]').textContent =
        "Please select a valid expense category.";

      elements.expenseCategoryId?.focus();

      showToast("Please select a valid expense category.", "error");
      return;
    }

    const body = {
      payment_type: type,
      payment_mode: mode,
      customer_id:
        type === "CUSTOMER" ? Number(elements.customerId.value) : null,
      supplier_id:
        type === "SUPPLIER" ? Number(elements.supplierId.value) : null,
      expense_category_id: type === "EXPENSE" ? expenseCategoryId : null,
      paid_to: type === "EXPENSE" ? elements.paidTo.value.trim() : null,
      expense_bill_id: null,
      payment_date: elements.paymentDate.value,
      amount: Number(elements.amount.value),
      payment_method: elements.paymentMethod.value,
      reference_no: elements.referenceNo.value.trim() || null,
      remarks: elements.remarks.value.trim() || null,
    };

    const button = elements.savePayment;
    button.disabled = true;

    button.querySelector("span").textContent = isEdit
      ? "Updating..."
      : "Saving...";

    try {
      await apiRequest(
        isEdit ? `/api/payments/${state.editingId}` : "/api/payments",
        {
          method: isEdit ? "PUT" : "POST",

          body: JSON.stringify(body),
        },
      );

      closeModal();

      showToast(
        isEdit
          ? "Payment updated successfully."
          : "Payment saved successfully.",
      );

      await Promise.all([loadOptions(), loadPayments()]);
    } catch (error) {
      console.error("[Payments] save error:", error);

      showToast(error.message || "Unable to save payment.", "error");
    } finally {
      button.disabled = false;

      button.querySelector("span").textContent = isEdit
        ? "Update Payment"
        : "Save Payment";
    }
  };

  const view = async (id) => {
    elements.viewModal.hidden = false;

    document.body.style.overflow = "hidden";

    elements.details.innerHTML = `
      <div class="payments-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Loading payment...
      </div>
    `;

    try {
      const payload = await apiRequest(`/api/payments/${id}`);

      const payment = payload.payment;

      const modeLabel =
        payment.payment_mode === "ADVANCE"
          ? "Advance"
          : payment.payment_mode === "QUICK"
            ? "Quick Expense"
            : "Against Due";

      const typeLabel =
        payment.payment_type === "CUSTOMER"
          ? "Customer Receipt"
          : payment.payment_type === "SUPPLIER"
            ? "Supplier Payment"
            : "Expense Payment";

      elements.viewTitle.textContent = payment.payment_no;

      elements.viewSubtitle.textContent =
        payment.party_name || "Payment details";

      /*
       * Allocation information
       */
      const allocations = Array.isArray(payment.allocations)
        ? payment.allocations
        : [];

      const allocationHtml = allocations.length
        ? `
            <div class="payment-allocation-view">

              <div class="allocation-view-header">
                <strong>
                  Payment Allocation
                </strong>

                <span>
                  ${allocations.length}
                  invoice${allocations.length === 1 ? "" : "s"}
                </span>
              </div>

              <div class="allocation-list">

                ${allocations
                  .map(
                    (allocation) => `
                      <div class="allocation-row">

                        <span>
                          ${escapeHtml(
                            allocation.document_no ||
                              allocation.sale_document_no ||
                              allocation.purchase_document_no ||
                              "Invoice",
                          )}
                        </span>

                        <strong>
                          ${currency(allocation.allocated_amount)}
                        </strong>

                      </div>
                    `,
                  )
                  .join("")}

              </div>

            </div>
          `
        : "";

      elements.details.innerHTML = `
        <div class="details-grid">

          <div class="detail-box">
            <span>Type</span>
            <strong>
              ${escapeHtml(typeLabel)}
            </strong>
          </div>

          <div class="detail-box">
            <span>Payment Mode</span>
            <strong>
              ${escapeHtml(modeLabel)}
            </strong>
          </div>

          <div class="detail-box">
            <span>Party</span>
            <strong>
              ${escapeHtml(payment.party_name || "—")}
            </strong>
          </div>

          <div class="detail-box">
            <span>Invoice</span>
            <strong>
              ${
                payment.document_no
                  ? escapeHtml(payment.document_no)
                  : payment.payment_mode === "ADVANCE"
                    ? "Advance"
                    : "Auto FIFO"
              }
            </strong>
          </div>

          <div class="detail-box">
            <span>Date</span>
            <strong>
              ${escapeHtml(formatDate(payment.payment_date))}
            </strong>
          </div>

          <div class="detail-box">
            <span>Method</span>
            <strong>
              ${escapeHtml(payment.payment_method || "—")}
            </strong>
          </div>

          <div class="detail-box">
            <span>Reference</span>
            <strong>
              ${escapeHtml(payment.reference_no || "—")}
            </strong>
          </div>

          <div class="detail-box">
            <span>Amount</span>
            <strong>
              ${currency(payment.amount)}
            </strong>
          </div>

        </div>

        ${allocationHtml}

        ${
          payment.remarks
            ? `
              <div class="payment-remarks">
                <span>Remarks</span>
                <p>
                  ${escapeHtml(payment.remarks)}
                </p>
              </div>
            `
            : ""
        }
      `;
    } catch (error) {
      elements.details.innerHTML = `
        <div class="payments-loading payments-error">
          ${escapeHtml(error.message)}
        </div>
      `;
    }
  };

  const closeView = () => {
    elements.viewModal.hidden = true;
    document.body.style.overflow = "";
  };

  const openDeleteModal = (id) => {
    const payment = state.payments.find((x) => Number(x.id) === Number(id));

    if (!payment) {
      showToast("Payment not found.", "error");
      return;
    }

    state.deletingId = Number(id);

    elements.deleteMessage.textContent = `Delete ${payment.payment_no}? Payment allocations and affected invoice statuses will be recalculated.`;
    elements.confirmDeleteButton.disabled = false;
    elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-trash-can"></i>
      Delete
    `;

    elements.deleteModal.hidden = false;
    elements.deleteModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      elements.cancelDeleteButton?.focus();
    });
  };

  const closeDeleteModal = () => {
    elements.deleteModal.hidden = true;
    elements.deleteModal.setAttribute("aria-hidden", "true");
    state.deletingId = null;
    document.body.style.overflow = "";
  };

  const confirmDeletePayment = async () => {
    const id = state.deletingId;

    if (!id) {
      closeDeleteModal();
      return;
    }

    const payment = state.payments.find((x) => Number(x.id) === Number(id));

    if (!payment) {
      closeDeleteModal();
      showToast("Payment not found.", "error");
      return;
    }

    try {
      elements.confirmDeleteButton.disabled = true;
      elements.confirmDeleteButton.innerHTML = `
          <i class="fa-solid fa-spinner fa-spin"></i>
          Deleting...
        `;

      await apiRequest(`/api/payments/${id}`, {
        method: "DELETE",
      });

      closeDeleteModal();
      showToast("Payment deleted successfully.");
      await Promise.all([loadOptions(), loadPayments()]);
    } catch (error) {
      console.error("[Payments] delete error:", error);

      elements.confirmDeleteButton.disabled = false;

      elements.confirmDeleteButton.innerHTML = `
          <i class="fa-solid fa-trash-can"></i>
          Delete
        `;

      showToast(error.message || "Unable to delete payment.", "error");
    }
  };

  const actions = (event) => {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const id = Number(button.dataset.id);
    const payment = state.payments.find((x) => Number(x.id) === id);

    if (!payment) {
      return;
    }
    const action = button.dataset.action;

    if (action === "view") {
      view(id);
    } else if (action === "edit") {
      openModal(payment);
    } else if (action === "delete") {
      openDeleteModal(id);
    }
  };

  const cache = () => {
    elements.add = qs("#addPaymentButton");
    elements.emptyAdd = qs("#emptyAddPayment");
    elements.totalPayments = qs("#totalPayments");
    elements.receivedAmount = qs("#receivedAmount");
    elements.supplierPaidAmount = qs("#supplierPaidAmount");
    elements.outstandingAmount = qs("#outstandingAmount");
    elements.search = qs("#paymentSearch");
    elements.typeFilter = qs("#paymentTypeFilter");
    elements.methodFilter = qs("#paymentMethodFilter");
    elements.dateFilter = qs("#paymentDateFilter");
    elements.reset = qs("#resetPaymentFilters");
    elements.tableBody = qs("#paymentsTableBody");
    elements.empty = qs("#paymentsEmpty");
    elements.count = qs("#paymentsCount");
    elements.previousPage = qs("#previousPaymentPage");
    elements.nextPage = qs("#nextPaymentPage");
    elements.pageNumber = qs("#paymentPageNumber");
    elements.modal = qs("#paymentModal");
    elements.closeModal = qs("#closePaymentModal");
    elements.cancel = qs("#cancelPayment");
    elements.form = qs("#paymentForm");
    elements.paymentModalTitle = qs("#paymentModalTitle");
    elements.paymentModalDescription = qs("#paymentModalDescription");
    elements.paymentType = qs("#paymentType");
    elements.customerGroup = qs("#customerGroup");
    elements.supplierGroup = qs("#supplierGroup");
    elements.customerId = qs("#customerId");
    elements.supplierId = qs("#supplierId");
    elements.expenseCategoryGroup = qs("#expenseCategoryGroup");
    elements.paidToGroup = qs("#paidToGroup");
    elements.expenseBillGroup = qs("#expenseBillGroup");
    elements.expenseCategoryId = qs("#expenseCategoryId");
    elements.paidTo = qs("#paidTo");
    elements.expenseBillId = qs("#expenseBillId");
    elements.expensePaymentInfo = qs("#expensePaymentInfo");
    elements.paymentMode = qs("#paymentMode");
    elements.paymentDate = qs("#paymentDate");
    elements.amount = qs("#amount");
    elements.paymentMethod = qs("#paymentMethod");
    elements.referenceNo = qs("#referenceNo");
    elements.remarks = qs("#remarks");
    elements.outstandingHint = qs("#outstandingHint");
    elements.referenceTotal = qs("#referenceTotal");
    elements.referencePaid = qs("#referencePaid");
    elements.referenceDue = qs("#referenceDue");
    elements.paymentAllocationInfo = qs("#paymentAllocationInfo");
    elements.paymentAdvanceInfo = qs("#paymentAdvanceInfo");
    elements.paymentFormNote = qs("#paymentFormNote");
    elements.savePayment = qs("#savePayment");
    elements.viewModal = qs("#viewPaymentModal");
    elements.closeViewButton = qs("#closeViewPaymentModal");
    elements.closeView = qs("#closeViewPayment");
    elements.viewTitle = qs("#viewPaymentTitle");
    elements.viewSubtitle = qs("#viewPaymentSubtitle");
    elements.details = qs("#paymentDetailsContent");
    elements.deleteModal = qs("#deleteModal");
    elements.deleteMessage = qs("#deleteMessage");
    elements.cancelDeleteButton = qs("#cancelDeleteButton");
    elements.confirmDeleteButton = qs("#confirmDeleteButton");
  };

  const bind = () => {
    elements.add.onclick = () => openModal();
    elements.emptyAdd.onclick = () => openModal();
    elements.closeModal.onclick = closeModal;
    elements.cancel.onclick = closeModal;
    elements.form.onsubmit = save;

    document.querySelectorAll(".payment-type-option").forEach((button) => {
      button.onclick = () => setType(button.dataset.type);
    });

    document.querySelectorAll(".payment-mode-option").forEach((button) => {
      button.onclick = () => setPaymentMode(button.dataset.mode);
    });

    elements.customerId.onchange = updatePartyBalance;
    elements.supplierId.onchange = updatePartyBalance;
    elements.expenseCategoryId.onchange = updatePartyBalance;

    elements.amount.oninput = () => {
      updatePartyBalance();
      const mode = elements.paymentMode.value;

      if (mode !== "INVOICE") {
        elements.amount.classList.remove("stock-exceeded");
        return;
      }
      const due = getPartyDue() + getEditingPaymentAmount();
      const amount = Number(elements.amount.value || 0);
      elements.amount.classList.toggle("stock-exceeded", amount > due);
    };

    elements.search.oninput = applyFilters;
    elements.typeFilter.onchange = applyFilters;
    elements.methodFilter.onchange = applyFilters;
    elements.dateFilter.onchange = applyFilters;

    elements.reset.onclick = () => {
      elements.search.value = "";
      elements.typeFilter.value = "";
      elements.methodFilter.value = "";
      elements.dateFilter.value = "";
      applyFilters();
    };

    elements.previousPage.onclick = () => {
      if (state.page > 1) {
        state.page--;
        render();
      }
    };

    elements.nextPage.onclick = () => {
      const pages = Math.max(
        1,
        Math.ceil(state.filtered.length / state.pageSize),
      );

      if (state.page < pages) {
        state.page++;
        render();
      }
    };

    elements.tableBody.onclick = actions;
    elements.closeViewButton.onclick = closeView;
    elements.closeView.onclick = closeView;
    elements.viewModal.onclick = (event) => {
      if (event.target === elements.viewModal) {
        closeView();
      }
    };

    elements.cancelDeleteButton.onclick = closeDeleteModal;
    elements.confirmDeleteButton.onclick = confirmDeletePayment;
    elements.deleteModal.onclick = (event) => {
      if (event.target === elements.deleteModal) {
        closeDeleteModal();
      }
    };
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      if (elements.deleteModal && !elements.deleteModal.hidden) {
        closeDeleteModal();
        return;
      }
      if (elements.modal && !elements.modal.hidden) {
        closeModal();
        return;
      }
      if (elements.viewModal && !elements.viewModal.hidden) {
        closeView();
      }
    });
  };
  const init = async () => {
    cache();
    bind();
    try {
      await loadOptions();
      await loadPayments();
    } catch (error) {
      console.error("[Payments] init error:", error);
      showToast(error.message || "Unable to load payments.", "error");
    }
  };

  return { init };
})();

const initPaymentsPage = () => PaymentsPage.init();
