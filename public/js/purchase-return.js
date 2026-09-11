(() => {
  "use strict";

  const state = {
    returns: [],
    filteredReturns: [],
    suppliers: [],
    purchases: [],
    purchaseItems: [],
    page: 1,
    pageSize: 30,
    editingId: null,
    deletingId: null,
  };

  const elements = {};

  const $ = (selector) => document.querySelector(selector);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const getToken = () =>
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    localStorage.getItem("jwt");

  const apiRequest = async (url, options = {}) => {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    const token = getToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      throw new Error("Your session has expired. Please login again.");
    }

    if (!response.ok) {
      throw new Error(
        payload?.message ||
        payload?.error ||
        `Request failed (${response.status}).`
      );
    }

    return payload;
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const formatNumber = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 3,
    });

  const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };
  
  const today = () => new Date().toISOString().slice(0, 10);

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

  const normalizeReturn = (item) => ({
    id: Number(item.id),
    return_no: item.return_no ?? "",
    supplier_id: Number(item.supplier_id || 0),
    supplier_name: item.supplier_name ?? "",
    purchase_id: Number(item.purchase_id || 0),
    purchase_no: item.purchase_no ?? "",
    return_date: item.return_date ?? "",
    reason: item.reason ?? "",
    item_count: Number(item.item_count || 0),
    total_quantity: Number(item.total_quantity || 0),
    total_amount: Number(item.total_amount || 0),
  });

  const cacheElements = () => {
    Object.assign(elements, {
      totalReturns: $("#totalReturns"),
      monthReturns: $("#monthReturns"),
      returnedQuantity: $("#returnedQuantity"),
      totalReturnValue: $("#totalReturnValue"),

      addPurchaseReturnButton: $("#addPurchaseReturnButton"),
      emptyAddReturn: $("#emptyAddReturn"),

      search: $("#returnSearch"),
      supplierFilter: $("#supplierFilter"),
      dateFilter: $("#returnDateFilter"),
      resetFilters: $("#resetFilters"),

      tableBody: $("#returnsTableBody"),
      empty: $("#returnsEmpty"),
      count: $("#returnsCount"),
      previousPage: $("#previousPage"),
      nextPage: $("#nextPage"),
      pageNumber: $("#pageNumber"),

      modal: $("#purchaseReturnModal"),
      modalTitle: $("#purchaseReturnModalTitle"),
      closeModal: $("#closePurchaseReturnModal"),
      cancel: $("#cancelPurchaseReturn"),
      form: $("#purchaseReturnForm"),
      saveButton: $("#savePurchaseReturn"),

      supplierId: $("#supplierId"),
      purchaseId: $("#purchaseId"),
      returnDate: $("#returnDate"),
      overallReason: $("#overallReason"),
      itemsBody: $("#returnItemsBody"),
      itemsError: $("#itemsError"),
      remarks: $("#remarks"),
      grandTotal: $("#grandTotal"),

      viewModal: $("#viewPurchaseReturnModal"),
      closeView: $("#closeViewPurchaseReturn"),
      closeViewButton: $("#closeViewPurchaseReturnButton"),
      viewTitle: $("#viewReturnTitle"),
      viewSubtitle: $("#viewReturnSubtitle"),
      details: $("#purchaseReturnDetails"),

      deleteModal: $("#deleteModal"),
      deleteMessage: $("#deleteMessage"),
      cancelDeleteButton: $("#cancelDeleteButton"),
      confirmDeleteButton: $("#confirmDeleteButton"),

      toastContainer: $("#toastContainer"),
    });
  };

  const loadOptions = async () => {
    const payload = await apiRequest("/api/purchase-returns/options");

    state.suppliers = Array.isArray(payload?.suppliers)
      ? payload.suppliers
      : [];

    elements.supplierId.innerHTML = `
      <option value="">Select Supplier</option>
      ${state.suppliers.map((supplier) => `
        <option value="${supplier.id}">
          ${escapeHtml(supplier.name)}
          ${supplier.mobile ? ` — ${escapeHtml(supplier.mobile)}` : ""}
        </option>
      `).join("")}
    `;

    elements.supplierFilter.innerHTML = `
      <option value="">All Suppliers</option>
      ${state.suppliers.map((supplier) => `
        <option value="${supplier.id}">
          ${escapeHtml(supplier.name)}
        </option>
      `).join("")}
    `;
  };

  const updateSummary = () => {
    const monthKey = today().slice(0, 7);

    const monthCount = state.returns.filter(
      (item) => String(item.return_date).slice(0, 7) === monthKey
    ).length;

    const quantity = state.returns.reduce(
      (sum, item) => sum + Number(item.total_quantity || 0),
      0
    );

    const total = state.returns.reduce(
      (sum, item) => sum + Number(item.total_amount || 0),
      0
    );

    elements.totalReturns.textContent =
      state.returns.length.toLocaleString("en-IN");

    elements.monthReturns.textContent =
      monthCount.toLocaleString("en-IN");

    elements.returnedQuantity.textContent =
      formatNumber(quantity);

    elements.totalReturnValue.textContent =
      formatCurrency(total);
  };

  const renderLoading = () => {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="purchase-returns-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading purchase returns...
          </div>
        </td>
      </tr>
    `;

    elements.empty.hidden = true;
  };

  const loadReturns = async () => {
    renderLoading();

    try {
      const payload = await apiRequest("/api/purchase-returns");

      state.returns = Array.isArray(payload?.returns)
        ? payload.returns.map(normalizeReturn)
        : [];

      updateSummary();
      applyFilters();
    } catch (error) {
      console.error("[Purchase Return] list:", error);

      elements.tableBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="purchase-returns-loading">
              <i class="fa-solid fa-triangle-exclamation"></i>
              ${escapeHtml(error.message)}
            </div>
          </td>
        </tr>
      `;

      showToast(error.message, "error");
    }
  };

  const applyFilters = () => {
    const search = elements.search.value.trim().toLowerCase();
    const supplier = elements.supplierFilter.value;
    const date = elements.dateFilter.value;

    state.filteredReturns = state.returns.filter((item) => {
      const haystack = [
        item.return_no,
        item.supplier_name,
        item.purchase_no,
        item.reason,
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!search || haystack.includes(search)) &&
        (!supplier || String(item.supplier_id) === String(supplier)) &&
        (!date || String(item.return_date).slice(0, 10) === date)
      );
    });

    state.page = 1;
    renderTable();
  };

  const renderTable = () => {
    const rows = state.filteredReturns;

    if (!rows.length) {
      elements.tableBody.innerHTML = "";
      elements.empty.hidden = false;
      elements.count.textContent = "Showing 0 returns";
      updatePagination();
      return;
    }

    elements.empty.hidden = true;

    const totalPages = Math.max(
      1,
      Math.ceil(rows.length / state.pageSize)
    );

    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);

    elements.tableBody.innerHTML = pageRows.map((item) => `
      <tr>
        <td>
          <span class="return-number">
            ${escapeHtml(item.return_no)}
          </span>
        </td>

        <td>
          <span class="return-supplier">
            ${escapeHtml(item.supplier_name || "—")}
          </span>
        </td>

        <td>
          <span class="return-date">
            ${escapeHtml(formatDate(item.return_date))}
          </span>
        </td>

        <td>
          <span>${escapeHtml(item.purchase_no || "—")}</span>
        </td>

        <td>
          <span class="return-item-count">
            ${formatNumber(item.item_count)}
          </span>
        </td>

        <td>
          <span class="return-quantity">
            ${formatNumber(item.total_quantity)}
          </span>
        </td>

        <td>
          <span class="return-amount">
            ${formatCurrency(item.total_amount)}
          </span>
        </td>

        <td class="action-column">
          <div class="purchase-return-actions">
            <button
              class="table-action"
              type="button"
              data-action="view"
              data-id="${item.id}"
              title="View purchase return"
              aria-label="View purchase return">
              <i class="fa-solid fa-eye"></i>
            </button>

            <button
              class="table-action"
              type="button"
              data-action="edit"
              data-id="${item.id}"
              title="Edit purchase return"
              aria-label="Edit purchase return">
              <i class="fa-solid fa-pen"></i>
            </button>

            <button
              class="table-action danger"
              type="button"
              data-action="delete"
              data-id="${item.id}"
              title="Delete purchase return"
              aria-label="Delete purchase return">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join("");

    elements.count.textContent =
      `Showing ${start + 1}-${Math.min(
        start + pageRows.length,
        rows.length
      )} of ${rows.length} returns`;

    updatePagination();
  };

  const updatePagination = () => {
    const totalPages = Math.max(
      1,
      Math.ceil(state.filteredReturns.length / state.pageSize)
    );

    elements.pageNumber.textContent = String(state.page);
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= totalPages;
  };

  const resetForm = () => {
    state.editingId = null;
    state.purchaseItems = [];

    elements.form.reset();
    elements.returnDate.value = today();

    elements.purchaseId.innerHTML = `
      <option value="">Select Purchase</option>
    `;

    elements.purchaseId.disabled = true;

    elements.itemsBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="return-table-placeholder">
            Select an original purchase.
          </div>
        </td>
      </tr>
    `;

    elements.itemsError.textContent = "";
    elements.grandTotal.textContent = formatCurrency(0);

    elements.modalTitle.textContent = "New Purchase Return";
    elements.saveButton.querySelector("span").textContent =
      "Save Purchase Return";

    document.querySelectorAll(".form-error").forEach((node) => {
      node.textContent = "";
    });
  };

  const openModal = () => {
    resetForm();

    elements.modal.hidden = false;
    elements.modal.removeAttribute("hidden");

    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      elements.supplierId?.focus();
    });
  };

  const closeModal = () => {
    elements.modal.hidden = true;
    document.body.style.overflow = "";
  };

  const loadSupplierPurchases = async () => {
    const supplierId = Number(elements.supplierId.value);

    state.purchases = [];
    state.purchaseItems = [];

    elements.purchaseId.innerHTML = `
      <option value="">Loading purchases...</option>
    `;

    elements.purchaseId.disabled = true;

    elements.itemsBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="return-table-placeholder">
            Select an original purchase.
          </div>
        </td>
      </tr>
    `;

    elements.grandTotal.textContent = formatCurrency(0);

    if (!supplierId) {
      elements.purchaseId.innerHTML = `
        <option value="">Select Purchase</option>
      `;
      return;
    }

    try {
      const payload = await apiRequest(
        `/api/purchase-returns/purchases?supplier_id=${supplierId}`
      );

      state.purchases = Array.isArray(payload?.purchases)
        ? payload.purchases
        : [];

      elements.purchaseId.innerHTML = `
        <option value="">Select Purchase</option>
        ${state.purchases.map((purchase) => `
          <option value="${purchase.id}">
            ${escapeHtml(purchase.purchase_no)}
            — ${escapeHtml(formatDate(purchase.purchase_date))}
            — ${formatCurrency(purchase.total_amount)}
          </option>
        `).join("")}
      `;

      elements.purchaseId.disabled = false;
    } catch (error) {
      elements.purchaseId.innerHTML = `
        <option value="">Failed to load purchases</option>
      `;

      showToast(error.message, "error");
    }
  };

  const loadPurchaseItems = async () => {
    const purchaseId = Number(elements.purchaseId.value);

    if (!purchaseId) {
      state.purchaseItems = [];

      elements.itemsBody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="return-table-placeholder">
              Select an original purchase.
            </div>
          </td>
        </tr>
      `;

      updateTotal();
      return;
    }

    elements.itemsBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="purchase-returns-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading purchase items...
          </div>
        </td>
      </tr>
    `;

    try {
      const payload = await apiRequest(
        `/api/purchase-returns/purchases/${purchaseId}/items`
      );

      state.purchaseItems = Array.isArray(payload?.items)
        ? payload.items.map((item) => ({
            ...item,
            return_quantity: 0,
            reason: "",
          }))
        : [];

      renderItems();
      updateTotal();
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const renderItems = () => {
    if (!state.purchaseItems.length) {
      elements.itemsBody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="return-table-placeholder">
              No returnable items found.
            </div>
          </td>
        </tr>
      `;
      return;
    }

    elements.itemsBody.innerHTML = state.purchaseItems.map((item, index) => {
      const purchased = Number(item.quantity || 0);
      const alreadyReturned = Number(item.returned_quantity || 0);
    const currentStock = Math.max(0, Number(item.current_stock || 0));
    // const currentStock = Math.max(0, Number(item.returnable_quantity || 0));


      const reasons = [
        "Damaged",
        "Wrong Material",
        "Quality Issue",
        "Excess Material",
        "Expired",
        "Short/Incorrect Supply",
        "Other",
      ];

      return `
        <tr data-index="${index}">
          <td>
            <div class="material-name">
              ${escapeHtml(item.material_name || "—")}
            </div>
            <div class="material-code">
              ${escapeHtml(item.material_code || "")}
            </div>
          </td>

          <td>
            ${formatNumber(purchased)}
          </td>

          <td>
            <span class="already-returned">
              ${formatNumber(alreadyReturned)}
            </span>
          </td>

          <td>
            <span class="available-quantity">
              ${formatNumber(currentStock)}
            </span>
          </td>

          <td>
            <input
              data-field="return_quantity"
              type="number"
              min="0"
              max="${currentStock}"
              step="0.001"
              value="${item.return_quantity || ""}"
              placeholder="0.000"
              ${currentStock <= 0 ? "disabled" : ""}>
          </td>

          <td>
            <span class="item-unit">
              ${escapeHtml(item.unit || "—")}
            </span>
          </td>

          <td>
            ${formatCurrency(item.rate)}
          </td>

          <td>
            <select data-field="reason" required>
              <option value="">Select</option>
              ${reasons.map((reason) => `
                <option value="${escapeHtml(reason)}"
                  ${item.reason === reason ? "selected" : ""}>
                  ${escapeHtml(reason)}
                </option>
              `).join("")}
            </select>
          </td>

          <td>
            <span class="item-amount">
              ${formatCurrency(
                Number(item.return_quantity || 0) *
                Number(item.rate || 0)
              )}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  };

  const updateItemFromRow = (row) => {
    const index = Number(row.dataset.index);
    const item = state.purchaseItems[index];

    if (!item) return;

    const quantityInput = row.querySelector('[data-field="return_quantity"]');
    const reasonSelect = row.querySelector('[data-field="reason"]');
    const available = Math.max(0, Number(item.current_stock || 0));
    // const available = Math.max(0, Number(item.returnable_quantity || 0));


    let quantity = Number(quantityInput.value || 0);

    if (!Number.isFinite(quantity) || quantity < 0) {
      quantity = 0;
    }

    if (quantity > available) {
      quantity = available;
    }

    quantityInput.value = quantity || "";

    item.return_quantity = quantity;
    item.reason = reasonSelect.value;

    const amount =
      quantity * Number(item.rate || 0);

    const amountElement =
      row.querySelector(".item-amount");

    if (amountElement) {
      amountElement.textContent =
        formatCurrency(amount);
    }

    updateTotal();
  };

  const updateTotal = () => {
    const total = state.purchaseItems.reduce(
      (sum, item) =>
        sum +
        Number(item.return_quantity || 0) *
        Number(item.rate || 0),
      0
    );

    elements.grandTotal.textContent =
      formatCurrency(total);
  };

  const validateForm = () => {
    document.querySelectorAll(".form-error").forEach((node) => {
      node.textContent = "";
    });

    elements.itemsError.textContent = "";

    if (!elements.supplierId.value) {
      $("[data-error-for='supplier']").textContent =
        "Supplier is required.";
      return false;
    }

    if (!elements.purchaseId.value) {
      $("[data-error-for='purchase']").textContent =
        "Original purchase is required.";
      return false;
    }

    if (!elements.returnDate.value) {
      $("[data-error-for='date']").textContent =
        "Return date is required.";
      return false;
    }

    const selectedItems = state.purchaseItems.filter(
      (item) => Number(item.return_quantity || 0) > 0
    );

    if (!selectedItems.length) {
      elements.itemsError.textContent =
        "Enter a return quantity for at least one product.";
      return false;
    }

    for (const item of selectedItems) {
      const available = Math.max(0, Number(item.current_stock || 0));
      // const available = Math.max(0, Number(item.returnable_quantity || 0));


      if (Number(item.return_quantity) > available) {
        elements.itemsError.textContent =
          `Return quantity exceeds available quantity for ${item.material_name}.`;
        return false;
      }

      if (!String(item.reason || "").trim()) {
        elements.itemsError.textContent =
          `Return reason is required for ${item.material_name}.`;
        return false;
      }
    }

    return true;
  };

  const buildPayload = () => ({
    supplier_id: Number(elements.supplierId.value),
    purchase_id: Number(elements.purchaseId.value),
    return_date: elements.returnDate.value,
    reason: elements.overallReason.value || null,
    remarks: elements.remarks.value.trim() || null,

    items: state.purchaseItems
      .filter((item) => Number(item.return_quantity || 0) > 0)
      .map((item) => ({
        raw_material_id: Number(item.raw_material_id),
        quantity: Number(item.return_quantity),
        reason: item.reason,
      })),
  });

  const saveReturn = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const isEdit = Boolean(state.editingId);

    elements.saveButton.disabled = true;

    elements.saveButton.querySelector("span").textContent =
      isEdit
        ? "Updating..."
        : "Saving...";

    try {
      const payload = buildPayload();

      const endpoint = isEdit
        ? `/api/purchase-returns/${state.editingId}`
        : "/api/purchase-returns";

      const response = await apiRequest(endpoint, {
        method: isEdit ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      closeModal();

      showToast(
        response?.message ||
        (isEdit
          ? "Purchase return updated successfully."
          : "Purchase return created successfully.")
      );

      await loadReturns();
    } catch (error) {
      console.error("[Purchase Return] save:", error);
      showToast(error.message, "error");
    } finally {
      elements.saveButton.disabled = false;

      elements.saveButton.querySelector("span").textContent =
        isEdit
          ? "Update Purchase Return"
          : "Save Purchase Return";
    }
  };

  const openView = async (id) => {
    elements.viewModal.hidden = false;
    elements.viewModal.removeAttribute("hidden");

    document.body.style.overflow = "hidden";

    elements.details.innerHTML = `
      <div class="purchase-returns-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Loading purchase return...
      </div>
    `;

    try {
      const payload =
        await apiRequest(`/api/purchase-returns/${id}`);

      const item = payload?.return;

      if (!item) {
        throw new Error("Purchase return not found.");
      }

      elements.viewTitle.textContent =
        item.return_no || "Purchase Return";

      elements.viewSubtitle.textContent =
        `${item.supplier_name || "Supplier"} • ${item.purchase_no || "Purchase"}`;

      elements.details.innerHTML = `
        <div class="return-details-grid">
          <div class="return-detail-box">
            <span>Return No.</span>
            <strong>${escapeHtml(item.return_no)}</strong>
          </div>

          <div class="return-detail-box">
            <span>Supplier</span>
            <strong>${escapeHtml(item.supplier_name || "—")}</strong>
          </div>

          <div class="return-detail-box">
            <span>Original Purchase</span>
            <strong>${escapeHtml(item.purchase_no || "—")}</strong>
          </div>

          <div class="return-detail-box">
            <span>Return Date</span>
            <strong>${escapeHtml(formatDate(item.return_date))}</strong>
          </div>
        </div>

        <div class="return-details-table-wrap">
          <table class="return-details-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Unit</th>
                <th>Quantity</th>
                <th>Rate</th>
                <th>Reason</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              ${(item.items || []).map((row) => `
                <tr>
                  <td>
                    ${escapeHtml(row.material_name || "—")}
                    ${row.material_code
                      ? `<small class="material-code">${escapeHtml(row.material_code)}</small>`
                      : ""}
                  </td>
                  <td>${escapeHtml(row.unit || "—")}</td>
                  <td>${formatNumber(row.quantity)}</td>
                  <td>${formatCurrency(row.rate)}</td>
                  <td>${escapeHtml(row.reason || item.reason || "—")}</td>
                  <td>${formatCurrency(row.amount)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <div class="return-details-total">
          <span>
            Total Quantity:
            ${formatNumber(
              (item.items || []).reduce(
                (sum, row) => sum + Number(row.quantity || 0),
                0
              )
            )}
          </span>

          <strong>
            Total: ${formatCurrency(item.total_amount)}
          </strong>
        </div>

        ${
          item.remarks
            ? `
              <div class="return-details-notes">
                <strong>Notes:</strong>
                ${escapeHtml(item.remarks)}
              </div>
            `
            : ""
        }
      `;
    } catch (error) {
      console.error("[Purchase Return] view:", error);

      elements.details.innerHTML = `
        <div class="purchase-returns-loading">
          <i class="fa-solid fa-triangle-exclamation"></i>
          ${escapeHtml(error.message)}
        </div>
      `;
    }
  };

  const closeViewModal = () => {
    elements.viewModal.hidden = true;
    document.body.style.overflow = "";
  };

  const openEdit = async (id) => {
    resetForm();

    state.editingId = id;

    elements.modal.hidden = false;
    elements.modal.removeAttribute("hidden");

    document.body.style.overflow = "hidden";

    elements.itemsBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="purchase-returns-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading purchase return...
          </div>
        </td>
      </tr>
    `;

    try {
      const payload =
        await apiRequest(`/api/purchase-returns/${id}`);

      const item = payload?.return;

      if (!item) {
        throw new Error("Purchase return not found.");
      }

      elements.supplierId.value =
        String(item.supplier_id);

      await loadSupplierPurchases();

      elements.purchaseId.value =
        String(item.purchase_id);

      await loadPurchaseItems();

      state.purchaseItems =
        state.purchaseItems.map((purchaseItem) => {
          const existing =
            (item.items || []).find(
              (returnItem) =>
                Number(returnItem.raw_material_id) ===
                Number(purchaseItem.raw_material_id)
            );

          if (!existing) {
            return purchaseItem;
          }

          return {
            ...purchaseItem,
            return_quantity:
              Number(existing.quantity || 0),
            reason:
              existing.reason ||
              item.reason ||
              "",
          };
        });

      elements.returnDate.value =
        String(item.return_date || "").slice(0, 10);

      elements.overallReason.value =
        item.reason || "";

      elements.remarks.value =
        item.remarks || "";

      elements.modalTitle.textContent =
        `Edit Purchase Return ${item.return_no || ""}`;

      elements.saveButton.querySelector("span").textContent =
        "Update Purchase Return";

      renderItems();
      updateTotal();
    } catch (error) {
      console.error("[Purchase Return] edit:", error);

      closeModal();
      showToast(error.message, "error");
    }
  };

  // const deleteReturn = async (id) => {
  //   const item = state.returns.find(
  //     (row) => Number(row.id) === Number(id)
  //   );

  //   if (!item) return;

  //   const confirmed = window.confirm(
  //     `Delete ${item.return_no}?\n\n` +
  //     `This will remove the purchase return and reverse ` +
  //     `the related RAW_MATERIAL stock OUT movement.`
  //   );

  //   if (!confirmed) {
  //     return;
  //   }

  //   try {
  //     const response =
  //       await apiRequest(`/api/purchase-returns/${id}`, {
  //         method: "DELETE",
  //       });

  //     showToast(
  //       response?.message ||
  //       "Purchase return deleted and stock movement reversed."
  //     );

  //     await loadReturns();
  //   } catch (error) {
  //     console.error("[Purchase Return] delete:", error);
  //     showToast(error.message, "error");
  //   }
  // };

  const openDeleteModal = (id) => {
  const item = state.returns.find(
    (row) => Number(row.id) === Number(id)
  );

  if (!item) {
    showToast("Purchase return not found.", "error");
    return;
  }

  state.deletingId = Number(id);

  elements.deleteMessage.textContent =
    `Delete ${item.return_no}? This will remove the purchase return and reverse the related RAW_MATERIAL stock OUT movement.`;

  elements.confirmDeleteButton.disabled = false;

  elements.confirmDeleteButton.innerHTML = `
    <i class="fa-solid fa-trash-can"></i>
    Delete
  `;

  elements.deleteModal.hidden = false;
  elements.deleteModal.removeAttribute("hidden");
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

const confirmDeleteReturn = async () => {
  const id = state.deletingId;

  if (!id) {
    closeDeleteModal();
    return;
  }

  try {
    elements.confirmDeleteButton.disabled = true;

    elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Deleting...
    `;

    const response = await apiRequest(
      `/api/purchase-returns/${id}`,
      {
        method: "DELETE",
      }
    );

    closeDeleteModal();

    showToast(
      response?.message ||
      "Purchase return deleted and stock movement reversed."
    );

    await loadReturns();
  } catch (error) {
    console.error(
      "[Purchase Return] delete:",
      error
    );

    elements.confirmDeleteButton.disabled = false;

    elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-trash-can"></i>
      Delete
    `;

    showToast(
      error.message ||
      "Unable to delete purchase return.",
      "error"
    );
  }
};

  const handleTableAction = (event) => {
    const button =
      event.target.closest("[data-action]");

    if (!button) return;

    const id = Number(button.dataset.id);

    if (button.dataset.action === "view") {
      openView(id);
      return;
    }

    if (button.dataset.action === "edit") {
      openEdit(id);
      return;
    }

   if (button.dataset.action === "delete") {
  openDeleteModal(id);
  return;
}
  };

  const bindEvents = () => {
    elements.addPurchaseReturnButton.addEventListener(
      "click",
      openModal
    );

    elements.emptyAddReturn.addEventListener(
      "click",
      openModal
    );

    elements.closeModal.addEventListener(
      "click",
      closeModal
    );

    elements.cancel.addEventListener(
      "click",
      closeModal
    );

    // elements.modal.addEventListener(
    //   "click",
    //   (event) => {
    //     if (event.target === elements.modal) {
    //       closeModal();
    //     }
    //   }
    // );

    elements.form.addEventListener(
      "submit",
      saveReturn
    );

    elements.supplierId.addEventListener(
      "change",
      loadSupplierPurchases
    );

    elements.purchaseId.addEventListener(
      "change",
      loadPurchaseItems
    );

    elements.itemsBody.addEventListener(
      "input",
      (event) => {
        const row =
          event.target.closest("tr");

        if (row) {
          updateItemFromRow(row);
        }
      }
    );

    elements.itemsBody.addEventListener(
      "change",
      (event) => {
        const row =
          event.target.closest("tr");

        if (row) {
          updateItemFromRow(row);
        }
      }
    );

    elements.search.addEventListener(
      "input",
      applyFilters
    );

    elements.supplierFilter.addEventListener(
      "change",
      applyFilters
    );

    elements.dateFilter.addEventListener(
      "change",
      applyFilters
    );

    elements.resetFilters.addEventListener(
      "click",
      () => {
        elements.search.value = "";
        elements.supplierFilter.value = "";
        elements.dateFilter.value = "";

        applyFilters();
      }
    );

    elements.previousPage.addEventListener(
      "click",
      () => {
        if (state.page > 1) {
          state.page -= 1;
          renderTable();
        }
      }
    );

    elements.nextPage.addEventListener(
      "click",
      () => {
        const totalPages = Math.max(
          1,
          Math.ceil(
            state.filteredReturns.length /
            state.pageSize
          )
        );

        if (state.page < totalPages) {
          state.page += 1;
          renderTable();
        }
      }
    );

    elements.tableBody.addEventListener(
      "click",
      handleTableAction
    );

    elements.closeView.addEventListener(
      "click",
      closeViewModal
    );

    elements.closeViewButton.addEventListener(
      "click",
      closeViewModal
    );

    elements.viewModal.addEventListener(
      "click",
      (event) => {
        if (event.target === elements.viewModal) {
          closeViewModal();
        }
      }
    );

    elements.cancelDeleteButton.addEventListener(
  "click",
  closeDeleteModal
);

elements.confirmDeleteButton.addEventListener(
  "click",
  confirmDeleteReturn
);

elements.deleteModal.addEventListener(
  "click",
  (event) => {
    if (event.target === elements.deleteModal) {
      closeDeleteModal();
    }
  }
);

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") return;

        if (!elements.modal.hidden) {
          closeModal();
        }

        if (!elements.viewModal.hidden) {
          closeViewModal();
        }
      }
    );
  };

  const init = async () => {
    cacheElements();
    bindEvents();

    elements.returnDate.value = today();

    try {
      await loadOptions();
      await loadReturns();
    } catch (error) {
      console.error("[Purchase Return] init:", error);
      showToast(error.message, "error");
    }
  };

  document.addEventListener(
    "DOMContentLoaded",
    init
  );
})();
