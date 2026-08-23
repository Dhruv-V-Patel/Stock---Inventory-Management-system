/* ========================================
   PURCHASE PAGE
======================================== */

const PurchasePage = (() => {
  const state = {
    purchases: [],
    filteredPurchases: [],
    suppliers: [],
    materials: [],
    items: [],
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

  const getToken = () => localStorage.getItem("accessToken");

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

  const vehicleNo = document.getElementById("vehicleNo");

  vehicleNo?.addEventListener("input", (event) => {
    const input = event.target;

    let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (value.length > 2) {
      value = `${value.slice(0, 2)}-${value.slice(2)}`;
    }

    if (value.length > 5) {
      value = `${value.slice(0, 5)}-${value.slice(5)}`;
    }

    if (value.length > 8) {
      value = `${value.slice(0, 8)}-${value.slice(8)}`;
    }

    input.value = value.slice(0, 13);
  });

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

  // const formatDate = (value) => {
  //   if (!value) return "-";

  //   const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  //   if (Number.isNaN(date.getTime())) return String(value);

  //   return new Intl.DateTimeFormat("en-IN", {
  //     day: "2-digit",
  //     month: "short",
  //     year: "numeric",
  //   }).format(date);
  // };

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

  const normalizePurchase = (purchase) => ({
    id: Number(purchase.id),
    purchase_no: purchase.purchase_no ?? "",
    supplier_id: Number(purchase.supplier_id || 0),
    supplier_name: purchase.supplier_name ?? "",
    purchase_date: purchase.purchase_date ?? "",
    invoice_no: purchase.invoice_no ?? "",
    item_count: Number(purchase.item_count || 0),
    total_amount: Number(purchase.total_amount || 0),
    purchase_return_amount: Number(purchase.purchase_return_amount || 0),
    net_purchase_amount: Number(purchase.net_purchase_amount ?? purchase.total_amount ?? 0),
    payment_status: purchase.payment_status ?? "PENDING",
  });

  const loadOptions = async () => {
    const payload = await apiRequest("/api/purchases/options");

    state.suppliers = Array.isArray(payload?.suppliers)
      ? payload.suppliers
      : [];

    state.materials = Array.isArray(payload?.rawMaterials)
      ? payload.rawMaterials
      : [];

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

  const updateSummary = (purchases) => {
    const total = purchases.length;
    // const value = purchases.reduce(
    //   (sum, purchase) => sum + purchase.total_amount,
    //   0,
    // );
   
    const value = purchases.reduce(
      (sum, purchase) => sum + purchase.net_purchase_amount,
      0,
    );

    const pending = purchases.filter(
      (purchase) => purchase.payment_status === "PENDING",
    ).length;

    const monthKey = today().slice(0, 7);
    const monthCount = purchases.filter(
      (purchase) => String(purchase.purchase_date).slice(0, 7) === monthKey,
    ).length;

    elements.totalPurchases.textContent = total.toLocaleString("en-IN");
    elements.totalPurchaseValue.textContent = formatCurrency(value);
    elements.pendingPurchases.textContent = pending.toLocaleString("en-IN");
    elements.monthPurchases.textContent = monthCount.toLocaleString("en-IN");
  };

  const renderLoading = () => {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="purchases-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading purchases...
          </div>
        </td>
      </tr>
    `;
    elements.empty.hidden = true;
  };

  const renderTable = () => {
    const rows = state.filteredPurchases;

    if (!rows.length) {
      elements.tableBody.innerHTML = "";
      elements.empty.hidden = false;
      elements.count.textContent = "Showing 0 purchases";
      updatePagination();
      return;
    }

    elements.empty.hidden = true;

    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));

    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);

    elements.tableBody.innerHTML = pageRows
      .map(
        (purchase) => `
      <tr>
        <td>
          <span class="purchase-number">
            ${escapeHtml(purchase.purchase_no)}
          </span>
        </td>

        <td>
          <span class="supplier-name">
            ${escapeHtml(purchase.supplier_name || "—")}
          </span>
        </td>

        <td>
          <span class="purchase-date">
            ${escapeHtml(formatDate(purchase.purchase_date))}
          </span>
        </td>

        <td>
          <span class="invoice-number">
            ${escapeHtml(purchase.invoice_no || "—")}
          </span>
        </td>

        <td>
          <span class="item-count">
            ${formatNumber(purchase.item_count)}
          </span>
        </td>

        <td>
          <span class="purchase-amount">
            ${formatCurrency(purchase.total_amount)}
          </span>
        </td>

        <td>
          <span class="purchase-return-amount">
            ${formatCurrency(purchase.purchase_return_amount)}
          </span>
        </td>

        <td>
          <span class="purchase-net-amount">
            ${formatCurrency(purchase.net_purchase_amount)}
          </span>
        </td>
        <td>
          <span class="payment-badge ${purchase.payment_status.toLowerCase()}">
            ${purchase.payment_status}
          </span>
        </td>

        <td class="action-column">
          <div class="purchase-actions">
            <button class="table-action"
                    type="button"
                    data-action="view"
                    data-id="${purchase.id}"
                    title="View purchase">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button
                  class="table-action"
                  type="button"
                  data-action="edit"
                  data-id="${purchase.id}"
                  title="Edit Purchase"
                  aria-label="Edit Purchase">
                  <i class="fa-solid fa-pen"></i>
                </button>

            <button class="table-action danger"
                    type="button"
                    data-action="delete"
                    data-id="${purchase.id}"
                    title="Delete purchase">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `,
      )
      .join("");

    elements.count.textContent = `Showing ${start + 1}-${Math.min(start + pageRows.length, rows.length)} of ${rows.length} purchases`;

    updatePagination();
  };

  const updatePagination = () => {
    const totalPages = Math.max(
      1,
      Math.ceil(state.filteredPurchases.length / state.pageSize),
    );

    elements.pageNumber.textContent = String(state.page);
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= totalPages;
  };

  const applyFilters = () => {
    const search = elements.search.value.trim().toLowerCase();
    const paymentStatus = elements.paymentStatusFilter.value;
    const date = elements.dateFilter.value;

    state.filteredPurchases = state.purchases.filter((purchase) => {
      const matchesSearch =
        !search ||
        purchase.purchase_no.toLowerCase().includes(search) ||
        purchase.supplier_name.toLowerCase().includes(search) ||
        purchase.invoice_no.toLowerCase().includes(search);

      const matchesPayment =
        !paymentStatus || purchase.payment_status === paymentStatus;

      const matchesDate =
        !date || String(purchase.purchase_date).slice(0, 10) === date;

      return matchesSearch && matchesPayment && matchesDate;
    });

    state.page = 1;
    renderTable();
  };

  const loadPurchases = async () => {
    renderLoading();

    try {
      const payload = await apiRequest("/api/purchases");

      const rows = Array.isArray(payload)
        ? payload
        : payload?.purchases || payload?.data || [];

      state.purchases = rows.map(normalizePurchase);
      updateSummary(state.purchases);
      applyFilters();
    } catch (error) {
      console.error("[Purchase] load error:", error);

      elements.tableBody.innerHTML = `
        <tr>
          <td colspan="10">
            <div class="purchases-loading">
              <i class="fa-solid fa-triangle-exclamation"></i>
              ${escapeHtml(error.message)}
            </div>
          </td>
        </tr>
      `;

      updateSummary([]);
    }
  };

  const resetForm = () => {
    state.editingId = null;
    elements.form.reset();
    elements.purchaseDate.value = today();
    elements.paymentStatus.value = "PENDING";
    elements.discount.value = "0";
    elements.taxAmount.value = "0";
    elements.freightAmount.value = "0";
    elements.itemsBody.innerHTML = "";
    elements.itemsError.textContent = "";
    state.items = [];
    if (elements.modalTitle) elements.modalTitle.textContent = "Add Purchase";
    if (elements.savePurchase)
      elements.savePurchase.querySelector("span").textContent = "Save Purchase";
    updateTotal();
  };

  const openModal = () => {
    resetForm();
    addItem();
    elements.modal.hidden = false;
    elements.modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => elements.supplierId?.focus());
  };

  const populateEditForm = (purchase) => {
    state.editingId = Number(purchase.id);
    elements.supplierId.value = String(purchase.supplier_id || "");
    elements.purchaseDate.value = String(purchase.purchase_date || "").slice(0,10);
    elements.invoiceNo.value = purchase.invoice_no || "";
    elements.invoiceDate.value = purchase.invoice_date
      ? String(purchase.invoice_date).slice(0, 10)
      : "";
    elements.vehicleNo.value = purchase.vehicle_no || "";
    elements.driverName.value = purchase.driver_name || "";
    elements.driverMobile.value = purchase.driver_mobile || "";
    elements.discount.value = Number(purchase.discount || 0);
    elements.taxAmount.value = Number(purchase.tax_amount || 0);
    elements.freightAmount.value = Number(purchase.freight_amount || 0);
    elements.paymentStatus.value = purchase.payment_status || "PENDING";
    elements.remarks.value = purchase.remarks || "";
    state.items = (purchase.items || []).map((item) => ({
      uid: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      raw_material_id: String(item.raw_material_id || ""),
      unit: item.unit || "",
      quantity: item.quantity ?? "",
      rate: item.rate ?? "",
    }));
    if (!state.items.length) addItem();
    else {
      renderItems();
      updateTotal();
    }
    if (elements.modalTitle)
      elements.modalTitle.textContent = `Edit Purchase ${purchase.purchase_no || ""}`;
    if (elements.savePurchase)
      elements.savePurchase.querySelector("span").textContent =
        "Update Purchase";
    elements.modal.hidden = false;
    elements.modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => elements.supplierId?.focus());
  };

  const openEdit = async (id) => {
    resetForm();
    elements.modal.hidden = false;
    elements.modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    elements.itemsBody.innerHTML = `<tr><td colspan="6"><div class="purchases-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading purchase...</div></td></tr>`;
    try {
      const payload = await apiRequest(`/api/purchases/${id}`);
      if (!payload?.purchase) throw new Error("Purchase not found.");
      populateEditForm(payload.purchase);
    } catch (error) {
      console.error("[Purchase] edit load error:", error);
      closeModal();
      showToast(error.message, "error");
    }
  };

  const closeModal = () => {
    elements.modal.hidden = true;
    document.body.style.overflow = "";
  };

  const addItem = () => {
    state.items.push({
      uid: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      raw_material_id: "",
      unit: "",
      quantity: "",
      rate: "",
    });

    renderItems();
  };

  const removeItem = (uid) => {
    state.items = state.items.filter((item) => item.uid !== uid);

    if (!state.items.length) {
      addItem();
      return;
    }

    renderItems();
  };

  const renderItems = () => {
    elements.itemsBody.innerHTML = state.items
      .map(
        (item) => `
      <tr data-uid="${item.uid}">
        <td>
          <select data-field="raw_material_id" required>
            <option value="">Select Material</option>
            ${state.materials
              .map(
                (material) => `
              <option value="${material.id}"
                      ${String(item.raw_material_id) === String(material.id) ? "selected" : ""}>
                ${escapeHtml(material.code)} — ${escapeHtml(material.name)}
              </option>
            `,
              )
              .join("")}
          </select>
        </td>

        <td>
          <span class="item-unit">${escapeHtml(item.unit || "—")}</span>
        </td>

        <td>
          <input data-field="quantity"
                 type="number"
                 min="0.001"
                 step="0.001"
                 value="${escapeHtml(item.quantity)}"
                 placeholder="0.000">
        </td>

        <td>
          <input data-field="rate"
                 type="number"
                 min="0"
                 step="0.01"
                 value="${escapeHtml(item.rate)}"
                 placeholder="0.00">
        </td>

        <td>
          <span class="item-amount">
            ${formatCurrency(
              Number(item.quantity || 0) * Number(item.rate || 0),
            )}
          </span>
        </td>

        <td>
          <button class="remove-item"
                  type="button"
                  data-action="remove-item"
                  data-uid="${item.uid}"
                  title="Remove item">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `,
      )
      .join("");
  };

  const updateItemFromRow = (row) => {
    const uid = row.dataset.uid;
    const item = state.items.find((entry) => entry.uid === uid);

    if (!item) return;

    const materialId = row.querySelector(
      '[data-field="raw_material_id"]',
    ).value;
    const quantity = row.querySelector('[data-field="quantity"]').value;
    const rate = row.querySelector('[data-field="rate"]').value;

    item.raw_material_id = materialId;
    item.quantity = quantity;
    item.rate = rate;

    const material = state.materials.find(
      (entry) => String(entry.id) === String(materialId),
    );

    item.unit = material?.unit || "";

    const amount = row.querySelector(".item-amount");
    if (amount) {
      amount.textContent = formatCurrency(
        Number(quantity || 0) * Number(rate || 0),
      );
    }

    const unit = row.querySelector(".item-unit");
    if (unit) {
      unit.textContent = material?.unit || "—";
    }

    updateTotal();
  };

  const updateTotal = () => {
    const subtotal = state.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
      0,
    );

    const discount = Math.max(0, Number(elements.discount.value || 0));
    const tax = Math.max(0, Number(elements.taxAmount.value || 0));
    const freight = Math.max(0, Number(elements.freightAmount.value || 0));

    const total = Math.max(0, subtotal - discount + tax + freight);

    elements.grandTotal.textContent = formatCurrency(total);
  };

  const validateForm = () => {
    document.querySelectorAll(".form-error").forEach((element) => {
      element.textContent = "";
    });

    elements.itemsError.textContent = "";

    let valid = true;

    if (!elements.supplierId.value) {
      document.querySelector('[data-error-for="supplier"]').textContent =
        "Supplier is required.";
      valid = false;
    }

    if (!elements.purchaseDate.value) {
      document.querySelector('[data-error-for="date"]').textContent =
        "Purchase date is required.";
      valid = false;
    }

    if (!state.items.length) {
      elements.itemsError.textContent = "Add at least one purchase item.";
      return false;
    }

    const seen = new Set();

    state.items.forEach((item) => {
      const id = String(item.raw_material_id);

      if (!item.raw_material_id) {
        valid = false;
      }

      if (!Number(item.quantity) || Number(item.quantity) <= 0) {
        valid = false;
      }

      if (Number(item.rate) < 0 || item.rate === "") {
        valid = false;
      }

      if (seen.has(id) && id !== "") {
        valid = false;
        elements.itemsError.textContent =
          "The same raw material cannot be added more than once.";
      }

      if (id !== "") {
        seen.add(id);
      }
    });

    if (!valid && !elements.itemsError.textContent) {
      elements.itemsError.textContent =
        "Please select valid materials, quantities and rates.";
    }

    return valid;
  };

  const getPayload = () => ({
    supplier_id: Number(elements.supplierId.value),
    purchase_date: elements.purchaseDate.value,
    invoice_no: elements.invoiceNo.value.trim() || null,
    invoice_date: elements.invoiceDate.value || null,
    vehicle_no: elements.vehicleNo.value.trim() || null,
    driver_name: elements.driverName.value.trim() || null,
    driver_mobile: elements.driverMobile.value.trim() || null,
    discount: Number(elements.discount.value || 0),
    tax_amount: Number(elements.taxAmount.value || 0),
    freight_amount: Number(elements.freightAmount.value || 0),
    payment_status: elements.paymentStatus.value,
    remarks: elements.remarks.value.trim() || null,
    items: state.items.map((item) => ({
      raw_material_id: Number(item.raw_material_id),
      quantity: Number(item.quantity),
      rate: Number(item.rate),
    })),
  });

  const savePurchase = async (event) => {
    event.preventDefault();
    if (!validateForm()) return;
    const button = elements.savePurchase;
    const isEdit = Number.isInteger(state.editingId) && state.editingId > 0;
    button.disabled = true;
    button.querySelector("span").textContent = isEdit
      ? "Updating..."
      : "Saving...";
    try {
      const payload = await apiRequest(
        isEdit ? `/api/purchases/${state.editingId}` : "/api/purchases",
        {
          method: isEdit ? "PUT" : "POST",
          body: JSON.stringify(getPayload()),
        },
      );
      closeModal();
      showToast(
        isEdit
          ? `Purchase ${payload?.purchase?.purchase_no || ""} updated. Raw material stock movement updated.`
          : `Purchase ${payload?.purchase?.purchase_no || ""} saved. Raw material stock updated.`,
      );
      await loadPurchases();
    } catch (error) {
      console.error(`[Purchase] ${isEdit ? "update" : "save"} error:`, error);
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
      button.querySelector("span").textContent = isEdit
        ? "Update Purchase"
        : "Save Purchase";
    }
  };

  const openView = async (id) => {
    elements.viewModal.hidden = false;
    document.body.style.overflow = "hidden";

    elements.details.innerHTML = `
      <div class="purchases-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Loading purchase...
      </div>
    `;

    try {
      const payload = await apiRequest(`/api/purchases/${id}`);
      const purchase = payload?.purchase;

      if (!purchase) {
        throw new Error("Purchase not found.");
      }

      elements.viewTitle.textContent = purchase.purchase_no;
      elements.viewSubtitle.textContent =
        purchase.supplier_name || "Purchase details";

      elements.details.innerHTML = `
        <div class="details-grid">
          <div class="detail-box">
            <span>Supplier</span>
            <strong>${escapeHtml(purchase.supplier_name)}</strong>
          </div>

          <div class="detail-box">
            <span>Purchase Date</span>
            <strong>${escapeHtml(formatDate(purchase.purchase_date))}</strong>
          </div>

          <div class="detail-box">
            <span>Invoice No.</span>
            <strong>${escapeHtml(purchase.invoice_no || "—")}</strong>
          </div>

          <div class="detail-box">
            <span>Payment</span>
            <strong>${escapeHtml(purchase.payment_status)}</strong>
          </div>
        </div>

        <div class="details-items">
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Unit</th>
                <th>Qty</th>
                <th>Return Qty</th>
                <th>Remaining</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Return</th>
                <th>Net Amount</th>
              </tr>
            </thead>
            <tbody>
              ${(purchase.items || [])
                .map(
                  (item) => `
               <tr>
  <td>
    <strong>${escapeHtml(item.material_name)}</strong>
    <small>${escapeHtml(item.material_code || "")}</small>
  </td>

  <td>
    ${escapeHtml(item.unit)}
  </td>

  <td>
    ${formatNumber(item.quantity)}
  </td>

  <td class="purchase-return-qty">
    ${
      Number(item.returned_quantity || 0) > 0
        ? formatNumber(item.returned_quantity)
        : "—"
    }
  </td>

  <td>
    ${formatNumber(item.remaining_quantity)}
  </td>

  <td>
    ${formatCurrency(item.rate)}
  </td>

  <td>
    ${formatCurrency(item.amount)}
  </td>

  <td class="purchase-return-amount">
    ${
      Number(item.returned_amount || 0) > 0
        ? `- ${formatCurrency(item.returned_amount)}`
        : "—"
    }
  </td>

  <td>
    <strong>
      ${formatCurrency(item.net_amount)}
    </strong>
  </td>
</tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <div class="details-total">
          <span>Subtotal: ${formatCurrency(purchase.subtotal)}</span>
          <span>Discount: ${formatCurrency(purchase.discount)}</span>
          <span>Tax: ${formatCurrency(purchase.tax_amount)}</span>
          <span>Freight: ${formatCurrency(purchase.freight_amount)}</span>
          <strong>Total: ${formatCurrency(purchase.total_amount)}</strong>
          <span class="purchase-return-total">
            Purchase Return:
            ${
              Number(purchase.purchase_return_amount || 0) > 0
                ? `- ${formatCurrency(purchase.purchase_return_amount)}`
                : formatCurrency(0)
            }
          </span>

          <strong>
            Net Total:
            ${formatCurrency(purchase.net_purchase_amount)}
          </strong>
        </div>
      `;
    } catch (error) {
      elements.details.innerHTML = `
        <div class="purchases-loading">
          <i class="fa-solid fa-triangle-exclamation"></i>
          ${escapeHtml(error.message)}
        </div>
      `;
    }
  };

  const closeView = () => {
    elements.viewModal.hidden = true;
    document.body.style.overflow = "";
  };

  // const deletePurchase = async (id) => {
  //   const purchase = state.purchases.find(
  //     (item) => Number(item.id) === Number(id)
  //   );

  //   if (!purchase) return;

  //   const confirmed = window.confirm(
  //     `Delete ${purchase.purchase_no}?\n\nThis will remove its purchase record and reverse the related RAW_MATERIAL stock IN movement.`
  //   );

  //   if (!confirmed) return;

  //   try {
  //     await apiRequest(`/api/purchases/${id}`, {
  //       method: "DELETE",
  //     });

  //     showToast("Purchase deleted and stock movement reversed.");
  //     await loadPurchases();
  //   } catch (error) {
  //     console.error("[Purchase] delete error:", error);
  //     showToast(error.message, "error");
  //   }
  // };

  const openDeleteModal = (id) => {
    const purchase = state.purchases.find(
      (item) => Number(item.id) === Number(id),
    );

    if (!purchase) {
      showToast("Purchase not found.", "error");
      return;
    }

    state.deletingId = Number(id);

    elements.deleteMessage.textContent = `Delete ${purchase.purchase_no}? This will remove the purchase record and reverse the related RAW_MATERIAL stock IN movement.`;

    elements.confirmDeleteButton.disabled = false;
    elements.confirmDeleteButton.innerHTML = `
    <i class="fa-solid fa-trash-can"></i>
    Delete
  `;

    elements.deleteModal.hidden = false;
    elements.deleteModal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";
  };

  const confirmDeletePurchase = async () => {
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

      await apiRequest(`/api/purchases/${id}`, {
        method: "DELETE",
      });

      closeDeleteModal();

      showToast("Purchase deleted and stock movement reversed.");

      await loadPurchases();
    } catch (error) {
      console.error("[Purchase] delete error:", error);

      elements.confirmDeleteButton.disabled = false;

      elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-trash-can"></i>
      Delete
    `;

      showToast(error.message || "Unable to delete purchase.", "error");
    }
  };

  const closeDeleteModal = () => {
    elements.deleteModal.hidden = true;
    elements.deleteModal.setAttribute("aria-hidden", "true");

    state.deletingId = null;

    document.body.style.overflow = "";
  };

  const handleTableAction = (event) => {
    const button = event.target.closest("[data-action]");
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
    // ========================================
    // PURCHASE MODAL
    // ========================================

    if (elements.addButton) {
      elements.addButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        openModal();
      });
    }

    if (elements.emptyAdd) {
      elements.emptyAdd.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        openModal();
      });
    }

    if (elements.closeModal) {
      elements.closeModal.addEventListener("click", (event) => {
        event.preventDefault();
        closeModal();
      });
    }

    if (elements.cancel) {
      elements.cancel.addEventListener("click", (event) => {
        event.preventDefault();
        closeModal();
      });
    }

    if (elements.modal) {
      elements.modal.addEventListener("click", (event) => {
        if (event.target === elements.modal) {
          closeModal();
        }
      });
    }

    // ========================================
    // PURCHASE FORM
    // ========================================

    if (elements.form) {
      elements.form.addEventListener("submit", savePurchase);
    }

    if (elements.addItem) {
      elements.addItem.addEventListener("click", (event) => {
        event.preventDefault();
        addItem();
      });
    }

    if (elements.itemsBody) {
      elements.itemsBody.addEventListener("change", (event) => {
        const row = event.target.closest("tr");

        if (row) {
          updateItemFromRow(row);
        }
      });

      elements.itemsBody.addEventListener("input", (event) => {
        const row = event.target.closest("tr");

        if (row) {
          updateItemFromRow(row);
        }
      });

      elements.itemsBody.addEventListener("click", (event) => {
        const button = event.target.closest('[data-action="remove-item"]');

        if (button) {
          removeItem(button.dataset.uid);
        }
      });
    }

    // ========================================
    // TOTAL CALCULATION
    // ========================================

    [elements.discount, elements.taxAmount, elements.freightAmount].forEach(
      (input) => {
        if (input) {
          input.addEventListener("input", updateTotal);
        }
      },
    );

    // ========================================
    // FILTERS
    // ========================================

    if (elements.search) {
      elements.search.addEventListener("input", applyFilters);
    }

    if (elements.paymentStatusFilter) {
      elements.paymentStatusFilter.addEventListener("change", applyFilters);
    }

    if (elements.dateFilter) {
      elements.dateFilter.addEventListener("change", applyFilters);
    }

    if (elements.resetFilters) {
      elements.resetFilters.addEventListener("click", () => {
        elements.search.value = "";
        elements.paymentStatusFilter.value = "";
        elements.dateFilter.value = "";

        applyFilters();
      });
    }

    // ========================================
    // PAGINATION
    // ========================================

    if (elements.previousPage) {
      elements.previousPage.addEventListener("click", () => {
        if (state.page > 1) {
          state.page -= 1;
          renderTable();
        }
      });
    }

    if (elements.nextPage) {
      elements.nextPage.addEventListener("click", () => {
        const totalPages = Math.max(
          1,
          Math.ceil(state.filteredPurchases.length / state.pageSize),
        );

        if (state.page < totalPages) {
          state.page += 1;
          renderTable();
        }
      });
    }

    // ========================================
    // TABLE ACTIONS
    // ========================================

    if (elements.tableBody) {
      elements.tableBody.addEventListener("click", handleTableAction);
    }

    // ========================================
    // VIEW MODAL
    // ========================================

    if (elements.closeView) {
      elements.closeView.addEventListener("click", closeView);
    }

    if (elements.closeViewButton) {
      elements.closeViewButton.addEventListener("click", closeView);
    }

    if (elements.viewModal) {
      elements.viewModal.addEventListener("click", (event) => {
        if (event.target === elements.viewModal) {
          closeView();
        }
      });
    }

    // ========================================
    // DELETE MODAL
    // ========================================

    if (elements.cancelDeleteButton) {
      elements.cancelDeleteButton.addEventListener("click", closeDeleteModal);
    }

    if (elements.confirmDeleteButton) {
      elements.confirmDeleteButton.addEventListener(
        "click",
        confirmDeletePurchase,
      );
    }

    if (elements.deleteModal) {
      elements.deleteModal.addEventListener("click", (event) => {
        if (event.target === elements.deleteModal) {
          closeDeleteModal();
        }
      });
    }

    // ========================================
    // ESCAPE KEY
    // ========================================

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (elements.deleteModal && !elements.deleteModal.hidden) {
        closeDeleteModal();
        return;
      }

      if (elements.modal && !elements.modal.hidden) {
        closeModal();
      }

      if (elements.viewModal && !elements.viewModal.hidden) {
        closeView();
      }
    });
  };
  const cacheElements = () => {
    elements.addButton = qs("#addPurchaseButton");
    elements.emptyAdd = qs("#emptyAddPurchase");

    elements.totalPurchases = qs("#totalPurchases");
    elements.totalPurchaseValue = qs("#totalPurchaseValue");
    elements.pendingPurchases = qs("#pendingPurchases");
    elements.monthPurchases = qs("#monthPurchases");

    elements.search = qs("#purchaseSearch");
    elements.paymentStatusFilter = qs("#paymentStatusFilter");
    elements.dateFilter = qs("#purchaseDateFilter");
    elements.resetFilters = qs("#resetFilters");

    elements.tableBody = qs("#purchasesTableBody");
    elements.empty = qs("#purchasesEmpty");
    elements.count = qs("#purchasesCount");

    elements.previousPage = qs("#previousPage");
    elements.nextPage = qs("#nextPage");
    elements.pageNumber = qs("#pageNumber");

    elements.modal = qs("#purchaseModal");
    elements.closeModal = qs("#closePurchaseModal");
    elements.cancel = qs("#cancelPurchase");
    elements.form = qs("#purchaseForm");
    elements.modalTitle = qs("#purchaseModalTitle");

    elements.supplierId = qs("#supplierId");
    elements.purchaseDate = qs("#purchaseDate");
    elements.invoiceNo = qs("#invoiceNo");
    elements.invoiceDate = qs("#invoiceDate");
    elements.vehicleNo = qs("#vehicleNo");
    elements.driverName = qs("#driverName");
    elements.driverMobile = qs("#driverMobile");
    elements.paymentStatus = qs("#paymentStatus");

    elements.itemsBody = qs("#purchaseItemsBody");
    elements.itemsError = qs("#itemsError");
    elements.addItem = qs("#addItemButton");

    elements.discount = qs("#discount");
    elements.taxAmount = qs("#taxAmount");
    elements.freightAmount = qs("#freightAmount");
    elements.grandTotal = qs("#grandTotal");
    elements.remarks = qs("#remarks");

    elements.savePurchase = qs("#savePurchase");

    elements.viewModal = qs("#viewPurchaseModal");
    elements.closeViewButton = qs("#closeViewPurchaseModal");
    elements.closeView = qs("#closeViewPurchase");
    elements.viewTitle = qs("#viewPurchaseTitle");
    elements.viewSubtitle = qs("#viewPurchaseSubtitle");
    elements.details = qs("#purchaseDetailsContent");

    elements.deleteModal = qs("#deleteModal");
    elements.deleteMessage = qs("#deleteMessage");
    elements.cancelDeleteButton = qs("#cancelDeleteButton");
    elements.confirmDeleteButton = qs("#confirmDeleteButton");

    elements.toastContainer = qs("#toastContainer");
  };

  const init = async () => {
    cacheElements();
    bindEvents();

    try {
      await loadOptions();
      await loadPurchases();
    } catch (error) {
      console.error("[Purchase] initialization error:", error);
      showToast(error.message, "error");
    }
  };

  return { init };
})();

const initPurchasePage = () => PurchasePage.init();
