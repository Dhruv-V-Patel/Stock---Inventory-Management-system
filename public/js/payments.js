const PaymentsPage = (() => {
  const state = {
    payments: [],
    filtered: [],
    customers: [],
    suppliers: [],
    sales: [],
    purchases: [],
    page: 1,
    pageSize: 30,
    editingId: null,
    deletingId: null,
    referenceDocs: [],
  };
  const elements = {};
  const qs = (s) => document.querySelector(s);
  const escapeHtml = (v) =>
    String(v ?? "")
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
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
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
    } catch {}
    if (!response.ok)
      throw new Error(
        payload?.message ||
          payload?.error ||
          `Request failed with status ${response.status}.`,
      );
    return payload;
  };
  const currency = (v) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(v || 0));
  const number = (v) =>
    Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const date = (v) => {
    if (!v) return "-";
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? String(v)
      : new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(d);
  };
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  const normalize = (p) => ({
    ...p,
    id: Number(p.id),
    amount: Number(p.amount || 0),
    payment_type: p.payment_type || "",
    payment_date: p.payment_date || "",
    payment_no: p.payment_no || "",
    party_name: p.party_name || "",
    party_mobile: p.party_mobile || "",
    document_no: p.document_no || "",
    payment_method: p.payment_method || "",
    total_amount: Number(p.total_amount || 0),
    paid_before: Number(p.paid_before || 0),
    outstanding: Number(p.outstanding || 0),
  });
  const loadOptions = async () => {
    const p = await apiRequest("/api/payments/options");
    state.customers = p.customers || [];
    state.suppliers = p.suppliers || [];
    state.sales = p.sales || [];
    state.purchases = p.purchases || [];
    elements.customerId.innerHTML = `<option value="">Select Customer</option>${state.customers.map((x) => `<option value="${x.id}">${escapeHtml(x.name)}${x.mobile ? ` — ${escapeHtml(x.mobile)}` : ""}</option>`).join("")}`;
    elements.supplierId.innerHTML = `<option value="">Select Supplier</option>${state.suppliers.map((x) => `<option value="${x.id}">${escapeHtml(x.name)}${x.mobile ? ` — ${escapeHtml(x.mobile)}` : ""}</option>`).join("")}`;
    updateDocuments();
  };
  const updateSummary = () => {
    elements.totalPayments.textContent =
      state.payments.length.toLocaleString("en-IN");
    elements.receivedAmount.textContent = currency(
      state.payments
        .filter((x) => x.payment_type === "CUSTOMER")
        .reduce((a, x) => a + x.amount, 0),
    );
    elements.supplierPaidAmount.textContent = currency(
      state.payments
        .filter((x) => x.payment_type === "SUPPLIER")
        .reduce((a, x) => a + x.amount, 0),
    );
    const due = [...state.sales, ...state.purchases].reduce(
      (a, x) => a + Number(x.outstanding || 0),
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
        (p) =>
          `<tr> 
          <td>
          <span class="payment-number">${escapeHtml(p.payment_no)}</span>
          </td>
          <td>
          <span class="type-badge ${p.payment_type.toLowerCase()}">
          ${p.payment_type === "CUSTOMER" ? "Customer Receipt" : "Supplier Payment"}
          </span>
          </td>
          <td>
          <div class="party-cell">
          <strong>${escapeHtml(p.party_name || "—")}</strong>
          ${p.party_mobile ? `<small>${escapeHtml(p.party_mobile)}</small>` : ""}
          </div>
          </td>
          <td>
          ${escapeHtml(p.document_no || "—")}
          </td>
          <td>
          ${escapeHtml(date(p.payment_date))}
          </td>
          <td>
          <span class="payment-amount">${currency(p.amount)}</span>
          </td>
          <td>
          <span class="method-badge">${escapeHtml(p.payment_method || "—")}</span>
          </td>
          <td class="action-column">
          <div class="payment-actions">
          <button class="table-action" data-action="view" data-id="${p.id}" title="View">
          <i class="fa-solid fa-eye"></i>
          </button>
          <button class="table-action" data-action="edit" data-id="${p.id}" title="Edit">
          <i class="fa-solid fa-pen"></i>
          </button>
          <button class="table-action danger" data-action="delete" data-id="${p.id}" title="Delete">
          <i class="fa-solid fa-trash"></i>
          </button>
          </div>
          </td>
          </tr>`,
      )
      .join("");
    elements.count.textContent = `Showing ${start + 1}-${Math.min(start + pageRows.length, rows.length)} of ${rows.length} payments`;
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
    const q = elements.search.value.trim().toLowerCase(),
      type = elements.typeFilter.value,
      method = elements.methodFilter.value,
      d = elements.dateFilter.value;
    state.filtered = state.payments.filter((p) => {
      const hay = [
        p.payment_no,
        p.party_name,
        p.party_mobile,
        p.document_no,
        p.reference_no,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!q || hay.includes(q)) &&
        (!type || p.payment_type === type) &&
        (!method || p.payment_method === method) &&
        (!d || String(p.payment_date).slice(0, 10) === d)
      );
    });
    state.page = 1;
    render();
  };
  const loadPayments = async () => {
    elements.tableBody.innerHTML = `<tr><td colspan="8"><div class="payments-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading payments...</div></td></tr>`;
    try {
      const p = await apiRequest("/api/payments");
      state.payments = (p.payments || p.data || []).map(normalize);
      updateSummary();
      applyFilters();
    } catch (e) {
      elements.tableBody.innerHTML = `<tr><td colspan="8"><div class="payments-loading payments-error"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(e.message)}</div></td></tr>`;
    }
  };
  const resetForm = () => {
    elements.form.reset();
    elements.paymentType.value = "CUSTOMER";
    elements.paymentDate.value = today();
    elements.paymentMethod.value = "";
    elements.referenceDocument.innerHTML = `<option value="">Select Invoice</option>`;
    state.editingId = null;
    state.referenceDocs = [];
    setType("CUSTOMER");
    elements.amount.classList.remove("stock-exceeded");
    elements.outstandingHint.textContent = "";
    elements.referenceTotal.textContent = currency(0);
    elements.referencePaid.textContent = currency(0);
    elements.referenceDue.textContent = currency(0);
    document
      .querySelectorAll(".form-error")
      .forEach((x) => (x.textContent = ""));
  };
  const setType = (type) => {
    elements.paymentType.value = type;
    document
      .querySelectorAll(".payment-type-option")
      .forEach((b) => b.classList.toggle("active", b.dataset.type === type));
    elements.customerGroup.hidden = type !== "CUSTOMER";
    elements.supplierGroup.hidden = type !== "SUPPLIER";
    updateDocuments();
  };
  const updateDocuments = () => {
    const type = elements.paymentType.value;
    const partyId = Number(
      type === "CUSTOMER"
        ? elements.customerId.value
        : elements.supplierId.value,
    );
    state.referenceDocs =
      type === "CUSTOMER"
        ? state.sales.filter(
            (x) =>
              Number(x.customer_id) === partyId && Number(x.outstanding) > 0,
          )
        : state.purchases.filter(
            (x) =>
              Number(x.supplier_id) === partyId && Number(x.outstanding) > 0,
          );
    elements.referenceDocument.innerHTML = `<option value="">Select Invoice</option>${state.referenceDocs.map((x) => `<option value="${x.id}">${escapeHtml(x.document_no)} — Due ${currency(x.outstanding)}</option>`).join("")}`;
    updateReferenceBalance();
  };
  const selectedDoc = () =>
    state.referenceDocs.find(
      (x) => Number(x.id) === Number(elements.referenceDocument.value),
    );
  const updateReferenceBalance = () => {
    const doc = selectedDoc();
    const paidBefore = doc?.paid_before || 0;
    const due = doc?.outstanding || 0;
    elements.referenceTotal.textContent = currency(doc?.total_amount || 0);
    elements.referencePaid.textContent = currency(paidBefore);
    elements.referenceDue.textContent = currency(due);
    elements.outstandingHint.textContent = doc
      ? `Maximum payable: ${currency(due)}`
      : "";
  };
  const openModal = async (payment = null) => {
    resetForm();
    elements.modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (payment) {
      state.editingId = payment.id;
      setType(payment.payment_type);
      if (payment.payment_type === "CUSTOMER")
        elements.customerId.value = String(payment.customer_id);
      else elements.supplierId.value = String(payment.supplier_id);
      updateDocuments();
      elements.referenceDocument.value = String(
        payment.sale_id || payment.purchase_id || "",
      );
      elements.paymentDate.value = String(payment.payment_date).slice(0, 10);
      elements.amount.value = payment.amount;
      elements.paymentMethod.value = payment.payment_method || "";
      elements.referenceNo.value = payment.reference_no || "";
      elements.remarks.value = payment.remarks || "";
      elements.paymentModalTitle.textContent = "Edit Payment";
      elements.paymentModalDescription.textContent =
        "Update the payment record.";
      elements.savePayment.querySelector("span").textContent = "Update Payment";
      updateReferenceBalance();
    } else {
      elements.paymentModalTitle.textContent = "New Payment";
      elements.paymentModalDescription.textContent =
        "Record a customer receipt or supplier payment.";
      elements.savePayment.querySelector("span").textContent = "Save Payment";
    }
  };
  const closeModal = () => {
    elements.modal.hidden = true;
    document.body.style.overflow = "";
    resetForm();
  };
  const validate = () => {
    document
      .querySelectorAll(".form-error")
      .forEach((x) => (x.textContent = ""));
    let ok = true;
    const type = elements.paymentType.value;
    if (type === "CUSTOMER" && !elements.customerId.value) {
      qs('[data-error-for="customer"]').textContent = "Customer is required.";
      ok = false;
    }
    if (type === "SUPPLIER" && !elements.supplierId.value) {
      qs('[data-error-for="supplier"]').textContent = "Supplier is required.";
      ok = false;
    }
    if (!elements.referenceDocument.value) {
      qs('[data-error-for="document"]').textContent = "Invoice is required.";
      ok = false;
    }
    if (!elements.paymentDate.value) {
      qs('[data-error-for="date"]').textContent = "Payment date is required.";
      ok = false;
    }
    const amount = Number(elements.amount.value);
    const due =
      Number(selectedDoc()?.outstanding || 0) +
      (state.editingId
        ? Number(
            state.payments.find((p) => p.id === state.editingId)?.amount || 0,
          )
        : 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      qs('[data-error-for="amount"]').textContent = "Enter a valid amount.";
      ok = false;
    } else if (amount > due + 0.000001) {
      qs('[data-error-for="amount"]').textContent =
        `Maximum payable amount is ${currency(due)}.`;
      elements.amount.classList.add("stock-exceeded");
      ok = false;
    } else elements.amount.classList.remove("stock-exceeded");
    if (!elements.paymentMethod.value) {
      showToast("Payment method is required.", "error");
      ok = false;
    }
    return ok;
  };
  const save = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const isEdit = Boolean(state.editingId);
    const type = elements.paymentType.value;
    const body = {
      payment_type: type,
      customer_id:
        type === "CUSTOMER" ? Number(elements.customerId.value) : null,
      supplier_id:
        type === "SUPPLIER" ? Number(elements.supplierId.value) : null,
      sale_id:
        type === "CUSTOMER" ? Number(elements.referenceDocument.value) : null,
      purchase_id:
        type === "SUPPLIER" ? Number(elements.referenceDocument.value) : null,
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
      const p = await apiRequest(
        isEdit ? `/api/payments/${state.editingId}` : "/api/payments",
        { method: isEdit ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      closeModal();
      showToast("Payment saved successfully.");
      await Promise.all([loadOptions(), loadPayments()]);
    } catch (err) {
      showToast(err.message, "error");
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
    elements.details.innerHTML = `<div class="payments-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading payment...</div>`;
    try {
      const p = await apiRequest(`/api/payments/${id}`),
        x = p.payment;
      elements.viewTitle.textContent = x.payment_no;
      elements.viewSubtitle.textContent = x.party_name || "Payment details";
      elements.details.innerHTML = `<div class="details-grid">
      <div class="detail-box">
      <span>Type</span>
      <strong>${x.payment_type === "CUSTOMER" ? "Customer Receipt" : "Supplier Payment"}</strong>
      </div>
      <div class="detail-box">
      <span>Party</span>
      <strong>${escapeHtml(x.party_name)}</strong>
      </div>
      <div class="detail-box">
      <span>Invoice</span>
      <strong>${escapeHtml(x.document_no || "—")}</strong>
      </div>
      <div class="detail-box">
      <span>Date</span>
      <strong>${escapeHtml(date(x.payment_date))}</strong>
      </div>
      <div class="detail-box">
      <span>Method</span>
      <strong>${escapeHtml(x.payment_method || "—")}</strong>
      </div>
      <div class="detail-box">
      <span>Reference</span>
      <strong>${escapeHtml(x.reference_no || "—")}</strong>
      </div>
      </div>
      <div class="payment-detail-total">
      <span>Amount</span>
      <strong>${currency(x.amount)}</strong>
      </div>
      ${x.remarks ? `<div class="payment-remarks"><span>Remarks</span><p>${escapeHtml(x.remarks)}</p></div>` : ""}`;
    } catch (err) {
      elements.details.innerHTML = `<div class="payments-loading payments-error">${escapeHtml(err.message)}</div>`;
    }
  };

  const closeView = () => {
    elements.viewModal.hidden = true;
    document.body.style.overflow = "";
  };

  // const remove = async (id) => {
  //   const p = state.payments.find((x) => x.id === id);
  //   if (!p) return;
  //   if (
  //     !confirm(
  //       `Delete ${p.payment_no}?\n\nThe linked invoice payment status will be recalculated.`,
  //     )
  //   )
  //     return;
  //   try {
  //     const r = await apiRequest(`/api/payments/${id}`, { method: "DELETE" });
  //     showToast("Payment deleted successfully");
  //     await Promise.all([loadOptions(), loadPayments()]);
  //   } catch (e) {
  //     showToast(e.message, "error");
  //   }
  // };
  
  const openDeleteModal = (id) => {
  const payment = state.payments.find(
    (x) => Number(x.id) === Number(id),
  );

  if (!payment) {
    showToast("Payment not found.", "error");
    return;
  }

  state.deletingId = Number(id);

  elements.deleteMessage.textContent =
    `Delete ${payment.payment_no}? The linked invoice payment status will be recalculated.`;

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

  const payment = state.payments.find(
    (x) => Number(x.id) === Number(id),
  );

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

    await Promise.all([
      loadOptions(),
      loadPayments(),
    ]);
  } catch (error) {
    console.error("[Payments] delete error:", error);

    elements.confirmDeleteButton.disabled = false;

    elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-trash-can"></i>
      Delete
    `;

    showToast(
      error.message || "Unable to delete payment.",
      "error",
    );
  }
};

  const actions = (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const id = Number(b.dataset.id);
    const p = state.payments.find((x) => x.id === id);
    if (!p) return;
    if (b.dataset.action === "view") view(id);
    else if (b.dataset.action === "edit") openModal(p);
    else if (b.dataset.action === "delete") openDeleteModal(id);
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
    elements.referenceDocument = qs("#referenceDocument");
    elements.paymentDate = qs("#paymentDate");
    elements.amount = qs("#amount");
    elements.paymentMethod = qs("#paymentMethod");
    elements.referenceNo = qs("#referenceNo");
    elements.remarks = qs("#remarks");
    elements.outstandingHint = qs("#outstandingHint");
    elements.referenceTotal = qs("#referenceTotal");
    elements.referencePaid = qs("#referencePaid");
    elements.referenceDue = qs("#referenceDue");
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
    // elements.modal.onclick = (e) => {
    //   if (e.target === elements.modal) closeModal();
    // };
    elements.form.onsubmit = save;
    document
      .querySelectorAll(".payment-type-option")
      .forEach((b) => (b.onclick = () => setType(b.dataset.type)));
    elements.customerId.onchange = updateDocuments;
    elements.supplierId.onchange = updateDocuments;
    elements.referenceDocument.onchange = updateReferenceBalance;
    elements.amount.oninput = () => {
      const due =
        Number(selectedDoc()?.outstanding || 0) +
        (state.editingId
          ? Number(
              state.payments.find((p) => p.id === state.editingId)?.amount || 0,
            )
          : 0);
      elements.amount.classList.toggle(
        "stock-exceeded",
        Number(elements.amount.value) > due,
      );
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
    elements.viewModal.onclick = (e) => {
      if (e.target === elements.viewModal) closeView();
    };

    elements.cancelDeleteButton.onclick = closeDeleteModal;

elements.confirmDeleteButton.onclick =
  confirmDeletePayment;

elements.deleteModal.onclick = (e) => {
  if (e.target === elements.deleteModal) {
    closeDeleteModal();
  }
};

   document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  if (
    elements.deleteModal &&
    !elements.deleteModal.hidden
  ) {
    closeDeleteModal();
    return;
  }

  if (!elements.modal.hidden) {
    closeModal();
    return;
  }

  if (!elements.viewModal.hidden) {
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
    } catch (e) {
      showToast(e.message, "error");
    }
  };
  return { init };
})();
const initPaymentsPage = () => PaymentsPage.init();
