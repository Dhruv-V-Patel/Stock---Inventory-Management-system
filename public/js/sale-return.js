(() => {
  "use strict";

  const API_BASE = "/api/sales-returns";
  const PAGE_SIZE = 10;

  const state = {
    returns: [],
    customers: [],
    sales: [],
    saleItems: [],
    page: 1,
    editingId: null,
    deletingId: null,
    loading: false,
  };

  const $ = (selector) => document.querySelector(selector);

  const elements = {
    totalReturns: $("#totalReturns"),
    monthReturns: $("#monthReturns"),
    returnedQuantity: $("#returnedQuantity"),
    totalReturnValue: $("#totalReturnValue"),

    tableBody: $("#returnsTableBody"),
    empty: $("#returnsEmpty"),
    count: $("#returnsCount"),
    pageNumber: $("#pageNumber"),
    previousPage: $("#previousPage"),
    nextPage: $("#nextPage"),

    search: $("#returnSearch"),
    customerFilter: $("#customerFilter"),
    dateFilter: $("#returnDateFilter"),
    resetFilters: $("#resetFilters"),

    addButton: $("#addSaleReturnButton"),
    emptyAdd: $("#emptyAddReturn"),

    modal: $("#saleReturnModal"),
    modalTitle: $("#saleReturnModalTitle"),
    closeModal: $("#closeSaleReturnModal"),
    cancel: $("#cancelSaleReturn"),
    form: $("#saleReturnForm"),

    customer: $("#customerId"),
    sale: $("#saleId"),
    returnDate: $("#returnDate"),
    reason: $("#overallReason"),
    remarks: $("#remarks"),
    itemsBody: $("#returnItemsBody"),
    itemsError: $("#itemsError"),
    total: $("#grandTotal"),
    saveButton: $("#saveSaleReturn"),

    viewModal: $("#viewSaleReturnModal"),
    closeView: $("#closeViewSaleReturn"),
    closeViewButton: $("#closeViewSaleReturnButton"),
    viewTitle: $("#viewReturnTitle"),
    viewSubtitle: $("#viewReturnSubtitle"),
    details: $("#saleReturnDetails"),

    deleteModal: $("#deleteModal"),
    deleteMessage: $("#deleteMessage"),
    cancelDelete: $("#cancelDeleteButton"),
    confirmDelete: $("#confirmDeleteButton"),

    toastContainer: $("#toastContainer"),
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const money = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number(value));

  const quantity = (value) =>
    new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 3,
    }).format(number(value));

  const dateOnly = (value) => {
    if (!value) return "-";
    const raw = String(value).slice(0, 10);
    const [year, month, day] = raw.split("-");
    return year && month && day ? `${day}-${month}-${year}` : raw;
  };

  const today = () => new Date().toISOString().slice(0, 10);

  const showToast = (message, type = "success") => {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const icon =
      type === "error"
        ? "fa-circle-exclamation"
        : type === "warning"
          ? "fa-triangle-exclamation"
          : "fa-circle-check";

    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-close" type="button" aria-label="Close">&times;</button>
    `;

    toast.querySelector(".toast-close")?.addEventListener("click", () => toast.remove());

    elements.toastContainer.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    window.setTimeout(() => {
      toast.classList.remove("show");
      window.setTimeout(() => toast.remove(), 250);
    }, 3500);
  };

  const apiRequest = async (url, options = {}) => {
    const token = localStorage.getItem("accessToken");

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload?.message
          ? payload.message
          : "Request failed.";
      throw new Error(message);
    }

    return payload;
  };

  const setBodyOverflow = (locked) => {
    document.body.style.overflow = locked ? "hidden" : "";
  };

  const openModal = () => {
    elements.modal.hidden = false;
    setBodyOverflow(true);
  };

  const closeModal = () => {
    elements.modal.hidden = true;
    setBodyOverflow(false);
    state.editingId = null;
  };

  const openViewModal = () => {
    elements.viewModal.hidden = false;
    setBodyOverflow(true);
  };

  const closeViewModal = () => {
    elements.viewModal.hidden = true;
    setBodyOverflow(false);
  };

  const openDeleteModal = (id) => {
    const record = state.returns.find((item) => Number(item.id) === Number(id));
    if (!record) return;

    state.deletingId = Number(id);
    elements.deleteMessage.textContent =
      `Delete ${record.return_no}? This will remove the sales return and reverse its related finished-stock movement.`;
    elements.deleteModal.hidden = false;
    setBodyOverflow(true);
  };

  const closeDeleteModal = () => {
    elements.deleteModal.hidden = true;
    state.deletingId = null;
    setBodyOverflow(false);
  };

  const fillCustomerOptions = () => {
    const currentFilter = elements.customerFilter.value;
    const currentCustomer = elements.customer.value;

    const options = state.customers
      .map((customer) => `
        <option value="${escapeHtml(customer.id)}">
          ${escapeHtml(customer.name)}
        </option>
      `)
      .join("");

    elements.customerFilter.innerHTML =
      `<option value="">All Customers</option>${options}`;

    elements.customer.innerHTML =
      `<option value="">Select Customer</option>${options}`;

    if ([...elements.customerFilter.options].some((o) => o.value === currentFilter)) {
      elements.customerFilter.value = currentFilter;
    }

    if ([...elements.customer.options].some((o) => o.value === currentCustomer)) {
      elements.customer.value = currentCustomer;
    }
  };

  const resetSaleSelect = () => {
    elements.sale.innerHTML = `<option value="">Select Sale</option>`;
    elements.sale.disabled = true;
  };

  const fillSaleOptions = (sales) => {
    elements.sale.innerHTML =
      `<option value="">Select Sale</option>` +
      sales.map((sale) => `
        <option value="${escapeHtml(sale.id)}">
          ${escapeHtml(sale.sale_no)} — ${escapeHtml(dateOnly(sale.sale_date))} — ${escapeHtml(money(sale.total_amount))}
        </option>
      `).join("");

    elements.sale.disabled = sales.length === 0;
  };

  const loadOptions = async () => {
    const data = await apiRequest(`${API_BASE}/options`);

    state.customers = Array.isArray(data.customers)
      ? data.customers
      : [];

    fillCustomerOptions();
  };

  const loadSalesForCustomer = async (customerId, selectedSaleId = null) => {
    resetSaleSelect();

    if (!customerId) return;

    const data = await apiRequest(
      `${API_BASE}/sales?customer_id=${encodeURIComponent(customerId)}`
    );

    state.sales = Array.isArray(data.sales)
      ? data.sales
      : [];

    fillSaleOptions(state.sales);

    if (selectedSaleId != null) {
      elements.sale.value = String(selectedSaleId);
    }
  };

  const renderItemsPlaceholder = (message) => {
    elements.itemsBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="return-table-placeholder">${escapeHtml(message)}</div>
        </td>
      </tr>
    `;
    updateTotal();
  };

  // const renderSaleItems = (items = []) => {

  //    state.saleItems = items.map((item) => {
  //   const sold = number(item.quantity ?? item.sold_quantity);
  //   const returned = number(item.returned_quantity);

  //   const available = Math.max(
  //     0,
  //     number(
  //       item.available_quantity ??
  //       (sold - returned)
  //     )
  //   );

  //   const existingReturnQuantity =
  //     item.returnQuantity !== undefined
  //       ? number(item.returnQuantity)
  //       : number(item.return_quantity);

  //   return {
  //     ...item,
  //     sold,
  //     returned,
  //     available,
  //     returnQuantity: Math.min(
  //       Math.max(0, existingReturnQuantity),
  //       available
  //     ),
  //   };
  // });

  //   if (!state.saleItems.length) {
  //     renderItemsPlaceholder("This sale has no returnable items.");
  //     return;
  //   }

  //   elements.itemsBody.innerHTML = state.saleItems.map((item, index) => {
  //     const available = Math.max(0, item.available);
  //     const returnQuantity = Math.min(
  //       Math.max(0, number(item.returnQuantity)),
  //       available
  //     );

  //     state.saleItems[index].returnQuantity = returnQuantity;

  //     return `
  //       <tr data-index="${index}">
  //         <td>
  //           <div class="product-name">${escapeHtml(item.product_name ?? item.name)}</div>
  //           <div class="product-code">${escapeHtml(item.product_code ?? item.code ?? "")}</div>
  //         </td>
  //         <td>${quantity(item.sold)}</td>
  //         <td>${quantity(item.returned)}</td>
  //         <td class="stock-value">${quantity(available)}</td>
  //         <td>
  //           <input
  //             class="return-qty-input"
  //             data-field="quantity"
  //             data-index="${index}"
  //             type="number"
  //             min="0"
  //             max="${escapeHtml(available)}"
  //             step="0.001"
  //             value="${escapeHtml(returnQuantity)}"
  //             ${available <= 0 ? "disabled" : ""}
  //             aria-label="Return quantity">
  //         </td>
  //         <td>${escapeHtml(item.unit ?? "PCS")}</td>
  //         <td>${money(item.rate)}</td>
  //         <td class="item-amount">${money(returnQuantity * number(item.rate))}</td>
  //       </tr>
  //     `;
  //   }).join("");

  //   updateTotal();
  // };

  const renderSaleItems = (items = []) => {
  state.saleItems = items.map((item) => {
    const sold = number(item.quantity ?? item.sold_quantity);
    const returned = number(item.returned_quantity);

    const available = Math.max(
      0,
      number(
        item.available_quantity ??
          (sold - returned)
      )
    );

    const existingReturnQuantity =
      item.returnQuantity !== undefined
        ? number(item.returnQuantity)
        : number(item.return_quantity);

    return {
      ...item,
      sold,
      returned,
      available,
      returnQuantity: Math.min(
        Math.max(0, existingReturnQuantity),
        available
      ),
      reason: item.reason ?? "",
    };
  });

  if (!state.saleItems.length) {
    renderItemsPlaceholder("This sale has no returnable items.");
    return;
  }

  const reasons = [
    "Damaged",
    "Wrong Material",
    "Quality Issue",
    "Excess Material",
    "Expired",
    "Short/Incorrect Supply",
    "Other",
  ];

  elements.itemsBody.innerHTML = state.saleItems.map((item, index) => {
    const available = Math.max(0, item.available);

    const returnQuantity = Math.min(
      Math.max(0, number(item.returnQuantity)),
      available
    );

    state.saleItems[index].returnQuantity = returnQuantity;

    return `
      <tr data-index="${index}">
        <td>
          <div class="product-name">
            ${escapeHtml(item.product_name ?? item.name)}
          </div>

          <div class="product-code">
            ${escapeHtml(
              item.product_code ??
              item.code ??
              ""
            )}
          </div>
        </td>

        <td>
          ${quantity(item.sold)}
        </td>

        <td>
          ${quantity(item.returned)}
        </td>

        <td class="stock-value">
          ${quantity(available)}
        </td>

        <td>
          <input
            class="return-qty-input"
            data-field="quantity"
            data-index="${index}"
            type="number"
            min="0"
            max="${escapeHtml(available)}"
            step="0.001"
            value="${escapeHtml(returnQuantity)}"
            ${available <= 0 ? "disabled" : ""}
            aria-label="Return quantity"
          >
        </td>

        <td>
          ${escapeHtml(item.unit ?? "PCS")}
        </td>

        <td>
          ${money(item.rate)}
        </td>

        <td>
          <select
            class="return-reason-select"
            data-field="reason"
            data-index="${index}"
            ${available <= 0 ? "disabled" : ""}
            required
          >
            <option value="">Select</option>

            ${reasons.map((reason) => `
              <option
                value="${escapeHtml(reason)}"
                ${item.reason === reason ? "selected" : ""}
              >
                ${escapeHtml(reason)}
              </option>
            `).join("")}
          </select>
        </td>

        <td class="item-amount">
          ${money(
            returnQuantity *
            number(item.rate)
          )}
        </td>
      </tr>
    `;
  }).join("");

  updateTotal();
};

  const loadSaleItems = async (saleId) => {
    if (!saleId) {
      renderItemsPlaceholder("Select an original sale.");
      return;
    }

    renderItemsPlaceholder("Loading sale items...");

    const data = await apiRequest(`${API_BASE}/sales/${encodeURIComponent(saleId)}/items`);
    renderSaleItems(Array.isArray(data.items) ? data.items : []);
  };

  const updateTotal = () => {
    const total = state.saleItems.reduce(
      (sum, item) => sum + number(item.returnQuantity) * number(item.rate),
      0
    );

    elements.total.textContent = money(total);
  };

  // const validateRows = () => {
  //   const selected = state.saleItems.filter((item) => number(item.returnQuantity) > 0);

  //   if (!selected.length) {
  //     elements.itemsError.textContent = "Enter return quantity for at least one product.";
  //     return false;
  //   }

  //   for (const item of selected) {
  //     if (number(item.returnQuantity) > number(item.available) + 1e-9) {
  //       elements.itemsError.textContent =
  //         `Return quantity exceeds available quantity for ${item.product_name ?? item.name}.`;
  //       return false;
  //     }
  //   }

  //   elements.itemsError.textContent = "";
  //   return true;
  // };

  const validateRows = () => {
  const selected = state.saleItems.filter(
    (item) => number(item.returnQuantity) > 0
  );

  if (!selected.length) {
    elements.itemsError.textContent =
      "Enter return quantity for at least one product.";

    return false;
  }

  for (const item of selected) {
    if (
      number(item.returnQuantity) >
      number(item.available) + 1e-9
    ) {
      elements.itemsError.textContent =
        `Return quantity exceeds available quantity for ${
          item.product_name ?? item.name
        }.`;

      return false;
    }

    if (!String(item.reason || "").trim()) {
      elements.itemsError.textContent =
        `Return reason is required for ${
          item.product_name ?? item.name
        }.`;

      return false;
    }
  }

  elements.itemsError.textContent = "";

  return true;
};

  const collectPayload = () => ({
    customer_id: Number(elements.customer.value),
    sale_id: Number(elements.sale.value),
    return_date: elements.returnDate.value,
    reason: elements.reason.value.trim() || null,
    items: state.saleItems
      .filter((item) => number(item.returnQuantity) > 0)
      .map((item) => ({
        product_id: Number(item.product_id),
        quantity: number(item.returnQuantity),
        reason: item.reason?.trim() || null,
      })),
  });

  const clearErrors = () => {
    document.querySelectorAll("[data-error-for]").forEach((element) => {
      element.textContent = "";
    });
    elements.itemsError.textContent = "";
  };

  const resetForm = () => {
    state.editingId = null;
    clearErrors();

    elements.modalTitle.textContent = "New Sales Return";
    elements.form.reset();
    elements.returnDate.value = today();
    resetSaleSelect();
    state.saleItems = [];
    renderItemsPlaceholder("Select an original sale.");
    elements.total.textContent = money(0);
    elements.saveButton.disabled = false;
    elements.saveButton.innerHTML = `
      <i class="fa-solid fa-check"></i>
      <span>Save Sales Return</span>
    `;
  };

  const openCreate = () => {
    resetForm();
    openModal();
  };

  const openEdit = async (id) => {
    try {
      resetForm();

      const data = await apiRequest(`${API_BASE}/${encodeURIComponent(id)}`);
      const record = data.return;

      if (!record) throw new Error("Sales return not found.");

      state.editingId = Number(record.id);
      elements.modalTitle.textContent = `Edit ${record.return_no}`;
      elements.customer.value = String(record.customer_id);
      elements.returnDate.value = String(record.return_date).slice(0, 10);
      elements.reason.value = record.reason || "";
      elements.remarks.value = record.remarks || "";

      await loadSalesForCustomer(record.customer_id, record.sale_id);
      await loadSaleItems(record.sale_id);

      state.saleItems.forEach((item) => {
        const existing = (record.items || []).find(
          (row) => Number(row.product_id) === Number(item.product_id)
        );
        item.returnQuantity = existing ? number(existing.quantity) : 0;
      });

      renderSaleItems(state.saleItems);
      openModal();
    } catch (error) {
      console.error("[Sales Return] edit:", error);
      showToast(error.message, "error");
    }
  };

  const saveReturn = async (event) => {
    event.preventDefault();
    clearErrors();

    if (!elements.customer.value) {
      $('[data-error-for="customer"]').textContent = "Customer is required.";
      return;
    }

    if (!elements.sale.value) {
      $('[data-error-for="sale"]').textContent = "Original sale is required.";
      return;
    }

    if (!elements.returnDate.value) {
      $('[data-error-for="date"]').textContent = "Return date is required.";
      return;
    }

    if (!validateRows()) return;

    const isEdit = Boolean(state.editingId);

    try {
      elements.saveButton.disabled = true;
      elements.saveButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>${isEdit ? "Updating..." : "Saving..."}</span>
      `;

      const payload = collectPayload();

      const data = await apiRequest(
        isEdit
          ? `${API_BASE}/${state.editingId}`
          : API_BASE,
        {
          method: isEdit ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      );

      showToast(
        data.message ||
          (isEdit
            ? "Sales return updated successfully."
            : "Sales return created successfully.")
      );

      closeModal();
      await loadReturns();
    } catch (error) {
      console.error("[Sales Return] save:", error);
      showToast(error.message, "error");

      elements.saveButton.disabled = false;
      elements.saveButton.innerHTML = `
        <i class="fa-solid fa-check"></i>
        <span>${isEdit ? "Update Sales Return" : "Save Sales Return"}</span>
      `;
    }
  };

  const renderTable = () => {
    const search = elements.search.value.trim().toLowerCase();
    const customerId = elements.customerFilter.value;
    const date = elements.dateFilter.value;

    const filtered = state.returns.filter((item) => {
      const searchable = [
        item.return_no,
        item.customer_name,
        item.sale_no,
        item.reason,
      ].join(" ").toLowerCase();

      const matchesSearch = !search || searchable.includes(search);
      const matchesCustomer =
        !customerId || String(item.customer_id) === String(customerId);
      const matchesDate =
        !date || String(item.return_date).slice(0, 10) === date;

      return matchesSearch && matchesCustomer && matchesDate;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

    if (state.page > totalPages) {
      state.page = totalPages;
    }

    const start = (state.page - 1) * PAGE_SIZE;
    const rows = filtered.slice(start, start + PAGE_SIZE);

    elements.pageNumber.textContent = String(state.page);
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= totalPages;

    elements.count.textContent =
      filtered.length === 0
        ? "Showing 0 returns"
        : `Showing ${start + 1}-${Math.min(start + rows.length, filtered.length)} of ${filtered.length} returns`;

    elements.empty.hidden = filtered.length !== 0;
    elements.tableBody.parentElement.parentElement.hidden = filtered.length === 0;

    if (!rows.length) {
      elements.tableBody.innerHTML = "";
      return;
    }

    elements.tableBody.innerHTML = rows.map((item) => `
      <tr>
        <td>
          <span class="return-number">${escapeHtml(item.return_no)}</span>
        </td>
        <td>
          <span class="customer-name">${escapeHtml(item.customer_name)}</span>
        </td>
        <td>${escapeHtml(dateOnly(item.return_date))}</td>
        <td>${escapeHtml(item.sale_no || "-")}</td>
        <td>${escapeHtml(item.item_count ?? 0)}</td>
        <td>${escapeHtml(quantity(item.total_quantity))}</td>
        <td class="return-total">${money(item.total_amount)}</td>
        <td>
          <div class="return-actions">
            <button class="table-action"
                    type="button"
                    data-action="view"
                    data-id="${escapeHtml(item.id)}"
                    title="View">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="table-action"
                    type="button"
                    data-action="edit"
                    data-id="${escapeHtml(item.id)}"
                    title="Edit">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="table-action danger"
                    type="button"
                    data-action="delete"
                    data-id="${escapeHtml(item.id)}"
                    title="Delete">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  };

  const updateSummary = () => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const monthReturns = state.returns.filter((item) => {
      const date = new Date(`${String(item.return_date).slice(0, 10)}T00:00:00`);
      return date.getMonth() === month && date.getFullYear() === year;
    });

    elements.totalReturns.textContent = String(state.returns.length);

    elements.monthReturns.textContent = String(monthReturns.length);

    elements.returnedQuantity.textContent = quantity(
      state.returns.reduce((sum, item) => sum + number(item.total_quantity), 0)
    );

    elements.totalReturnValue.textContent = money(
      state.returns.reduce((sum, item) => sum + number(item.total_amount), 0)
    );
  };

  const loadReturns = async () => {
    try {
      state.loading = true;

      const data = await apiRequest(API_BASE);
      state.returns = Array.isArray(data.returns)
        ? data.returns
        : [];

      state.page = 1;
      updateSummary();
      renderTable();
    } catch (error) {
      console.error("[Sales Return] list:", error);
      state.returns = [];
      updateSummary();
      renderTable();
      showToast(error.message, "error");
    } finally {
      state.loading = false;
    }
  };

  const viewReturn = async (id) => {
    openViewModal();

    elements.viewTitle.textContent = "Sales Return";
    elements.viewSubtitle.textContent = "Loading return details...";
    elements.details.innerHTML = `
      <div class="sale-returns-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Loading return...
      </div>
    `;

    try {
      const data = await apiRequest(`${API_BASE}/${encodeURIComponent(id)}`);
      const record = data.return;

      if (!record) throw new Error("Sales return not found.");

      elements.viewTitle.textContent = record.return_no || "Sales Return";
      elements.viewSubtitle.textContent =
        `${record.customer_name || "Customer"} • ${dateOnly(record.return_date)}`;

      const items = Array.isArray(record.items) ? record.items : [];

      elements.details.innerHTML = `
        <div class="return-detail-head">
          <div class="return-detail-box">
            <span>Customer</span>
            <strong>${escapeHtml(record.customer_name || "-")}</strong>
          </div>
          <div class="return-detail-box">
            <span>Original Sale</span>
            <strong>${escapeHtml(record.sale_no || "-")}</strong>
          </div>
          <div class="return-detail-box">
            <span>Return Date</span>
            <strong>${escapeHtml(dateOnly(record.return_date))}</strong>
          </div>
          <div class="return-detail-box">
            <span>Reason</span>
            <strong>${escapeHtml(record.reason || "-")}</strong>
          </div>
        </div>

        <div class="return-detail-items">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Rate</th>
                <th>Reason</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(item.product_name || item.name || "-")}</strong>
                    <div class="product-code">${escapeHtml(item.product_code || item.code || "")}</div>
                  </td>
                  <td>${quantity(item.quantity)}</td>
                  <td>${escapeHtml(item.unit || "PCS")}</td>
                  <td>${money(item.rate)}</td>
                  <td>${escapeHtml(item.reason || "-")}</td>
                  <td>${money(item.amount)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <div class="return-detail-total">
          <span>Total Return Value</span>
          <strong>${money(record.total_amount ?? items.reduce((sum, item) => sum + number(item.amount), 0))}</strong>
        </div>

        ${
          record.remarks
            ? `<div class="return-detail-note">
                 <strong>Notes</strong>
                 <p>${escapeHtml(record.remarks)}</p>
               </div>`
            : ""
        }
      `;
    } catch (error) {
      console.error("[Sales Return] view:", error);
      elements.details.innerHTML = `
        <div class="sale-returns-loading">
          ${escapeHtml(error.message)}
        </div>
      `;
    }
  };

  const deleteReturn = async () => {
    const id = state.deletingId;

    if (!id) return;

    try {
      elements.confirmDelete.disabled = true;
      elements.confirmDelete.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Deleting...
      `;

      const data = await apiRequest(`${API_BASE}/${id}`, {
        method: "DELETE",
      });

      showToast(data.message || "Sales return deleted successfully.");

      closeDeleteModal();
      await loadReturns();
    } catch (error) {
      console.error("[Sales Return] delete:", error);
      showToast(error.message, "error");
    } finally {
      elements.confirmDelete.disabled = false;
      elements.confirmDelete.innerHTML = `
        <i class="fa-solid fa-trash-can"></i>
        Delete
      `;
    }
  };

  const bindEvents = () => {
    elements.addButton?.addEventListener("click", openCreate);
    elements.emptyAdd?.addEventListener("click", openCreate);

    elements.closeModal?.addEventListener("click", closeModal);
    elements.cancel?.addEventListener("click", closeModal);

    // elements.modal?.addEventListener("click", (event) => {
    //   if (event.target === elements.modal) closeModal();
    // });

    elements.form?.addEventListener("submit", saveReturn);

    elements.customer?.addEventListener("change", async () => {
      clearErrors();
      renderItemsPlaceholder("Select an original sale.");

      try {
        await loadSalesForCustomer(elements.customer.value);
      } catch (error) {
        console.error("[Sales Return] sales:", error);
        showToast(error.message, "error");
      }
    });

    elements.sale?.addEventListener("change", async () => {
      try {
        await loadSaleItems(elements.sale.value);
      } catch (error) {
        console.error("[Sales Return] items:", error);
        renderItemsPlaceholder(error.message);
        showToast(error.message, "error");
      }
    });

    // elements.itemsBody?.addEventListener("input", (event) => {
    //   const input = event.target.closest('[data-field="quantity"]');
    //   if (!input) return;

    //   const index = Number(input.dataset.index);
    //   const item = state.saleItems[index];

    //   if (!item) return;

    //   const value = Math.max(0, number(input.value));
    //   const max = Math.max(0, number(item.available));

    //   item.returnQuantity = Math.min(value, max);

    //   if (value > max) {
    //     input.classList.add("invalid");
    //     elements.itemsError.textContent =
    //       `Maximum returnable quantity is ${quantity(max)} for ${item.product_name ?? item.name}.`;
    //   } else {
    //     input.classList.remove("invalid");
    //     elements.itemsError.textContent = "";
    //   }

    //   input.value = String(item.returnQuantity);

    //   const row = input.closest("tr");
    //   const amount = row?.querySelector(".item-amount");
    //   if (amount) {
    //     amount.textContent = money(item.returnQuantity * number(item.rate));
    //   }

    //   updateTotal();
    // });

    elements.itemsBody?.addEventListener("input", (event) => {
  const input = event.target.closest('[data-field="quantity"]');

  if (!input) return;

  const index = Number(input.dataset.index);
  const item = state.saleItems[index];

  if (!item) return;

  const value = Math.max(0, number(input.value));
  const max = Math.max(0, number(item.available));

  item.returnQuantity = Math.min(value, max);

  if (value > max) {
    input.classList.add("invalid");

    elements.itemsError.textContent =
      `Maximum returnable quantity is ${quantity(max)} for ${
        item.product_name ?? item.name
      }.`;
  } else {
    input.classList.remove("invalid");

    elements.itemsError.textContent = "";
  }

  input.value = String(item.returnQuantity);

  const row = input.closest("tr");
  const amount = row?.querySelector(".item-amount");

  if (amount) {
    amount.textContent = money(
      item.returnQuantity *
      number(item.rate)
    );
  }

  updateTotal();
});

elements.itemsBody?.addEventListener("change", (event) => {
  const select = event.target.closest('[data-field="reason"]');

  if (!select) return;

  const index = Number(select.dataset.index);
  const item = state.saleItems[index];

  if (!item) return;

  item.reason = select.value;

  select.classList.toggle(
    "invalid",
    number(item.returnQuantity) > 0 && !item.reason
  );

  elements.itemsError.textContent = "";
});

    elements.search?.addEventListener("input", () => {
      state.page = 1;
      renderTable();
    });

    elements.customerFilter?.addEventListener("change", () => {
      state.page = 1;
      renderTable();
    });

    elements.dateFilter?.addEventListener("change", () => {
      state.page = 1;
      renderTable();
    });

    elements.resetFilters?.addEventListener("click", () => {
      elements.search.value = "";
      elements.customerFilter.value = "";
      elements.dateFilter.value = "";
      state.page = 1;
      renderTable();
    });

    elements.previousPage?.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderTable();
      }
    });

    elements.nextPage?.addEventListener("click", () => {
      state.page += 1;
      renderTable();
    });

    elements.tableBody?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const id = Number(button.dataset.id);
      const action = button.dataset.action;

      if (action === "view") viewReturn(id);
      if (action === "edit") openEdit(id);
      if (action === "delete") openDeleteModal(id);
    });

    elements.closeView?.addEventListener("click", closeViewModal);
    elements.closeViewButton?.addEventListener("click", closeViewModal);

    elements.viewModal?.addEventListener("click", (event) => {
      if (event.target === elements.viewModal) closeViewModal();
    });

    elements.cancelDelete?.addEventListener("click", closeDeleteModal);
    elements.confirmDelete?.addEventListener("click", deleteReturn);

    elements.deleteModal?.addEventListener("click", (event) => {
      if (event.target === elements.deleteModal) closeDeleteModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (!elements.deleteModal.hidden) {
        closeDeleteModal();
      } else if (!elements.viewModal.hidden) {
        closeViewModal();
      } else if (!elements.modal.hidden) {
        closeModal();
      }
    });
  };

  const init = async () => {
    const token = localStorage.getItem("accessToken");

    if (!token) {
      window.location.replace("/login");
      return;
    }

    bindEvents();

    elements.returnDate.value = today();

    try {
      await Promise.all([
        loadOptions(),
        loadReturns(),
      ]);
    } catch (error) {
      console.error("[Sales Return] init:", error);
      showToast(error.message, "error");
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();
