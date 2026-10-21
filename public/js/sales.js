const SalesPage = (() => {
  const state = {
    sales: [],
    filteredSales: [],
    customers: [],
    products: [],
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

  const formatDecimalNumber = (value) => {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number)) return "0.000";

  return number.toLocaleString("en-IN", {
    useGrouping: true,
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
};


  const calculateRoundOff = (amount) => {
    const value = Number(amount || 0);

    if (!Number.isFinite(value)) {
      return {
        roundOff: 0,
        roundedTotal: 0,
      };
    }

    // Round to nearest rupee
    const roundedTotal = Math.round(value);

    const roundOff = Number((roundedTotal - value).toFixed(2));

    return {
      roundOff,
      roundedTotal,
    };
  };

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
    challan_lr_no: sale.challan_lr_no ?? "",
    item_count: Number(sale.item_count || 0),
    items: Array.isArray(sale.items)
      ? sale.items.map((item) => ({
          product_id: Number(item.product_id || 0),
          product_name: item.product_name || "",
          product_code: item.product_code || "",
          quantity: Number(item.quantity || 0),
          unit: item.unit || "",
        }))
      : [],
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
    gst_tax_rate: Number(product.gst_tax_rate || 0),
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
        <td colspan="10">
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

    // console.log("Sales",pageRows);

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
  ${
    Array.isArray(sale.items) && sale.items.length
      ? sale.items
          .map(
            (item) => `
              <div class="sale-product-name">
                ${escapeHtml(item.product_name || "—")}
              </div>
            `,
          )
          .join("")
      : "—"
  }
</td>

<td>
  ${
    Array.isArray(sale.items) && sale.items.length
      ? sale.items
          .map(
            (item) => `
              <div class="sale-product-qty">
                ${formatDecimalNumber(item.quantity)} 
                ${escapeHtml(item.unit || "")}
              </div>
            `,
          )
          .join("")
      : "—"
  }
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
          <td colspan="10">
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

  // const addItem = (data = {}) => {
  //   state.items.push({
  //     uid: data.uid || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  //     product_id: data.product_id ? String(data.product_id) : "",
  //     quantity: data.quantity !== undefined ? String(data.quantity) : "",
  //     rate: data.rate !== undefined ? String(data.rate) : "",
  //     original_quantity:
  //       data.original_quantity !== undefined
  //         ? Number(data.original_quantity)
  //         : 0,
  //   });

  //   renderItems();
  // };

  const addItem = (data = {}) => {
    state.items.push({
      uid: data.uid || `${Date.now()}-${Math.random().toString(16).slice(2)}`,

      product_id: data.product_id ? String(data.product_id) : "",

      quantity: data.quantity !== undefined ? String(data.quantity) : "",

      rate: data.rate !== undefined ? String(data.rate) : "",

      rate_including_gst:
        data.rate_including_gst !== undefined
          ? String(data.rate_including_gst)
          : "",

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

  // const renderItems = () => {
  //   elements.itemsBody.innerHTML = state.items
  //     .map((item) => {
  //       const product = getProduct(item.product_id);

  //       const available = getAvailableForRow(item);

  //       const rate =
  //         item.rate !== "" ? item.rate : (product?.selling_rate ?? "");

  //       if (item.rate === "" && product?.selling_rate !== undefined) {
  //         item.rate = String(product.selling_rate);
  //       }

  //       const amount = Number(item.quantity || 0) * Number(item.rate || 0);

  //       return `
  //         <tr data-uid="${escapeHtml(item.uid)}">

  //           <td>
  //             <select
  //               data-field="product_id"
  //               required>
  //               <option value="">
  //                 Select Product
  //               </option>

  //               ${state.products
  //                 .map((entry) => {
  //                   const optionAvailable =
  //                     Number(entry.current_stock || 0) +
  //                     (String(entry.id) === String(item.product_id)
  //                       ? Number(item.original_quantity || 0)
  //                       : 0);

  //                   return `
  //                       <option
  //                         value="${entry.id}"
  //                         ${
  //                           String(item.product_id) === String(entry.id)
  //                             ? "selected"
  //                             : ""
  //                         }>
  //                         ${escapeHtml(entry.code)}
  //                         — ${escapeHtml(entry.name)}
  //                         (${formatNumber(optionAvailable)} ${escapeHtml(entry.unit)})
  //                       </option>
  //                     `;
  //                 })
  //                 .join("")}
  //             </select>
  //           </td>

  //           <td>
  //             <span class="stock-value">
  //               ${formatNumber(available)}
  //             </span>
  //           </td>

  //           <td>
  //             <span class="item-unit">
  //               ${escapeHtml(product?.unit || "—")}
  //             </span>
  //           </td>

  //           <td>
  //             <input
  //               data-field="quantity"
  //               type="number"
  //               min="1"
  //               step="1"
  //               value="${escapeHtml(item.quantity)}"
  //               placeholder="0.00">
  //           </td>

  //           <td>
  //             <input
  //               data-field="rate"
  //               type="number"
  //               min="0"
  //               step="0.01"
  //               value="${escapeHtml(rate)}"
  //               placeholder="0.00">
  //           </td>

  //           <td>
  //             <span class="item-amount">
  //               ${formatCurrency(amount)}
  //             </span>
  //           </td>

  //           <td>
  //             <button
  //               class="remove-item"
  //               type="button"
  //               data-action="remove-item"
  //               data-uid="${escapeHtml(item.uid)}"
  //               title="Remove item">
  //               <i class="fa-solid fa-trash"></i>
  //             </button>
  //           </td>

  //         </tr>
  //       `;
  //     })
  //     .join("");

  //   updateTotal();
  // };

  const renderItems = () => {
    elements.itemsBody.innerHTML = state.items
      .map((item) => {
        const product = getProduct(item.product_id);

        const available = getAvailableForRow(item);

        const gstRate = Number(product?.gst_tax_rate || 0);

        let rate =
          item.rate !== ""
            ? Number(item.rate)
            : Number(product?.selling_rate || 0);

        if (item.rate === "" && product) {
          item.rate = String(rate);
        }

        let rateIncludingGst;

        if (
          item.rate_including_gst !== "" &&
          item.rate_including_gst !== undefined
        ) {
          rateIncludingGst = Number(item.rate_including_gst);
        } else {
          rateIncludingGst = Number((rate * (1 + gstRate / 100)).toFixed(2));

          item.rate_including_gst = String(rateIncludingGst);
        }

        const amount = Number(item.quantity || 0) * rate;

        return `
        <tr data-uid="${escapeHtml(item.uid)}">

          <td>
            <select data-field="product_id" required>
              <option value="">Select Product</option>

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
              placeholder="0"
            >
          </td>

          <td>
            <input
              data-field="rate"
              type="number"
              min="0"
              step="0.01"
              value="${escapeHtml(rate)}"
              placeholder="0.00"
            >
          </td>

          <td>
            <input
              data-field="rate_including_gst"
              type="number"
              min="0"
              step="0.01"
              value="${escapeHtml(rateIncludingGst)}"
              placeholder="0.00"
            >
          </td>

          <td>
          <small class="item-gst-rate">${formatNumber(gstRate)}%</small>
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

  // const updateItemFromRow = (row) => {
  //   const uid = row.dataset.uid;

  //   const item = state.items.find((entry) => entry.uid === uid);

  //   if (!item) return;

  //   const productId =
  //     row.querySelector('[data-field="product_id"]')?.value || "";

  //   const quantity = row.querySelector('[data-field="quantity"]')?.value || "";

  //   const rate = row.querySelector('[data-field="rate"]')?.value || "";

  //   const previousProductId = item.product_id;

  //   item.product_id = productId;
  //   item.quantity = quantity;
  //   item.rate = rate;

  //   if (previousProductId !== productId) {
  //     item.original_quantity = 0;
  //   }

  //   const product = getProduct(productId);
  //   const amount = Number(quantity || 0) * Number(rate || 0);

  //   const available = product ? getAvailableForRow(item) : 0;

  //   const amountElement = row.querySelector(".item-amount");

  //   if (amountElement) {
  //     amountElement.textContent = formatCurrency(amount);
  //   }

  //   const unitElement = row.querySelector(".item-unit");

  //   if (unitElement) {
  //     unitElement.textContent = product?.unit || "—";
  //   }

  //   const stockElement = row.querySelector(".stock-value");

  //   if (stockElement) {
  //     stockElement.textContent = formatNumber(available);
  //   }

  //   validateItemQuantity(row);

  //   updateTotal();
  // };

  const updateItemFromRow = (row) => {
    const uid = row.dataset.uid;

    const item = state.items.find((entry) => entry.uid === uid);

    if (!item) return;

    const productSelect = row.querySelector('[data-field="product_id"]');
    const quantityInput = row.querySelector('[data-field="quantity"]');
    const rateInput = row.querySelector('[data-field="rate"]');
    const rateIncludingGstInput = row.querySelector(
      '[data-field="rate_including_gst"]',
    );

    const previousProductId = item.product_id;
    const productId = productSelect?.value || "";
    const quantity = quantityInput?.value || "";

    const activeField = document.activeElement?.dataset?.field;

    item.product_id = productId;
    item.quantity = quantity;

    const product = getProduct(productId);
    const gstRate = Number(product?.gst_tax_rate || 0);

    if (previousProductId !== productId) {
      item.original_quantity = 0;

      const defaultRate = Number(product?.selling_rate || 0);

      item.rate = String(defaultRate);

      item.rate_including_gst = String(
        Number((defaultRate * (1 + gstRate / 100)).toFixed(2)),
      );

      if (rateInput) {
        rateInput.value = item.rate;
      }

      if (rateIncludingGstInput) {
        rateIncludingGstInput.value = item.rate_including_gst;
      }
    } else if (activeField === "rate_including_gst") {
      const inclusiveValue = rateIncludingGstInput?.value ?? "";

      item.rate_including_gst = inclusiveValue;

      if (inclusiveValue.trim() === "") {
        item.rate = "";

        if (rateInput) {
          rateInput.value = "";
        }
      } else {
        const inclusiveRate = Number(inclusiveValue);

        const exclusiveRate = Number(
          (inclusiveRate / (1 + gstRate / 100)).toFixed(2),
        );

        item.rate = String(exclusiveRate);

        if (rateInput) {
          rateInput.value = item.rate;
        }
      }
    } else if (activeField === "rate") {
      const exclusiveValue = rateInput?.value ?? "";

      item.rate = exclusiveValue;

      if (exclusiveValue.trim() === "") {
        item.rate_including_gst = "";

        if (rateIncludingGstInput) {
          rateIncludingGstInput.value = "";
        }
      } else {
        const exclusiveRate = Number(exclusiveValue);

        const inclusiveRate = Number(
          (exclusiveRate * (1 + gstRate / 100)).toFixed(2),
        );

        item.rate_including_gst = String(inclusiveRate);

        if (rateIncludingGstInput) {
          rateIncludingGstInput.value = item.rate_including_gst;
        }
      }
    } else {
      item.rate = rateInput?.value ?? "";
      item.rate_including_gst = rateIncludingGstInput?.value ?? "";
    }

    const exclusiveRate = Number(item.rate || 0);
    const amount = Number(quantity || 0) * exclusiveRate;

    const available = product ? getAvailableForRow(item) : 0;

    const amountElement = row.querySelector(".item-amount");

    if (amountElement) {
      amountElement.textContent = formatCurrency(amount);
    }

    const unitElement = row.querySelector(".item-unit");

    if (unitElement) {
      unitElement.textContent = product?.unit || "—";
    }

    const gstElement = row.querySelector(".item-gst-rate");

    if (gstElement) {
      gstElement.textContent = `${formatNumber(gstRate)}%`;
    }

    const stockElement = row.querySelector(".stock-value");

    if (stockElement) {
      stockElement.textContent = formatNumber(available);
    }

    validateItemQuantity(row);

    updateTotal();
  };

  // const updateTotal = () => {
  //   const subtotal = state.items.reduce(
  //     (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
  //     0,
  //   );

  //   const discount = Math.max(0, Number(elements.discount.value || 0));

  //   const tax = Math.max(0, Number(elements.taxAmount.value || 0));

  //   // const total = Math.max(0, subtotal - discount + tax);
  //   // elements.grandTotal.textContent = formatCurrency(total);

  //   const netTotal = Math.max(0, subtotal - discount + tax);

  //   // Calculate round off
  //   const { roundOff, roundedTotal } = calculateRoundOff(netTotal);

  //   // Show round off
  //   if (elements.roundOff) {
  //     elements.roundOff.value = roundOff.toFixed(2);
  //   }

  //   elements.grandTotal.textContent = formatCurrency(roundedTotal);

  // };

  const updateTotal = () => {
    const subtotal = state.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
      0,
    );

    const gstAmount = state.items.reduce((sum, item) => {
      const product = getProduct(item.product_id);

      const gstRate = Number(product?.gst_tax_rate || 0);
      const quantity = Number(item.quantity || 0);
      const exclusiveRate = Number(item.rate || 0);

      const inclusiveRate =
        item.rate_including_gst !== "" && item.rate_including_gst !== undefined
          ? Number(item.rate_including_gst || 0)
          : Number((exclusiveRate * (1 + gstRate / 100)).toFixed(2));

      const itemGst = Math.max(
        0,
        Number((inclusiveRate - exclusiveRate).toFixed(2)),
      );

      return sum + quantity * itemGst;
    }, 0);

    const discount = Math.max(0, Number(elements.discount.value || 0));

    elements.taxAmount.value = gstAmount.toFixed(2);

    const netTotal = Math.max(0, subtotal - discount + gstAmount);

    const { roundOff, roundedTotal } = calculateRoundOff(netTotal);

    if (elements.roundOff) {
      elements.roundOff.value = roundOff.toFixed(2);
    }

    elements.grandTotal.textContent = formatCurrency(roundedTotal);
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

    challan_lr_no: elements.challanLrNo.value.trim() || null,

    driver_name: elements.driverName.value.trim() || null,

    driver_mobile: elements.driverMobile.value.trim() || null,

    discount: Number(elements.discount.value || 0),

    tax_amount: Number(elements.taxAmount.value || 0),

    payment_status: elements.paymentStatus.value,

    remarks: elements.remarks.value.trim() || null,
    delivery_note: elements.deliveryNote.value.trim() || null,
    delivery_note_date: elements.deliveryDate.value || null,
    dispatch_doc_no: elements.dispatchDoc.value.trim() || null,
    dispatched_through: elements.dispatchThrou.value.trim() || null,
    challan_lr_no_date: elements.challanLrNoDate.value || null,
    eway_bill_no: elements.ewayBillNo.value.trim() || null,

    consignee_address: elements.consigneeAddress.value.trim() || null,

    destination: elements.destination.value.trim() || null,

    items: state.items.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity),
      rate: Number(item.rate),
      rate_including_gst:
        item.rate_including_gst === "" ||
        item.rate_including_gst === null ||
        item.rate_including_gst === undefined
          ? null
          : Number(item.rate_including_gst),
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

  function getGSTStateDetails(gstin) {
    const stateCodes = {
      "01": "Jammu and Kashmir",
      "02": "Himachal Pradesh",
      "03": "Punjab",
      "04": "Chandigarh",
      "05": "Uttarakhand",
      "06": "Haryana",
      "07": "Delhi",
      "08": "Rajasthan",
      "09": "Uttar Pradesh",
      10: "Bihar",
      11: "Sikkim",
      12: "Arunachal Pradesh",
      13: "Nagaland",
      14: "Manipur",
      15: "Mizoram",
      16: "Tripura",
      17: "Meghalaya",
      18: "Assam",
      19: "West Bengal",
      20: "Jharkhand",
      21: "Odisha",
      22: "Chhattisgarh",
      23: "Madhya Pradesh",
      24: "Gujarat",
      26: "Dadra and Nagar Haveli and Daman and Diu",
      27: "Maharashtra",
      28: "Andhra Pradesh (Before Division)",
      29: "Karnataka",
      30: "Goa",
      31: "Lakshadweep",
      32: "Kerala",
      33: "Tamil Nadu",
      34: "Puducherry",
      35: "Andaman and Nicobar Islands",
      36: "Telangana",
      37: "Andhra Pradesh",
      38: "Ladakh",
      97: "Other Territory",
      99: "Centre Jurisdiction",
    };

    const gstno = String(gstin || "")
      .trim()
      .toUpperCase();
    const stateCode = gstno.substring(0, 2);

    return {
      stateCode: stateCodes[stateCode] ? stateCode : "",
      stateName: stateCodes[stateCode] || "",
    };
  }

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

      elements.challanLrNo.value = sale.challan_lr_no || "";

      elements.ewayBillNo.value = sale.eway_bill_no || "";

      elements.consigneeAddress.value = sale.consignee_address || "";

      elements.destination.value = sale.destination || "";

      elements.deliveryNote.value = sale.delivery_note || "";

      elements.deliveryDate.value = sale.delivery_note_date
        ? String(sale.delivery_note_date).slice(0, 10)
        : "";

      elements.dispatchDoc.value = sale.dispatch_doc_no || "";

      elements.dispatchThrou.value = sale.dispatched_through || "";

      elements.challanLrNoDate.value = sale.challan_lr_no_date
        ? String(sale.challan_lr_no_date).slice(0, 10)
        : "";

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
          rate_including_gst: item.rate_including_gst,

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

  const numberToWords = (amount) => {
    const ones = [
      "Zero",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];
    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];
    const underThousand = (n) => {
      let result = "";
      if (n >= 100) result += `${ones[Math.floor(n / 100)]} Hundred `;
      n %= 100;
      if (n >= 20)
        result += `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
      else if (n > 0) result += ones[n];
      return result.trim();
    };
    const convert = (n) => {
      if (n < 20) return ones[n];
      if (n < 100) return underThousand(n);
      const groups = [
        [10000000, "Crore"],
        [100000, "Lakh"],
        [1000, "Thousand"],
        [1, ""],
      ];
      let result = "";
      for (const [size, label] of groups) {
        if (n >= size) {
          const count = Math.floor(n / size);
          n %= size;
          result += `${size === 1 ? underThousand(count) : convert(count)}${label ? ` ${label}` : ""} `;
        }
      }
      return result.trim();
    };
    const rounded = Math.max(0, Math.round(Number(amount) || 0));
    return `INR ${convert(rounded)} Only`;
  };

  const invoiceValue = (value) => {
    const text = String(value ?? "").trim();
    return text ? escapeHtml(text).replaceAll("\n", "<br>") : "";
  };

  const openView = async (id) => {
    elements.viewModal.hidden = false;
    elements.viewModal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    elements.details.innerHTML = `<div class="sales-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading invoice...</div>`;

    try {
      const payload = await apiRequest(`/api/sales/${id}`);
      const sale = payload?.sale;
      if (!sale) throw new Error("Sale not found.");

      const company = sale.company || {};
      const items = Array.isArray(sale.items) ? sale.items : [];
      const subtotal = Number(sale.subtotal || 0);
      const discount = Number(sale.discount || 0);
      const taxAmount = Number(sale.tax_amount || 0);
      const roundOff = Number(sale.round_off || 0);
      const total = Number(sale.total_amount || 0);
      const getStateCode = (value) => {
        const code = String(value ?? "").trim();

        return /^\d{1,2}$/.test(code) ? code.padStart(2, "0") : "";
      };

      const customerStateCode = getStateCode(
        sale.customer_state_code ||
          String(sale.customer_gstin || "").substring(0, 2),
      );

      const companyStateCode = getStateCode(
        company.state_code || String(company.gstin || "").substring(0, 2),
      );

      const sameState =
        customerStateCode !== "" &&
        companyStateCode !== "" &&
        customerStateCode === companyStateCode;

      const cgst = sameState ? taxAmount / 2 : 0;
      const sgst = sameState ? taxAmount / 2 : 0;
      const igst = sameState ? 0 : taxAmount;

      const gstState = getGSTStateDetails(company.gstin);
      const customer_gstState = getGSTStateDetails(sale.customer_gstin);

      elements.viewTitle.textContent = `Tax Invoice — ${sale.sale_no || ""}`;
      elements.viewSubtitle.textContent =
        sale.customer_name || "Invoice preview";

      elements.details.innerHTML = `
        <article class="tax-invoice" id="taxInvoicePrint">
          <header class="tax-invoice-heading">Tax Invoice</header>

          <section class="invoice-top-grid">
          <div class="invoice-left-details">
            <div class="invoice-cell invoice-seller">
              <strong class="invoice-company-name">${invoiceValue(company.company_name || "Jay Products")}</strong>
              <div>${invoiceValue(company.address)}</div>
              ${company.gstin ? `<div><b>GSTIN/UIN:</b> ${invoiceValue(company.gstin)}</div>` : ""}
              ${company.phone ? `<div><b>Phone:</b> ${invoiceValue(company.phone)}</div>` : ""}
              ${company.email ? `<div><b>Email:</b> ${invoiceValue(company.email)}</div>` : ""}
              <div>
                <strong>State Name: </strong> ${invoiceValue(gstState.stateName)},<b> Code :</b> ${invoiceValue(gstState.stateCode)}
              </div>  
            </div>
             <div class="invoice-party-cell">
              <div class="invoice-label">Consignee (Ship to)</div>
              <strong>${invoiceValue(sale.customer_name)}</strong>
              <div>${invoiceValue(sale.consignee_address || sale.customer_address)}</div>
              ${sale.customer_gstin ? `<div><b>GSTIN/UIN:</b> ${invoiceValue(sale.customer_gstin)}</div>` : ""}
              <div>
                <b>State Name: </b> ${invoiceValue(customer_gstState.stateName)},<b> Code :</b> ${invoiceValue(customer_gstState.stateCode)}
              </div> 
            </div>
            <div class="invoice-party-cell">
              <div class="invoice-label">Buyer (Bill to)</div>
              <strong>${invoiceValue(sale.customer_name)}</strong>
              <div>${invoiceValue(sale.customer_address)}</div>
              ${sale.customer_gstin ? `<div><b>GSTIN/UIN:</b> ${invoiceValue(sale.customer_gstin)}</div>` : ""}
              <div>
                <b>State Name: </b> ${invoiceValue(customer_gstState.stateName)},<b> Code :</b> ${invoiceValue(customer_gstState.stateCode)}
              </div> 
            </div>
            </div>

            <div class="invoice-meta-grid">
              <div class="invoice-meta-cell invoiceno">
                <div class="saleno">
                <span>Invoice No.</span>
                <strong>${invoiceValue(sale.sale_no)}</strong>
                </div>
                <div class="eway">
                <span>e-Way Bill No.</span>
                <strong>${invoiceValue(sale.eway_bill_no)}</strong>
                </div>
              </div>
              <div class="invoice-meta-cell"><span>Dated</span><strong>${invoiceValue(formatDate(sale.sale_date))}</strong></div>
              <div class="invoice-meta-cell"><span>Delivery Note</span><strong>${invoiceValue(sale.delivery_note)}</strong></div>
              <div class="invoice-meta-cell"><span>Mode/Terms of Payment</span><strong>${invoiceValue(sale.payment_terms)}</strong></div>
              <div class="invoice-meta-cell"><span>Reference No. & Date</span><strong>${invoiceValue(sale.reference_no)}</strong></div>
              <div class="invoice-meta-cell"><span>Other References</span><strong>${invoiceValue(sale.other_references)}</strong></div>
              <div class="invoice-meta-cell"><span>Buyer's Order No.</span><strong>${invoiceValue(sale.buyer_order_no)}</strong></div>
               <div class="invoice-meta-cell">
              <span>Dated</span>
              <strong></strong>
              </div>
              <div class="invoice-meta-cell"><span>Dispatch Doc No.</span><strong>${invoiceValue(sale.dispatch_doc_no)}</strong></div>
              <div class="invoice-meta-cell"><span>Delivery Note Date</span><strong>${invoiceValue(sale.delivery_note_date ? formatDate(sale.delivery_note_date) : "")}</strong></div>
              <div class="invoice-meta-cell"><span>Dispatched through</span><strong>${invoiceValue(sale.transporter_name || sale.driver_name)}</strong></div>
              <div class="invoice-meta-cell"><span>Destination</span><strong>${invoiceValue(sale.destination)}</strong></div>
            <div class="invoice-meta-cell">
  <span>Bill of Lading/LR-RR No.</span>
  <strong>
    ${
      sale.challan_lr_no
        ? invoiceValue(sale.challan_lr_no)
        : ""
    }${
      sale.challan_lr_no_date
        ? ` dt. ${invoiceValue(formatDate(sale.challan_lr_no_date))}`
        : ""
    }
  </strong>
</div>
              <div class="invoice-meta-cell"><span>Motor Vehicle No.</span><strong>${invoiceValue(sale.vehicle_no)}</strong></div>
              <div class="invoice-meta-cell invoice-meta-wide"><span>Terms of Delivery</span><strong>${invoiceValue(sale.terms_of_delivery)}</strong></div>
            </div>
          </section>
          <table class="tax-invoice-items">
  <thead>
    <tr>
      <th class="invoice-sr">Sl<br>No.</th>
      <th>Description of Goods</th>
      <th>HSN/SAC</th>
      <th>Quantity</th>
      <th>Rate</th>
      <th>per</th>
      <th>Amount</th>
    </tr>
  </thead>

  <tbody>
    ${items
      .map(
        (item, index) => `
          <tr>
            <td class="invoice-center">${index + 1}</td>

            <td class="invoice-description">
              <strong>${invoiceValue(item.product_name)}</strong>

              ${
                index === 0 && cgst
                  ? `
                    <div class="invoice-inline-tax invoice-inline-tax-first">
                      <strong>C-GST</strong>
                      <strong>S-GST</strong>
                    </div>
                  `
                  : ""
              }

              ${
                index === 0 && igst
                  ? `
                    <div class="invoice-inline-tax invoice-inline-tax-first">
                      <strong>I-GST</strong>
                    </div>
                  `
                  : ""
              }

              ${
                index === 0 && discount
                  ? `
                    <div class="invoice-inline-tax">
                      <strong>Discount</strong>
                    </div>
                  `
                  : ""
              }

              ${
                index === 0 && roundOff
                  ? `
                    <div class="invoice-inline-tax">
                      <strong>Round Off</strong>
                    </div>
                  `
                  : ""
              }
            </td>

            <td class="invoice-center">
              ${invoiceValue(item.hsn_sac_code)}
            </td>

            <td class="invoice-number">
              ${formatDecimalNumber(item.quantity)}
              ${invoiceValue(item.unit)}
            </td>

            <td class="invoice-number">
              ${formatCurrency(item.rate)}
            </td>

            <td class="invoice-center">
              ${invoiceValue(item.unit)}
            </td>

            <td class="invoice-number invoice-amount-cell">
              <div>
                ${formatCurrency(item.amount)}
              </div>

              ${
                index === 0 && cgst
                  ? `
                    <div class="invoice-inline-tax invoice-inline-tax-first">
                      <strong>${formatCurrency(cgst)}</strong>
                      <strong>${formatCurrency(sgst)}</strong>
                    </div>
                  `
                  : ""
              }

              ${
                index === 0 && igst
                  ? `
                    <div class="invoice-inline-tax invoice-inline-tax-first">
                      <strong>${formatCurrency(igst)}</strong>
                    </div>
                  `
                  : ""
              }

              ${
                index === 0 && discount
                  ? `
                    <div class="invoice-inline-tax">
                      <strong>${formatCurrency(discount)}</strong>
                    </div>
                  `
                  : ""
              }

              ${
                index === 0 && roundOff
                  ? `
                    <div class="invoice-inline-tax">
                      <strong>${formatCurrency(roundOff)}</strong>
                    </div>
                  `
                  : ""
              }
            </td>
          </tr>
        `,
      )
      .join("")}

    <tr class="invoice-grand-total">
    <td></td>
      <td class="invoice-number">
        <strong>Total</strong>
      </td>

      <td></td>
      <td class="invoice-number">
        <strong>
          ${formatDecimalNumber(
            items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
          )}
          ${
            items.length && items.every((item) => item.unit === items[0].unit)
              ? invoiceValue(items[0].unit)
              : ""
          }
        </strong>
      </td>

      <td></td>
      <td></td>

      <td class="invoice-number">
        <strong>${formatCurrency(total)}</strong>
      </td>
    </tr>
  </tbody>
</table>

          <section class="invoice-amount-words"><span>Amount Chargeable (in words)</span><strong>${escapeHtml(numberToWords(total))}</strong><em>E. &amp; O.E</em></section>

          <table class="invoice-tax-summary">
            <thead>
            <tr>
            <th rowspan="2">HSN/SAC</th>
            <th rowspan="2">Taxable Value</th>
            <th colspan="2">CGST</th>
            <th colspan="2">SGST/UTGST</th>
            <th rowspan="2">Total Tax Amount</th>
            </tr>
            <tr>
            <th>Rate</th>
            <th>Amount</th>
            <th>Rate</th>
            <th>Amount</th>
            </tr>
            </thead>
            <tbody>
              ${(() => {
                const groups = new Map();
                items.forEach((item) => {
                  const hsn = String(item.hsn_sac_code || "—");
                  const rate = Number(item.gst_tax_rate || 0);
                  const current = groups.get(hsn) || {
                    taxable: 0,
                    tax: 0,
                    rate,
                  };
                  current.taxable += Number(item.amount || 0);
                  current.tax += (Number(item.amount || 0) * rate) / 100;
                  groups.set(hsn, current);
                });

                return [...groups.entries()]
                  .map(
                    ([hsn, row]) => `
                  <tr>
                  <td>${invoiceValue(hsn)}</td>
                  <td class="invoice-number">${formatCurrency(row.taxable)}</td>
                  <td class="invoice-number">${sameState ? `${formatNumber(row.rate / 2)}%` : "—"}</td>
                  <td class="invoice-number">${formatCurrency(sameState ? row.tax / 2 : 0)}</td>
                  <td class="invoice-number">${sameState ? `${formatNumber(row.rate / 2)}%` : "—"}</td>
                  <td class="invoice-number">${formatCurrency(sameState ? row.tax / 2 : 0)}</td>
                  <td class="invoice-number">${formatCurrency(row.tax)}</td></tr>`,
                  )
                  .join("");
              })()}
              <tr>
              <th>Total</th>
              <th class="invoice-number">${formatCurrency(subtotal)}</th>
              <th></th>
              <th class="invoice-number">${formatCurrency(cgst)}</th>
              <th></th>
              <th class="invoice-number">${formatCurrency(sgst)}</th><th class="invoice-number">${formatCurrency(taxAmount)}</th>
              </tr>
            </tbody>
          </table>
          <footer class="invoice-footer-grid">
          <div class="invoice-tax-words">Tax Amount (in words):<b> ${escapeHtml(numberToWords(taxAmount))}</b></div>

            <div class="invoice-declaration">
              <div class="invoice-bank-title">Company's PAN: ${invoiceValue(company.pan_no || "")}</div>
              <strong>Declaration</strong>
              <p>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>
            </div>
            <div class="invoice-bank-sign">
              <strong class="invoice-bank-title">Company's Bank Details</strong>
              <div><b>Bank Name:</b> ${invoiceValue(company.bank_name)}</div>
              <div><b>A/c No.:</b> ${invoiceValue(company.bank_account_number)}</div>
              <div><b>Branch &amp; IFSC Code:</b> ${invoiceValue([company.bank_branch, company.bank_ifsc].filter(Boolean).join(" & "))}</div>
              <div class="invoice-authorized">
              for ${invoiceValue(company.company_name || "")}
              <br><br><br>
              <span>Authorised Signatory</span><br>
              <div>
            </div>
          </footer>
          <div class="invoice-computer-generated">This is a Computer Generated Invoice</div>
        </article>
        ${Number(sale.return_amount || 0) > 0 ? `<div class="invoice-return-note">Sales returns recorded: ${formatCurrency(sale.return_amount)} · Net total after returns: ${formatCurrency(sale.net_total)}</div>` : ""}
      `;
    } catch (error) {
      elements.details.innerHTML = `<div class="sales-loading sales-error"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(error.message)}</div>`;
    }
  };

  //  <div class="orginal_stamp">
  //              ${
  //     company.stamp_url
  //       ? `
  //         <div class="company-stamp">
  //           <img
  //             src="${escapeHtml(company.stamp_url)}" draggable="false" oncontextmenu="return false"
  //             alt="Company Stamp"
  //           />
  //         </div>
  //       `
  //       : ""
  //   }
  //             </div>

  const closeView = () => {
    elements.viewModal.hidden = true;
    document.body.style.overflow = "";
  };

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

  const downloadTaxInvoicePdf = async () => {
  const button = elements.printInvoice;

  const invoice = document.querySelector(
    "#saleDetailsContent #taxInvoicePrint"
  );

  if (!invoice) {
    showToast("Tax Invoice not found. Please open the invoice again.", "error");
    return;
  }

  if (
    typeof window.html2canvas !== "function" ||
    !window.jspdf?.jsPDF
  ) {
    showToast("PDF libraries are not loaded. Please refresh the page.", "error");
    return;
  }

  const originalHtml = button?.innerHTML || "";
  let exportContainer = null;

  try {
    if (button) {
      button.disabled = true;
      button.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Generating PDF...</span>
      `;
    }

    // Create a separate, fixed-width layout for PDF.
    exportContainer = document.createElement("div");

    Object.assign(exportContainer.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "794px",
      background: "#ffffff",
      zIndex: "-1",
      overflow: "visible"
    });

    const exportInvoice = invoice.cloneNode(true);

    exportInvoice.id = "taxInvoicePdfExport";

    Object.assign(exportInvoice.style, {
      display: "block",
      width: "794px",
      minWidth: "794px",
      maxWidth: "794px",
      height: "auto",
      minHeight: "0",
      maxHeight: "none",
      margin: "0",
      boxSizing: "border-box",
      overflow: "visible",
      background: "#ffffff",
      color: "#111827",
      boxShadow: "none",
      fontFamily: "Arial, Helvetica, sans-serif"
    });

    exportContainer.appendChild(exportInvoice);
    document.body.appendChild(exportContainer);

    // Wait for fonts to finish loading.
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    // Wait for invoice images, if any.
    const images = Array.from(exportInvoice.querySelectorAll("img"));

    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();

        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 5000);
        });
      })
    );

    // Render using a fixed desktop width on every device.
    const canvas = await window.html2canvas(exportInvoice, {
      scale: 2,
      width: 794,
      windowWidth: 1024,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 15000,
      scrollX: 0,
      scrollY: 0
    });

    if (!canvas.width || !canvas.height) {
      throw new Error("Unable to generate the Tax Invoice PDF.");
    }

    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 6;

    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;

    const mmPerPixel = printableWidth / canvas.width;

    const pageSliceHeightPx = Math.floor(
      printableHeight / mmPerPixel
    );

    let sourceY = 0;
    let pageIndex = 0;

    // Split long invoices across A4 pages.
    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(
        pageSliceHeightPx,
        canvas.height - sourceY
      );

      const pageCanvas = document.createElement("canvas");

      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const context = pageCanvas.getContext("2d");

      if (!context) {
        throw new Error("Unable to prepare the PDF pages.");
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

      context.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );

      if (pageIndex > 0) {
        pdf.addPage("a4", "portrait");
      }

      const imageData = pageCanvas.toDataURL("image/jpeg", 0.95);

      pdf.addImage(
        imageData,
        "JPEG",
        margin,
        margin,
        printableWidth,
        sliceHeight * mmPerPixel,
        undefined,
        "FAST"
      );

      // A4 page border.
      // pdf.setDrawColor(0, 0, 0);
      // pdf.setLineWidth(0.2);
      // pdf.rect(
      //   margin,
      //   margin,
      //   printableWidth,
      //   printableHeight
      // );

      sourceY += sliceHeight;
      pageIndex++;
    }

    // Create a safe filename.
    const invoiceTitle =
      document.querySelector("#viewSaleTitle")?.textContent?.trim() ||
      "Tax Invoice";

    const partyName =
      exportInvoice.querySelector(".invoice-company-name")
        ?.textContent?.trim() ||
      "Customer";

    const cleanFileName = (value) =>
      value
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const fileName =
      `${cleanFileName(partyName) || "Customer"} - ` +
      `${cleanFileName(invoiceTitle) || "Tax Invoice"}.pdf`;

    pdf.save(fileName);

    showToast("Tax Invoice PDF downloaded successfully.", "success");

  } catch (error) {
    console.error("[Sales] Tax Invoice PDF error:", error);

    showToast(
      error?.message || "Unable to download Tax Invoice PDF.",
      "error"
    );

  } finally {
    if (exportContainer) {
      exportContainer.remove();
    }

    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};


  const bindEvents = () => {
    elements.addButton?.addEventListener("click", () => openModal());

    elements.emptyAdd?.addEventListener("click", () => openModal());

    elements.closeModal?.addEventListener("click", closeModal);

    elements.cancel?.addEventListener("click", closeModal);

    // elements.modal?.addEventListener("click", (event) => {
    //   if (event.target === elements.modal) {
    //     closeModal();
    //   }
    // });

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

    elements.printInvoice?.addEventListener(
  "click",
  downloadTaxInvoicePdf
);

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
    elements.challanLrNo = qs("#challanLrNo");
    elements.deliveryNote = qs("#deliveryNote");
    elements.deliveryDate = qs("#deliveryDate");
    elements.dispatchDoc = qs("#dispatchDoc");
    elements.dispatchThrou = qs("#dispatchThrou");
    elements.challanLrNoDate = qs("#challanLrNoDate");
    elements.driverMobile = qs("#driverMobile");
    elements.paymentStatus = qs("#paymentStatus");
    elements.itemsBody = qs("#saleItemsBody");
    elements.itemsError = qs("#saleItemsError");
    elements.addItem = qs("#addSaleItemButton");
    elements.discount = qs("#discount");
    elements.taxAmount = qs("#taxAmount");
    elements.roundOff = qs("#roundOff");
    elements.grandTotal = qs("#grandTotal");
    elements.remarks = qs("#remarks");
    elements.ewayBillNo = qs("#ewayBillNo");
    elements.consigneeAddress = qs("#consigneeAddress");
    elements.destination = qs("#destination");
    elements.saveSale = qs("#saveSale");

    elements.viewModal = qs("#viewSaleModal");
    elements.closeViewButton = qs("#closeViewSaleModal");
    elements.closeView = qs("#closeViewSale");
    elements.viewTitle = qs("#viewSaleTitle");
    elements.viewSubtitle = qs("#viewSaleSubtitle");
    elements.details = qs("#saleDetailsContent");
    elements.printInvoice = qs("#printSaleInvoice");

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
