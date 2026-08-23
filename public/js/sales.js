const SalesPage = (() => {
  const state = {
    sales: [],
    filteredSales: [],
    customers: [],
    products: [],
    items: [],
    page: 1,
    pageSize: 10,
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

  const today = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
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

  const validateItemQuantity = (row) => {
    const quantityInput = row.querySelector('[data-field="quantity"]');

    if (!quantityInput) return true;

    const uid = row.dataset.uid;

    const item = state.items.find((entry) => entry.uid === uid);

    if (!item) return true;

    const quantity = Number(quantityInput.value || 0);
    const available = getAvailableForRow(item);

    const exceeded = quantity > available;

    quantityInput.classList.toggle("stock-exceeded", exceeded);

    return !exceeded;
  };

  const normalizeSale = (sale) => ({
    id: Number(sale.id),
    sale_no: sale.sale_no ?? "",
    customer_id: Number(sale.customer_id || 0),
    customer_name: sale.customer_name ?? "",
    customer_mobile: sale.customer_mobile ?? "",
    sale_date: sale.sale_date ?? "",
    item_count: Number(sale.item_count || 0),
    total_amount: Number(sale.total_amount || 0),
    return_amount: Number(sale.return_amount || 0),
    net_total: Number(
      sale.net_total ??
        Number(sale.total_amount || 0) - Number(sale.return_amount || 0),
    ),
    payment_status: sale.payment_status ?? "PENDING",
  });

  const normalizeOptionProduct = (product) => ({
    id: Number(product.id),
    code: product.code ?? "",
    name: product.name ?? "",
    unit: product.unit ?? "PCS",
    selling_rate: Number(product.selling_rate || 0),
    current_stock: Number(product.current_stock || 0),
  });

  const loadOptions = async () => {
    const payload = await apiRequest("/api/sales/options");

    state.customers = Array.isArray(payload?.customers)
      ? payload.customers
      : [];

    state.products = Array.isArray(payload?.products)
      ? payload.products.map(normalizeOptionProduct)
      : [];

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
  };

  const updateSummary = (sales) => {
    const total = sales.length;

    const value = sales.reduce(
      (sum, sale) => sum + Number(sale.net_total || 0),
      0,
    );

    const pending = sales.filter(
      (sale) => sale.payment_status === "PENDING",
    ).length;

    const monthKey = today().slice(0, 7);

    const monthCount = sales.filter(
      (sale) => String(sale.sale_date).slice(0, 7) === monthKey,
    ).length;

    elements.totalSales.textContent = total.toLocaleString("en-IN");

    elements.totalSalesValue.textContent = formatCurrency(value);

    elements.pendingSales.textContent = pending.toLocaleString("en-IN");

    elements.monthSales.textContent = monthCount.toLocaleString("en-IN");
  };

  const renderLoading = () => {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="sales-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading sales...
          </div>
        </td>
      </tr>
    `;

    elements.empty.hidden = true;
  };

  const renderTable = () => {
    const rows = state.filteredSales;

    if (!rows.length) {
      elements.tableBody.innerHTML = "";
      elements.empty.hidden = false;
      elements.count.textContent = "Showing 0 sales";
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
        (sale) => `
          <tr>
            <td>
              <span class="sale-number">
                ${escapeHtml(sale.sale_no)}
              </span>
            </td>

            <td>
              <div class="customer-cell">
                <strong>
                  ${escapeHtml(sale.customer_name || "—")}
                </strong>

                ${
                  sale.customer_mobile
                    ? `<small>${escapeHtml(sale.customer_mobile)}</small>`
                    : ""
                }
              </div>
            </td>

            <td>
              ${escapeHtml(formatDate(sale.sale_date))}
            </td>

            <td>
              ${formatNumber(sale.item_count)}
            </td>

            <td>
              <span class="sale-amount">
                ${formatCurrency(sale.total_amount)}
              </span>
            </td>

            <td>
            <span class="sale-return-amount">
              ${formatCurrency(sale.return_amount)}
            </span>
          </td>

          <td>
            <span class="sale-net-amount">
              ${formatCurrency(sale.net_total)}
            </span>
          </td>

            <td>
              <span class="payment-badge ${sale.payment_status.toLowerCase()}">
                ${escapeHtml(sale.payment_status)}
              </span>
            </td>

            <td class="action-column">
              <div class="sale-actions">

                <button
                  class="table-action"
                  type="button"
                  data-action="view"
                  data-id="${sale.id}"
                  title="View sale"
                  aria-label="View sale">
                  <i class="fa-solid fa-eye"></i>
                </button>

                <button
                  class="table-action"
                  type="button"
                  data-action="edit"
                  data-id="${sale.id}"
                  title="Edit sale"
                  aria-label="Edit sale">
                  <i class="fa-solid fa-pen"></i>
                </button>

                <button
                  class="table-action danger"
                  type="button"
                  data-action="delete"
                  data-id="${sale.id}"
                  title="Delete sale"
                  aria-label="Delete sale">
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
    )} of ${rows.length} sales`;

    updatePagination();
  };

  const updatePagination = () => {
    const totalPages = Math.max(
      1,
      Math.ceil(state.filteredSales.length / state.pageSize),
    );

    elements.pageNumber.textContent = String(state.page);

    elements.previousPage.disabled = state.page <= 1;

    elements.nextPage.disabled = state.page >= totalPages;
  };

  const applyFilters = () => {
    const search = elements.search.value.trim().toLowerCase();

    const paymentStatus = elements.paymentStatusFilter.value;

    const date = elements.dateFilter.value;

    state.filteredSales = state.sales.filter((sale) => {
      const haystack = [sale.sale_no, sale.customer_name, sale.customer_mobile]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !search || haystack.includes(search);

      const matchesPayment =
        !paymentStatus || sale.payment_status === paymentStatus;

      const matchesDate = !date || String(sale.sale_date).slice(0, 10) === date;

      return matchesSearch && matchesPayment && matchesDate;
    });

    state.page = 1;
    renderTable();
  };

  const loadSales = async () => {
    renderLoading();

    try {
      const payload = await apiRequest("/api/sales");

      const rows = Array.isArray(payload)
        ? payload
        : payload?.sales || payload?.data || [];

      state.sales = rows.map(normalizeSale);

      updateSummary(state.sales);
      applyFilters();
    } catch (error) {
      console.error("[Sales] load error:", error);

      elements.tableBody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="sales-loading sales-error">
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
    elements.form.reset();

    elements.saleDate.value = today();
    elements.paymentStatus.value = "PENDING";
    elements.discount.value = "0";
    elements.taxAmount.value = "0";

    elements.itemsBody.innerHTML = "";
    elements.itemsError.textContent = "";

    state.items = [];
    state.editingId = null;

    elements.modalTitle.textContent = "New Sale";
    elements.modalDescription.textContent =
      "Sell finished products and automatically reduce finished stock.";

    elements.saveSale.querySelector("span").textContent = "Save Sale";

    updateTotal();
  };

  const openModal = (sale = null) => {
    resetForm();

    if (sale) {
      state.editingId = sale.id;

      elements.modalTitle.textContent = "Edit Sale";

      elements.modalDescription.textContent =
        "Update the sale. Stock will be reconciled automatically.";

      elements.saveSale.querySelector("span").textContent = "Update Sale";

      loadSaleForEdit(sale.id);
    } else {
      addItem();
    }

    elements.modal.hidden = false;
    elements.modal.removeAttribute("hidden");

    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      elements.customerId?.focus();
    });
  };

  const closeModal = () => {
    elements.modal.hidden = true;
    document.body.style.overflow = "";
    resetForm();
  };

  const getProduct = (productId) =>
    state.products.find((product) => String(product.id) === String(productId));

  const addItem = (data = {}) => {
    state.items.push({
      uid: data.uid || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      product_id: data.product_id ? String(data.product_id) : "",
      quantity: data.quantity !== undefined ? String(data.quantity) : "",
      rate: data.rate !== undefined ? String(data.rate) : "",
      original_quantity:
        data.original_quantity !== undefined
          ? Number(data.original_quantity)
          : 0,
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

  const getAvailableForRow = (item) => {
    const product = getProduct(item.product_id);

    if (!product) return 0;

    return (
      Number(product.current_stock || 0) + Number(item.original_quantity || 0)
    );
  };

  const renderItems = () => {
    elements.itemsBody.innerHTML = state.items
      .map((item) => {
        const product = getProduct(item.product_id);

        const available = getAvailableForRow(item);

        const rate =
          item.rate !== "" ? item.rate : (product?.selling_rate ?? "");

        if (item.rate === "" && product?.selling_rate !== undefined) {
          item.rate = String(product.selling_rate);
        }

        const amount = Number(item.quantity || 0) * Number(item.rate || 0);

        return `
          <tr data-uid="${escapeHtml(item.uid)}">

            <td>
              <select
                data-field="product_id"
                required>
                <option value="">
                  Select Product
                </option>

                ${state.products
                  .map((entry) => {
                    const optionAvailable =
                      Number(entry.current_stock || 0) +
                      (String(entry.id) === String(item.product_id)
                        ? Number(item.original_quantity || 0)
                        : 0);

                    return `
                        <option
                          value="${entry.id}"
                          ${
                            String(item.product_id) === String(entry.id)
                              ? "selected"
                              : ""
                          }>
                          ${escapeHtml(entry.code)}
                          — ${escapeHtml(entry.name)}
                          (${formatNumber(optionAvailable)} ${escapeHtml(entry.unit)})
                        </option>
                      `;
                  })
                  .join("")}
              </select>
            </td>

            <td>
              <span class="stock-value">
                ${formatNumber(available)}
              </span>
            </td>

            <td>
              <span class="item-unit">
                ${escapeHtml(product?.unit || "—")}
              </span>
            </td>

            <td>
              <input
                data-field="quantity"
                type="number"
                min="1"
                step="1"
                value="${escapeHtml(item.quantity)}"
                placeholder="0.00">
            </td>

            <td>
              <input
                data-field="rate"
                type="number"
                min="0"
                step="0.01"
                value="${escapeHtml(rate)}"
                placeholder="0.00">
            </td>

            <td>
              <span class="item-amount">
                ${formatCurrency(amount)}
              </span>
            </td>

            <td>
              <button
                class="remove-item"
                type="button"
                data-action="remove-item"
                data-uid="${escapeHtml(item.uid)}"
                title="Remove item">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>

          </tr>
        `;
      })
      .join("");

    updateTotal();
  };

  const updateItemFromRow = (row) => {
    const uid = row.dataset.uid;

    const item = state.items.find((entry) => entry.uid === uid);

    if (!item) return;

    const productId =
      row.querySelector('[data-field="product_id"]')?.value || "";

    const quantity = row.querySelector('[data-field="quantity"]')?.value || "";

    const rate = row.querySelector('[data-field="rate"]')?.value || "";

    const previousProductId = item.product_id;

    item.product_id = productId;
    item.quantity = quantity;
    item.rate = rate;

    if (previousProductId !== productId) {
      item.original_quantity = 0;
    }

    const product = getProduct(productId);
    const amount = Number(quantity || 0) * Number(rate || 0);

    const available = product ? getAvailableForRow(item) : 0;

    const amountElement = row.querySelector(".item-amount");

    if (amountElement) {
      amountElement.textContent = formatCurrency(amount);
    }

    const unitElement = row.querySelector(".item-unit");

    if (unitElement) {
      unitElement.textContent = product?.unit || "—";
    }

    const stockElement = row.querySelector(".stock-value");

    if (stockElement) {
      stockElement.textContent = formatNumber(available);
    }

    validateItemQuantity(row);

    updateTotal();
  };

  const updateTotal = () => {
    const subtotal = state.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
      0,
    );

    const discount = Math.max(0, Number(elements.discount.value || 0));

    const tax = Math.max(0, Number(elements.taxAmount.value || 0));

    const total = Math.max(0, subtotal - discount + tax);

    elements.grandTotal.textContent = formatCurrency(total);
  };

  const validateForm = () => {
    document.querySelectorAll(".form-error").forEach((element) => {
      element.textContent = "";
    });

    elements.itemsError.textContent = "";

    let valid = true;

    if (!elements.customerId.value) {
      document.querySelector('[data-error-for="customer"]').textContent =
        "Customer is required.";

      valid = false;
    }

    if (!elements.saleDate.value) {
      document.querySelector('[data-error-for="date"]').textContent =
        "Sale date is required.";

      valid = false;
    }

    if (!state.items.length) {
      elements.itemsError.textContent = "Add at least one sale item.";

      return false;
    }

    const seen = new Set();

    for (const item of state.items) {
      const productId = String(item.product_id);

      const quantity = Number(item.quantity);

      const rate = Number(item.rate);

      if (!productId) {
        valid = false;
        continue;
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        valid = false;
      }

      if (!Number.isFinite(rate) || rate < 0) {
        valid = false;
      }

      if (seen.has(productId)) {
        valid = false;
        elements.itemsError.textContent =
          "The same product cannot be added more than once.";
      }

      seen.add(productId);

      const available = getAvailableForRow(item);

      if (Number.isFinite(quantity) && quantity > available) {
        valid = false;
        elements.itemsError.textContent = `Insufficient stock for ${
          getProduct(productId)?.name || "selected product"
        }. Available ${formatNumber(available)}.`;
      }
    }

    if (!valid && !elements.itemsError.textContent) {
      elements.itemsError.textContent =
        "Please select valid products, quantities and rates.";
    }

    return valid;
  };

  const getPayload = () => ({
    customer_id: Number(elements.customerId.value),

    sale_date: elements.saleDate.value,

    vehicle_no: elements.vehicleNo.value.trim() || null,

    driver_name: elements.driverName.value.trim() || null,

    driver_mobile: elements.driverMobile.value.trim() || null,

    discount: Number(elements.discount.value || 0),

    tax_amount: Number(elements.taxAmount.value || 0),

    payment_status: elements.paymentStatus.value,

    remarks: elements.remarks.value.trim() || null,

    items: state.items.map((item) => ({
      product_id: Number(item.product_id),

      quantity: Number(item.quantity),

      rate: Number(item.rate),
    })),
  });

  const saveSale = async (event) => {
    event.preventDefault();

    const stockValid = Array.from(
      elements.itemsBody.querySelectorAll("tr"),
    ).every((row) => validateItemQuantity(row));

    if (!stockValid) {
      showToast("Quantity cannot be greater than available stock.", "error");
      return;
    }

    if (!validateForm()) return;

    const button = elements.saveSale;

    const isEditing = Boolean(state.editingId);

    button.disabled = true;

    button.querySelector("span").textContent = isEditing
      ? "Updating..."
      : "Saving...";

    try {
      const payload = await apiRequest(
        isEditing ? `/api/sales/${state.editingId}` : "/api/sales",
        {
          method: isEditing ? "PUT" : "POST",

          body: JSON.stringify(getPayload()),
        },
      );

      const sale = payload?.sale;

      closeModal();

      showToast(
        isEditing
          ? `Sale ${sale?.sale_no || ""} updated. Stock reconciled.`
          : `Sale ${sale?.sale_no || ""} saved. Finished stock updated.`,
      );

      await Promise.all([loadOptions(), loadSales()]);
    } catch (error) {
      console.error("[Sales] save error:", error);

      showToast(error.message, "error");
    } finally {
      button.disabled = false;

      button.querySelector("span").textContent = isEditing
        ? "Update Sale"
        : "Save Sale";
    }
  };

  const loadSaleForEdit = async (id) => {
    try {
      const payload = await apiRequest(`/api/sales/${id}`);

      const sale = payload?.sale;

      if (!sale) {
        throw new Error("Sale not found.");
      }

      elements.customerId.value = String(sale.customer_id);

      elements.saleDate.value = String(sale.sale_date).slice(0, 10);

      elements.vehicleNo.value = sale.vehicle_no || "";

      elements.driverName.value = sale.driver_name || "";

      elements.driverMobile.value = sale.driver_mobile || "";

      elements.paymentStatus.value = sale.payment_status || "PENDING";

      elements.discount.value = Number(sale.discount || 0);

      elements.taxAmount.value = Number(sale.tax_amount || 0);

      elements.remarks.value = sale.remarks || "";

      state.items = [];

      for (const item of sale.items || []) {
        addItem({
          product_id: item.product_id,

          quantity: item.quantity,

          rate: item.rate,

          original_quantity: item.quantity,
        });
      }

      if (!state.items.length) {
        addItem();
      }

      updateTotal();
    } catch (error) {
      closeModal();
      showToast(error.message, "error");
    }
  };

  const openView = async (id) => {
    elements.viewModal.hidden = false;
    elements.viewModal.removeAttribute("hidden");

    document.body.style.overflow = "hidden";

    elements.details.innerHTML = `
      <div class="sales-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Loading sale...
      </div>
    `;

    try {
      const payload = await apiRequest(`/api/sales/${id}`);

      const sale = payload?.sale;

      if (!sale) {
        throw new Error("Sale not found.");
      }

      elements.viewTitle.textContent = sale.sale_no;

      elements.viewSubtitle.textContent = sale.customer_name || "Sale details";

      elements.details.innerHTML = `
        <div class="details-grid">

          <div class="detail-box">
            <span>Customer</span>
            <strong>
              ${escapeHtml(sale.customer_name)}
            </strong>
          </div>

          <div class="detail-box">
            <span>Sale Date</span>
            <strong>
              ${escapeHtml(formatDate(sale.sale_date))}
            </strong>
          </div>

          <div class="detail-box">
            <span>Payment</span>
            <strong>
              ${escapeHtml(sale.payment_status)}
            </strong>
          </div>

          <div class="detail-box">
            <span>Mobile</span>
            <strong>
              ${escapeHtml(sale.customer_mobile || "—")}
            </strong>
          </div>

          <div class="detail-box">
            <span>Vehicle</span>
            <strong>
              ${escapeHtml(sale.vehicle_no || "—")}
            </strong>
          </div>

          <div class="detail-box">
            <span>Transporter</span>
            <strong>
              ${escapeHtml(sale.driver_name || "—")}
            </strong>
          </div>

        </div>

        <div class="details-items">
          <h3>Products</h3>

          <table>
            <thead>
              <tr>
                <th>Product</th>
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
              ${(sale.items || [])
                .map(
                  (item) => `
                    <tr>
                      <td>
                        <strong>
                          ${escapeHtml(item.product_name)}
                        </strong>
                        <small>
                          ${escapeHtml(item.product_code)}
                        </small>
                      </td>

                      <td>
                        ${escapeHtml(item.unit)}
                      </td>

                     <td>
  ${formatNumber(item.quantity)}
</td>

<td class="sale-return-qty">
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

<td class="sale-return-amount">
  ${
    Number(item.returned_amount || 0) > 0
      ? `-${formatCurrency(item.returned_amount)}`
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

          <span>
            Subtotal:
            ${formatCurrency(sale.subtotal)}
          </span>

          <span>
            Discount:
            ${formatCurrency(sale.discount)}
          </span>

          <span>
            Tax:
            ${formatCurrency(sale.tax_amount)}
          </span>

          <strong>
            Total:
            ${formatCurrency(sale.total_amount)}
          </strong>

          <span class="sale-return-total">
            Sales Return:
            ${
              Number(sale.return_amount || 0) > 0
                ? `- ${formatCurrency(sale.return_amount)}`
                : formatCurrency(0)
            }
          </span>

          <strong class="sale-net-total">
            Net Total:
            ${formatCurrency(sale.net_total)}
          </strong>

        </div>

        ${
          sale.remarks
            ? `
              <div class="sale-remarks">
                <span>Remarks</span>
                <p>
                  ${escapeHtml(sale.remarks)}
                </p>
              </div>
            `
            : ""
        }
      `;
    } catch (error) {
      elements.details.innerHTML = `
        <div class="sales-loading sales-error">
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

  // const deleteSale = async (id) => {
  //   const sale = state.sales.find((item) => Number(item.id) === Number(id));

  //   if (!sale) return;

  //   const confirmed = window.confirm(
  //     `Delete ${sale.sale_no}?\n\n` +
  //       "This will restore the sold quantity to Finished Stock. " +
  //       "Sales with payments, dispatches or returns cannot be deleted.",
  //   );

  //   if (!confirmed) return;

  //   try {
  //     await apiRequest(`/api/sales/${id}`, {
  //       method: "DELETE",
  //     });

  //     showToast(`Sale ${sale.sale_no} deleted. Finished stock restored.`);

  //     await Promise.all([loadOptions(), loadSales()]);
  //   } catch (error) {
  //     console.error("[Sales] delete error:", error);

  //     showToast(error.message, "error");
  //   }
  // };

  const openDeleteModal = (id) => {
    const sale = state.sales.find((item) => Number(item.id) === Number(id));

    if (!sale) {
      showToast("Sale not found.", "error");
      return;
    }

    state.deletingId = Number(id);

    elements.deleteMessage.textContent = `Delete ${sale.sale_no}? This will restore the sold quantity to Finished Stock. Sales with payments, dispatches or returns cannot be deleted.`;

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

  const confirmDeleteSale = async () => {
    const id = state.deletingId;

    if (!id) {
      closeDeleteModal();
      return;
    }

    const sale = state.sales.find((item) => Number(item.id) === Number(id));

    if (!sale) {
      closeDeleteModal();
      showToast("Sale not found.", "error");
      return;
    }

    try {
      elements.confirmDeleteButton.disabled = true;

      elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Deleting...
    `;

      await apiRequest(`/api/sales/${id}`, {
        method: "DELETE",
      });

      closeDeleteModal();

      showToast(`Sale ${sale.sale_no} deleted. Finished stock restored.`);

      await Promise.all([loadOptions(), loadSales()]);
    } catch (error) {
      console.error("[Sales] delete error:", error);

      elements.confirmDeleteButton.disabled = false;

      elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-trash-can"></i>
      Delete
    `;

      showToast(error.message || "Unable to delete sale.", "error");
    }
  };

  const handleTableAction = (event) => {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const id = Number(button.dataset.id);

    const action = button.dataset.action;

    const sale = state.sales.find((item) => Number(item.id) === id);

    if (!sale) return;

    if (action === "view") {
      openView(id);
      return;
    }

    if (action === "edit") {
      openModal(sale);
      return;
    }

    if (action === "delete") {
      openDeleteModal(id);
      return;
    }
  };

  const bindEvents = () => {
    elements.addButton?.addEventListener("click", () => openModal());

    elements.emptyAdd?.addEventListener("click", () => openModal());

    elements.closeModal?.addEventListener("click", closeModal);

    elements.cancel?.addEventListener("click", closeModal);

    elements.modal?.addEventListener("click", (event) => {
      if (event.target === elements.modal) {
        closeModal();
      }
    });

    elements.form?.addEventListener("submit", saveSale);

    elements.addItem?.addEventListener("click", (event) => {
      event.preventDefault();
      addItem();
    });

    elements.itemsBody?.addEventListener("change", (event) => {
      const row = event.target.closest("tr");

      if (row) {
        updateItemFromRow(row);
      }
      if (event.target.matches('[data-field="quantity"]')) {
        validateItemQuantity(row);
      }
    });

    elements.itemsBody?.addEventListener("input", (event) => {
      const row = event.target.closest("tr");

      if (row) {
        updateItemFromRow(row);
      }

      if (event.target.matches('[data-field="quantity"]')) {
        validateItemQuantity(row);
      }
    });

    elements.itemsBody?.addEventListener("click", (event) => {
      const button = event.target.closest('[data-action="remove-item"]');

      if (button) {
        removeItem(button.dataset.uid);
      }
    });

    [elements.discount, elements.taxAmount].forEach((input) => {
      input?.addEventListener("input", updateTotal);
    });

    elements.search?.addEventListener("input", applyFilters);

    elements.paymentStatusFilter?.addEventListener("change", applyFilters);

    elements.dateFilter?.addEventListener("change", applyFilters);

    elements.resetFilters?.addEventListener("click", () => {
      elements.search.value = "";
      elements.paymentStatusFilter.value = "";
      elements.dateFilter.value = "";
      applyFilters();
    });

    elements.previousPage?.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderTable();
      }
    });

    elements.nextPage?.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(state.filteredSales.length / state.pageSize),
      );

      if (state.page < totalPages) {
        state.page += 1;
        renderTable();
      }
    });

    elements.tableBody?.addEventListener("click", handleTableAction);

    elements.closeView?.addEventListener("click", closeView);

    elements.closeViewButton?.addEventListener("click", closeView);

    elements.viewModal?.addEventListener("click", (event) => {
      if (event.target === elements.viewModal) {
        closeView();
      }
    });
    elements.cancelDeleteButton?.addEventListener("click", closeDeleteModal);

    elements.confirmDeleteButton?.addEventListener("click", confirmDeleteSale);

    elements.deleteModal?.addEventListener("click", (event) => {
      if (event.target === elements.deleteModal) {
        closeDeleteModal();
      }
    });

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
      }

      if (elements.viewModal && !elements.viewModal.hidden) {
        closeView();
      }
    });
  };

  const cacheElements = () => {
    elements.addButton = qs("#addSaleButton");
    elements.emptyAdd = qs("#emptyAddSale");
    elements.totalSales = qs("#totalSales");
    elements.monthSales = qs("#monthSales");
    elements.pendingSales = qs("#pendingSales");
    elements.totalSalesValue = qs("#totalSalesValue");
    elements.search = qs("#saleSearch");
    elements.paymentStatusFilter = qs("#salePaymentStatusFilter");
    elements.dateFilter = qs("#saleDateFilter");
    elements.resetFilters = qs("#resetSaleFilters");
    elements.tableBody = qs("#salesTableBody");
    elements.empty = qs("#salesEmpty");
    elements.count = qs("#salesCount");
    elements.previousPage = qs("#previousSalePage");
    elements.nextPage = qs("#nextSalePage");
    elements.pageNumber = qs("#salePageNumber");
    elements.modal = qs("#saleModal");
    elements.closeModal = qs("#closeSaleModal");
    elements.cancel = qs("#cancelSale");

    elements.form = qs("#saleForm");
    elements.modalTitle = qs("#saleModalTitle");
    elements.modalDescription = qs("#saleModalDescription");
    elements.customerId = qs("#customerId");
    elements.saleDate = qs("#saleDate");
    elements.vehicleNo = qs("#vehicleNo");
    elements.driverName = qs("#driverName");
    elements.driverMobile = qs("#driverMobile");
    elements.paymentStatus = qs("#paymentStatus");
    elements.itemsBody = qs("#saleItemsBody");
    elements.itemsError = qs("#saleItemsError");
    elements.addItem = qs("#addSaleItemButton");
    elements.discount = qs("#discount");
    elements.taxAmount = qs("#taxAmount");
    elements.grandTotal = qs("#grandTotal");
    elements.remarks = qs("#remarks");
    elements.saveSale = qs("#saveSale");

    elements.viewModal = qs("#viewSaleModal");
    elements.closeViewButton = qs("#closeViewSaleModal");
    elements.closeView = qs("#closeViewSale");
    elements.viewTitle = qs("#viewSaleTitle");
    elements.viewSubtitle = qs("#viewSaleSubtitle");
    elements.details = qs("#saleDetailsContent");

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
      await loadSales();
    } catch (error) {
      console.error("[Sales] initialization error:", error);

      showToast(error.message, "error");
    }
  };

  return {
    init,
  };
})();

const initSalesPage = () => SalesPage.init();
