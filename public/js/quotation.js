/* ========================================
   QUOTATION PAGE
======================================== */

const QuotationPage = (() => {
  const state = {
    quotations: [],
    filteredQuotations: [],

    customers: [],
    products: [],
    terms: [],

    items: [],
    selectedTerms: [],

    page: 1,
    pageSize: 30,

    editingId: null,
    deletingId: null,
    viewingId: null,
    deletingTermId: null,
    editingTermId: null,
  };

  const elements = {};

  const qs = (selector) => document.querySelector(selector);

  /* ========================================
     HELPERS
  ======================================== */

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

  const addDays = (dateString, days) => {
    const date = new Date(`${dateString}T00:00:00`);

    date.setDate(date.getDate() + days);

    return date.toISOString().slice(0, 10);
  };

  /* ========================================
     TOAST
  ======================================== */

  const showToast = (message, type = "success") => {
    const container = elements.toastContainer;

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

      setTimeout(() => toast.remove(), 250);
    };

    toast.querySelector(".toast-close")?.addEventListener("click", removeToast);

    setTimeout(removeToast, 3000);
  };

  /* ========================================
     NORMALIZE QUOTATION
  ======================================== */

  const normalizeQuotation = (quotation) => ({
    id: Number(quotation.id),

    quotation_no: quotation.quotation_no ?? "",

    customer_id: Number(quotation.customer_id || 0),

    customer_name: quotation.customer_name ?? "",

    quotation_date: quotation.quotation_date ?? "",

    valid_until: quotation.valid_until ?? "",

    item_count: Number(quotation.item_count || quotation.items_count || 0),

    subtotal: Number(quotation.subtotal || 0),

    discount: Number(quotation.discount || 0),

    tax_amount: Number(quotation.tax_amount || 0),

    total_amount: Number(quotation.total_amount || 0),

    remarks: quotation.remarks ?? "",
  });

  /* ========================================
     LOAD OPTIONS
  ======================================== */

  const loadOptions = async () => {
    /*
      Expected response:

      {
        customers: [],
        products: [],
        terms: []
      }
    */

    const payload = await apiRequest("/api/quotations/options");

    state.customers = Array.isArray(payload?.customers)
      ? payload.customers
      : [];

    state.products = Array.isArray(payload?.products) ? payload.products : [];

    state.terms = Array.isArray(payload?.terms) ? payload.terms : [];

    renderCustomerOptions();

    renderFilterCustomers();

    renderTerms();
  };

  /* ========================================
     CUSTOMER OPTIONS
  ======================================== */

  const renderCustomerOptions = () => {
    if (!elements.customerId) return;

    elements.customerId.innerHTML = `
      <option value="">
        Select Customer
      </option>

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

  const renderFilterCustomers = () => {
    if (!elements.customerFilter) return;

    elements.customerFilter.innerHTML = `
      <option value="">
        All Customers
      </option>

      ${state.customers
        .map(
          (customer) => `
            <option value="${customer.id}">
              ${escapeHtml(customer.name)}
            </option>
          `,
        )
        .join("")}
    `;
  };

  /* ========================================
     CUSTOMER INFO
  ======================================== */

  const updateCustomerInfo = () => {
    const customerId = elements.customerId?.value;

    if (!customerId) {
      if (elements.customerInfo) {
        elements.customerInfo.hidden = true;
      }

      return;
    }

    const customer = state.customers.find(
      (item) => String(item.id) === String(customerId),
    );

    if (!customer) return;

    elements.customerInfo.hidden = false;

    elements.customerContactPerson.textContent = customer.contact_person || "—";

    elements.customerMobile.textContent = customer.mobile || "—";

    elements.customerGstin.textContent = customer.gstin || "—";

    elements.customerAddress.textContent = customer.address || "—";
  };

  /* ========================================
     SUMMARY
  ======================================== */

  const updateSummary = (quotations) => {
    const total = quotations.length;

    const value = quotations.reduce(
      (sum, quotation) => sum + Number(quotation.total_amount || 0),
      0,
    );

    const todayKey = today();

    const todayCount = quotations.filter(
      (quotation) => String(quotation.quotation_date).slice(0, 10) === todayKey,
    ).length;

    const expiredCount = quotations.filter((quotation) => {
      if (!quotation.valid_until) {
        return false;
      }

      return String(quotation.valid_until).slice(0, 10) < todayKey;
    }).length;

    elements.totalQuotations.textContent = total.toLocaleString("en-IN");

    elements.todayQuotations.textContent = todayCount.toLocaleString("en-IN");

    elements.expiredQuotations.textContent =
      expiredCount.toLocaleString("en-IN");

    elements.totalQuotationValue.textContent = formatCurrency(value);
  };

  /* ========================================
     LOADING
  ======================================== */

  const renderLoading = () => {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="7">

          <div class="quotations-loading">

            <i class="fa-solid fa-spinner fa-spin"></i>

            Loading quotations...

          </div>

        </td>
      </tr>
    `;

    elements.empty.hidden = true;
  };

  /* ========================================
     QUOTATION TABLE
  ======================================== */

  const renderTable = () => {
    const rows = state.filteredQuotations;

    if (!rows.length) {
      elements.tableBody.innerHTML = "";

      elements.empty.hidden = false;

      elements.count.textContent = "Showing 0 quotations";

      updatePagination();

      return;
    }

    elements.empty.hidden = true;

    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));

    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.pageSize;

    const pageRows = rows.slice(start, start + state.pageSize);

    elements.tableBody.innerHTML = pageRows
      .map((quotation) => {
        const expired =
          quotation.valid_until &&
          String(quotation.valid_until).slice(0, 10) < today();

        return `
              <tr>

                <td>

                  <span class="quotation-number">
                    ${escapeHtml(quotation.quotation_no)}
                  </span>

                </td>


                <td>

                  <span class="customer-name">
                    ${escapeHtml(quotation.customer_name || "—")}
                  </span>

                </td>


                <td>

                  <span class="quotation-date">
                    ${escapeHtml(formatDate(quotation.quotation_date))}
                  </span>

                </td>


                <td>

                  <span class="${
                    expired ? "quotation-expired-date" : "quotation-valid-date"
                  }">

                    ${escapeHtml(formatDate(quotation.valid_until))}

                  </span>

                </td>


                <td>

                  <span class="item-count">
                    ${formatNumber(quotation.item_count)}
                  </span>

                </td>


                <td>

                  <strong class="quotation-amount">
                    ${formatCurrency(quotation.total_amount)}
                  </strong>

                </td>


                <td class="action-column">

                  <div class="quotation-actions">

                    <button
                      class="table-action"
                      type="button"
                      data-action="view"
                      data-id="${quotation.id}"
                      title="View quotation"
                    >

                      <i class="fa-solid fa-eye"></i>

                    </button>


                    <button
                      class="table-action"
                      type="button"
                      data-action="edit"
                      data-id="${quotation.id}"
                      title="Edit quotation"
                    >

                      <i class="fa-solid fa-pen"></i>

                    </button>


                    <button
                      class="table-action danger"
                      type="button"
                      data-action="delete"
                      data-id="${quotation.id}"
                      title="Delete quotation"
                    >

                      <i class="fa-solid fa-trash"></i>

                    </button>

                  </div>

                </td>

              </tr>
            `;
      })
      .join("");

    elements.count.textContent = `Showing ${start + 1}-${Math.min(
      start + pageRows.length,
      rows.length,
    )} of ${rows.length} quotations`;

    updatePagination();
  };

  /* ========================================
     PAGINATION
  ======================================== */

  const updatePagination = () => {
    const totalPages = Math.max(
      1,
      Math.ceil(state.filteredQuotations.length / state.pageSize),
    );

    elements.pageNumber.textContent = String(state.page);

    elements.previousPage.disabled = state.page <= 1;

    elements.nextPage.disabled = state.page >= totalPages;
  };

  /* ========================================
     FILTERS
  ======================================== */

  const applyFilters = () => {
    const search = elements.search.value.trim().toLowerCase();

    const customerId = elements.customerFilter.value;

    const date = elements.dateFilter.value;

    state.filteredQuotations = state.quotations.filter((quotation) => {
      const matchesSearch =
        !search ||
        quotation.quotation_no.toLowerCase().includes(search) ||
        quotation.customer_name.toLowerCase().includes(search);

      const matchesCustomer =
        !customerId || String(quotation.customer_id) === String(customerId);

      const matchesDate =
        !date || String(quotation.quotation_date).slice(0, 10) === date;

      return matchesSearch && matchesCustomer && matchesDate;
    });

    state.page = 1;

    renderTable();
  };

  /* ========================================
     LOAD QUOTATIONS
  ======================================== */

  const loadQuotations = async () => {
    renderLoading();

    try {
      const payload = await apiRequest("/api/quotations");

      const rows = Array.isArray(payload)
        ? payload
        : payload?.quotations || payload?.data || [];

      state.quotations = rows.map(normalizeQuotation);

      updateSummary(state.quotations);

      applyFilters();
    } catch (error) {
      console.error("[Quotation] load error:", error);

      elements.tableBody.innerHTML = `
        <tr>

          <td colspan="7">

            <div class="quotations-loading">

              <i class="fa-solid fa-triangle-exclamation"></i>

              ${escapeHtml(error.message)}

            </div>

          </td>

        </tr>
      `;

      updateSummary([]);
    }
  };

  /* ========================================
     QUOTATION NUMBER
  ======================================== */

  const loadNextQuotationNumber = async () => {
    try {
      const payload = await apiRequest("/api/quotations/next-number");

      elements.quotationNo.value =
        payload?.quotation_no ||
        payload?.quotationNo ||
        payload?.data?.quotation_no ||
        "";
    } catch (error) {
      console.error("[Quotation] next number error:", error);

      elements.quotationNo.value = "";
    }
  };

  /* ========================================
     RESET FORM
  ======================================== */

  const resetForm = () => {
    state.editingId = null;

    state.items = [];

    state.selectedTerms = [];

    elements.form.reset();

    elements.quotationDate.value = today();

    elements.validUntil.value = addDays(today(), 15);

    elements.discount.value = "0";

    elements.quotationNo.value = "";

    elements.itemsBody.innerHTML = "";

    elements.itemsError.textContent = "";

    if (elements.customerInfo) {
      elements.customerInfo.hidden = true;
    }

    if (elements.modalTitle) {
      elements.modalTitle.textContent = "New Quotation";
    }

    if (elements.saveQuotation) {
      elements.saveQuotation.querySelector("span").textContent =
        "Save Quotation";
    }

    renderTerms();

    updateTotal();
  };

  /* ========================================
     OPEN MODAL
  ======================================== */

  const openModal = async () => {
    resetForm();

    elements.modal.hidden = false;

    document.body.style.overflow = "hidden";

    await loadNextQuotationNumber();

    addItem();

    requestAnimationFrame(() => {
      elements.customerId?.focus();
    });
  };

  /* ========================================
     CLOSE MODAL
  ======================================== */

  const closeModal = () => {
    elements.modal.hidden = true;

    document.body.style.overflow = "";
  };

  /* ========================================
     ADD ITEM
  ======================================== */

  const addItem = () => {
    state.items.push({
      uid: `${Date.now()}-${Math.random().toString(16).slice(2)}`,

      product_id: "",

      unit: "",

      quantity: "",

      rate: "",

      gst_tax_rate: 0,

      gst_amount: 0,

      amount: 0,
    });

    renderItems();
  };

  /* ========================================
     REMOVE ITEM
  ======================================== */

  const removeItem = (uid) => {
    state.items = state.items.filter((item) => item.uid !== uid);

    if (!state.items.length) {
      addItem();

      return;
    }

    renderItems();

    updateTotal();
  };

  /* ========================================
     PRODUCT OPTIONS
  ======================================== */

  const getProductOptions = (selectedId) => {
    return `
      <option value="">
        Select Product
      </option>

      ${state.products
        .map((product) => {
          const selected =
            String(selectedId) === String(product.id) ? "selected" : "";

          const code = product.code ? `${escapeHtml(product.code)} — ` : "";

          return `
              <option
                value="${product.id}"
                ${selected}
              >
                ${code}${escapeHtml(product.name)}
              </option>
            `;
        })
        .join("")}
    `;
  };

  /* ========================================
     RENDER ITEMS
  ======================================== */

  const renderItems = () => {
    if (!state.items.length) {
      elements.itemsBody.innerHTML = "";

      elements.noItemsMessage.hidden = false;

      return;
    }

    elements.noItemsMessage.hidden = true;

    elements.itemsBody.innerHTML = state.items
      .map(
        (item, index) => `

            <tr data-uid="${item.uid}">

              <td>
                ${index + 1}
              </td>


              <td>

                <select
                  data-field="product_id"
                  required
                >

                  ${getProductOptions(item.product_id)}

                </select>

              </td>


              <td>

                <input
                  data-field="quantity"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value="${escapeHtml(item.quantity)}"
                  placeholder="0.000"
                >

              </td>


              <td>

                <span class="item-unit">
                  ${escapeHtml(item.unit || "—")}
                </span>

              </td>


              <td>

                <input
                  data-field="rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value="${escapeHtml(item.rate)}"
                  placeholder="0.00"
                >

              </td>


              <td>

                <span class="item-gst">

                  ${Number(item.gst_tax_rate || 0).toFixed(2)}%

                </span>

              </td>


              <td>

                <span class="item-amount">

                  ${formatCurrency(item.amount || 0)}

                </span>

              </td>


              <td>

                <button
                  class="remove-item"
                  type="button"
                  data-action="remove-item"
                  data-uid="${item.uid}"
                  title="Remove item"
                >

                  <i class="fa-solid fa-trash"></i>

                </button>

              </td>

            </tr>
          `,
      )
      .join("");
  };

  /* ========================================
     UPDATE ITEM
  ======================================== */

  const updateItemFromRow = (row) => {
    const uid = row.dataset.uid;

    const item = state.items.find((entry) => entry.uid === uid);

    if (!item) return;

    const productId =
      row.querySelector('[data-field="product_id"]')?.value || "";

    const quantity = row.querySelector('[data-field="quantity"]')?.value || "";

    const rate = row.querySelector('[data-field="rate"]')?.value || "";

    item.product_id = productId;

    item.quantity = quantity;

    item.rate = rate;

    const product = state.products.find(
      (entry) => String(entry.id) === String(productId),
    );

    item.unit = product?.unit || "";

    item.gst_tax_rate = Number(product?.gst_tax_rate || 0);

    // const baseAmount = Number(quantity || 0) * Number(rate || 0);

    // item.amount = baseAmount;

    // item.gst_amount = (baseAmount * item.gst_tax_rate) / 100;

    const grossAmount = Number(quantity || 0) * Number(rate || 0);

    const gstRate = Number(item.gst_tax_rate || 0);

    const baseAmount =
      gstRate > 0 ? (grossAmount * 100) / (100 + gstRate) : grossAmount;

    const gstAmount = grossAmount - baseAmount;

    item.amount = grossAmount;
    item.gst_amount = gstAmount;

    const unit = row.querySelector(".item-unit");

    if (unit) {
      unit.textContent = product?.unit || "—";
    }

    const gst = row.querySelector(".item-gst");

    if (gst) {
      gst.textContent = `${item.gst_tax_rate.toFixed(2)}%`;
    }

    const amount = row.querySelector(".item-amount");

    if (amount) {
      amount.textContent = formatCurrency(item.amount);
    }

    updateTotal();
  };

  /* ========================================
     TOTAL CALCULATION
  ======================================== */

  // const calculateTotals = () => {
  //   const subtotal = state.items.reduce(
  //     (sum, item) => sum + Number(item.amount || 0),
  //     0,
  //   );

  //   const discount = Math.max(0, Number(elements.discount.value || 0));

  //   const taxableAmount = Math.max(0, subtotal - discount);

  //   /*
  //     GST is calculated proportionally
  //     after discount.
  //   */

  //   let tax = 0;

  //   if (subtotal > 0 && taxableAmount > 0) {
  //     tax = state.items.reduce((sum, item) => {
  //       const itemAmount = Number(item.amount || 0);

  //       if (!itemAmount) {
  //         return sum;
  //       }

  //       const itemDiscount = discount * (itemAmount / subtotal);

  //       const taxableItem = Math.max(0, itemAmount - itemDiscount);

  //       return sum + (taxableItem * Number(item.gst_tax_rate || 0)) / 100;
  //     }, 0);
  //   }

  //   const total = taxableAmount + tax;

  //   return {
  //     subtotal,
  //     discount,
  //     tax,
  //     total,
  //   };
  // };

  const calculateTotals = () => {
    const grossSubtotal = state.items.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );

    const discount = Math.max(0, Number(elements.discount.value || 0));

    const grossAfterDiscount = Math.max(0, grossSubtotal - discount);

    let taxableAmount = 0;
    let tax = 0;

    if (grossSubtotal > 0 && grossAfterDiscount > 0) {
      state.items.forEach((item) => {
        const itemGross = Number(item.amount || 0);

        if (!itemGross) {
          return;
        }

        const itemDiscount = discount * (itemGross / grossSubtotal);

        const itemGrossAfterDiscount = Math.max(0, itemGross - itemDiscount);

        const gstRate = Number(item.gst_tax_rate || 0);

        const itemTaxable =
          gstRate > 0
            ? (itemGrossAfterDiscount * 100) / (100 + gstRate)
            : itemGrossAfterDiscount;

        const itemGst = itemGrossAfterDiscount - itemTaxable;

        taxableAmount += itemTaxable;
        tax += itemGst;
      });
    }

    const total = grossAfterDiscount;

    return {
      subtotal: taxableAmount,
      grossSubtotal,
      discount,
      tax,
      total,
    };
  };
  const updateTotal = () => {
    const totals = calculateTotals();

    elements.subtotalAmount.textContent = formatCurrency(totals.subtotal);

    elements.discountAmount.textContent = formatCurrency(totals.discount);

    elements.taxAmount.textContent = formatCurrency(totals.tax);

    elements.grandTotal.textContent = formatCurrency(totals.total);
  };

  /* ========================================
     TERMS
  ======================================== */

  const renderTerms = () => {
    if (!elements.termsList) return;

    const activeTerms = state.terms.filter(
      (term) => term.is_active !== false && term.is_active !== 0,
    );

    if (!activeTerms.length) {
      elements.termsList.innerHTML = `
        <div class="terms-empty">
          No quotation terms available.
        </div>
      `;

      return;
    }

    elements.termsList.innerHTML = activeTerms
      .map((term) => {
        const selected = state.selectedTerms.some(
          (id) => String(id) === String(term.id),
        );

        // return `
        //       <label
        //         class="quotation-term-option"
        //       >

        //         <input
        //           type="checkbox"
        //           value="${term.id}"
        //           data-term-id="${term.id}"
        //           ${selected ? "checked" : ""}
        //         >

        //         <span class="term-checkmark"></span>

        //         <span class="term-text">
        //           ${escapeHtml(term.term_text)}
        //         </span>

        //       </label>
        //     `;
        return `
  <div
    class="quotation-term-option"
    data-term-id="${term.id}"
  >
    <label class="quotation-term-select">
      <input
        type="checkbox"
        value="${term.id}"
        data-term-id="${term.id}"
        ${selected ? "checked" : ""}
      >

      <span class="term-checkmark"></span>

      <span class="term-text">
        ${escapeHtml(term.term_text)}
      </span>
    </label>

    <div class="term-actions">
      <button
        type="button"
        class="term-action edit"
        data-action="edit-term"
        data-term-id="${term.id}"
        title="Edit Term"
        aria-label="Edit Term"
      >
        <i class="fa-solid fa-pen"></i>
      </button>

      <button
        type="button"
        class="term-action delete"
        data-action="delete-term"
        data-term-id="${term.id}"
        title="Delete Term"
        aria-label="Delete Term"
      >
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  </div>
`;
      })
      .join("");
  };

  const updateSelectedTerms = () => {
    state.selectedTerms = Array.from(
      elements.termsList.querySelectorAll("input[data-term-id]:checked"),
    ).map((input) => Number(input.dataset.termId));
  };

  /* ========================================
     TERM MODAL
  ======================================== */

  const openTermModal = () => {
    state.editingTermId = null;

    elements.termForm.reset();

    elements.termText.value = "";

    elements.termSortOrder.value = "0";

    elements.termIsActive.checked = true;

    elements.termModalTitle.textContent = "Add New Term";

    elements.saveTerm.querySelector("span").textContent = "Save Term";

    elements.termModal.hidden = false;

    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      elements.termText?.focus();
    });
  };

  const closeTermModal = () => {
    elements.termModal.hidden = true;

    document.body.style.overflow = "";
  };

  /* ========================================
   EDIT TERM
======================================== */

  const openEditTermModal = (termId) => {
    const id = Number(termId);

    if (!Number.isSafeInteger(id) || id <= 0) {
      showToast("Invalid quotation term.", "error");
      return;
    }

    const term = state.terms.find((item) => Number(item.id) === id);

    if (!term) {
      showToast("Quotation term not found.", "error");
      return;
    }

    // Set edit mode
    state.editingTermId = id;

    // Fill existing term data
    elements.termText.value = term.term_text || "";
    elements.termSortOrder.value = String(term.sort_order ?? 0);
    elements.termIsActive.checked = Boolean(term.is_active);

    // Change modal title/button
    elements.termModalTitle.textContent = "Edit Term";
    elements.saveTerm.querySelector("span").textContent = "Update Term";

    // Open modal
    elements.termModal.hidden = false;
    document.body.style.overflow = "hidden";

    // Focus textarea
    requestAnimationFrame(() => {
      elements.termText?.focus();

      elements.termText?.setSelectionRange(
        elements.termText.value.length,
        elements.termText.value.length,
      );
    });
  };

  const saveTerm = async (event) => {
    event.preventDefault();

    const text = elements.termText.value.trim();

    if (!text) {
      showToast("Term & Condition is required.", "error");

      return;
    }

    const payload = {
      term_text: text,

      sort_order: Number(elements.termSortOrder.value || 0),

      is_active: Boolean(elements.termIsActive.checked),
    };

    const button = elements.saveTerm;

    button.disabled = true;

    try {
      const isEdit = Number.isInteger(state.editingTermId);

      await apiRequest(
        isEdit
          ? `/api/quotations/terms/${state.editingTermId}`
          : "/api/quotations/terms",
        {
          method: isEdit ? "PUT" : "POST",

          body: JSON.stringify(payload),
        },
      );

      closeTermModal();

      showToast(isEdit ? "Quotation term updated." : "Quotation term added.");

      const previousSelection = [...state.selectedTerms];

      const response = await apiRequest("/api/quotations/terms");

      state.terms = Array.isArray(response)
        ? response
        : response?.terms || response?.data || [];

      state.selectedTerms = previousSelection;

      renderTerms();
    } catch (error) {
      console.error("[Quotation] term save error:", error);

      showToast(error.message, "error");
    } finally {
      button.disabled = false;

      button.querySelector("span").textContent = "Save Term";
    }
  };

  /* ========================================
     VALIDATION
  ======================================== */

  const validateForm = () => {
    document.querySelectorAll(".form-error").forEach((element) => {
      element.textContent = "";
    });

    elements.itemsError.textContent = "";

    let valid = true;

    if (!elements.customerId.value) {
      const error = document.querySelector('[data-error-for="customer"]');

      if (error) {
        error.textContent = "Customer is required.";
      }

      valid = false;
    }

    if (!elements.quotationDate.value) {
      const error = document.querySelector('[data-error-for="quotationDate"]');

      if (error) {
        error.textContent = "Quotation date is required.";
      }

      valid = false;
    }

    if (!elements.validUntil.value) {
      const error = document.querySelector('[data-error-for="validUntil"]');

      if (error) {
        error.textContent = "Valid until date is required.";
      }

      valid = false;
    }

    if (
      elements.quotationDate.value &&
      elements.validUntil.value &&
      elements.validUntil.value < elements.quotationDate.value
    ) {
      const error = document.querySelector('[data-error-for="validUntil"]');

      if (error) {
        error.textContent = "Valid until cannot be before quotation date.";
      }

      valid = false;
    }

    if (!state.items.length) {
      elements.itemsError.textContent = "Add at least one quotation item.";

      return false;
    }

    const seen = new Set();

    state.items.forEach((item) => {
      const id = String(item.product_id);

      if (!item.product_id) {
        valid = false;
      }

      if (!Number(item.quantity) || Number(item.quantity) <= 0) {
        valid = false;
      }

      if (item.rate === "" || Number(item.rate) < 0) {
        valid = false;
      }

      if (seen.has(id) && id !== "") {
        valid = false;

        elements.itemsError.textContent =
          "The same product cannot be added more than once.";
      }

      if (id !== "") {
        seen.add(id);
      }
    });

    if (!valid && !elements.itemsError.textContent) {
      elements.itemsError.textContent =
        "Please select valid products, quantities and rates.";
    }

    return valid;
  };

  /* ========================================
     PAYLOAD
  ======================================== */

  // const getPayload = () => {
  //   updateSelectedTerms();

  //   const totals = calculateTotals();

  //   return {
  //     customer_id: Number(elements.customerId.value),

  //     quotation_date: elements.quotationDate.value,

  //     valid_until: elements.validUntil.value,

  //     discount: Number(totals.discount || 0),

  //     remarks: elements.remarks.value.trim() || null,

  //     items: state.items.map((item) => ({
  //       product_id: Number(item.product_id),

  //       quantity: Number(item.quantity),

  //       rate: Number(item.rate),
  //     })),

  //     terms: state.selectedTerms.map((termId, index) => ({
  //       term_id: Number(termId),

  //       sort_order: index + 1,
  //     })),
  //   };
  // };

  const getPayload = () => {
    updateSelectedTerms();

    const totals = calculateTotals();

    return {
      customer_id: Number(elements.customerId.value),

      quotation_date: elements.quotationDate.value,

      valid_until: elements.validUntil.value,

      discount: Number(totals.discount || 0),

      remarks: elements.remarks.value.trim() || null,

      items: state.items.map((item) => ({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        rate: Number(item.rate),
      })),

      terms: state.selectedTerms
        .map((termId, index) => {
          const term = state.terms.find(
            (item) => Number(item.id) === Number(termId),
          );

          if (!term || !term.term_text?.trim()) {
            return null;
          }

          return {
            term_id: Number(term.id),
            term_text: term.term_text.trim(),
            sort_order: index + 1,
          };
        })
        .filter(Boolean),
    };
  };
  /* ========================================
     SAVE / UPDATE
  ======================================== */

  const saveQuotation = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const button = elements.saveQuotation;

    const isEdit = Number.isInteger(state.editingId) && state.editingId > 0;

    button.disabled = true;

    button.querySelector("span").textContent = isEdit
      ? "Updating..."
      : "Saving...";

    try {
      const payload = await apiRequest(
        isEdit ? `/api/quotations/${state.editingId}` : "/api/quotations",
        {
          method: isEdit ? "PUT" : "POST",

          body: JSON.stringify(getPayload()),
        },
      );

      closeModal();

      const quotationNo =
        payload?.quotation?.quotation_no || payload?.data?.quotation_no || "";

      showToast(
        isEdit
          ? `Quotation ${quotationNo} updated successfully.`
          : `Quotation ${quotationNo} created successfully.`,
      );

      await loadQuotations();
    } catch (error) {
      console.error(`[Quotation] ${isEdit ? "update" : "save"} error:`, error);

      showToast(error.message, "error");
    } finally {
      button.disabled = false;

      button.querySelector("span").textContent = isEdit
        ? "Update Quotation"
        : "Save Quotation";
    }
  };

  /* ========================================
     OPEN EDIT
  ======================================== */

  const openEdit = async (id) => {
    resetForm();

    elements.modal.hidden = false;

    document.body.style.overflow = "hidden";

    elements.itemsBody.innerHTML = `
      <tr>

        <td colspan="8">

          <div class="quotations-loading">

            <i class="fa-solid fa-spinner fa-spin"></i>

            Loading quotation...

          </div>

        </td>

      </tr>
    `;

    try {
      const payload = await apiRequest(`/api/quotations/${id}`);

      const quotation = payload?.quotation || payload?.data;

      if (!quotation) {
        throw new Error("Quotation not found.");
      }

      populateEditForm(quotation);
    } catch (error) {
      console.error("[Quotation] edit load error:", error);

      closeModal();

      showToast(error.message, "error");
    }
  };

  /* ========================================
     POPULATE EDIT
  ======================================== */

  const populateEditForm = (quotation) => {
    state.editingId = Number(quotation.id);

    elements.quotationNo.value = quotation.quotation_no || "";

    elements.customerId.value = String(quotation.customer_id || "");

    elements.quotationDate.value = String(quotation.quotation_date || "").slice(
      0,
      10,
    );

    elements.validUntil.value = String(quotation.valid_until || "").slice(
      0,
      10,
    );

    elements.discount.value = Number(quotation.discount || 0);

    elements.remarks.value = quotation.remarks || "";

    updateCustomerInfo();

    state.items = (quotation.items || []).map((item) => ({
      uid: `${Date.now()}-${Math.random().toString(16).slice(2)}`,

      product_id: String(item.product_id || ""),

      unit: item.unit || "",

      quantity: item.quantity ?? "",

      rate: item.rate ?? "",

      gst_tax_rate: Number(item.gst_tax_rate || 0),

      gst_amount: Number(item.gst_amount || 0),

      amount: Number(item.amount || 0),
    }));

    if (!state.items.length) {
      addItem();
    } else {
      renderItems();
      updateTotal();
    }

    state.selectedTerms = (quotation.terms || [])
      .map((term) => Number(term.term_id || term.id))
      .filter((id) => id > 0);

    renderTerms();

    elements.modalTitle.textContent = `Edit Quotation ${
      quotation.quotation_no || ""
    }`;

    elements.saveQuotation.querySelector("span").textContent =
      "Update Quotation";

    elements.modal.hidden = false;

    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      elements.customerId?.focus();
    });
  };

  /* ========================================
     VIEW QUOTATION
  ======================================== */

  const openView = async (id) => {
    state.viewingId = Number(id);

    elements.viewModal.hidden = false;

    document.body.style.overflow = "hidden";

    elements.details.innerHTML = `
      <div class="quotations-loading">

        <i class="fa-solid fa-spinner fa-spin"></i>

        Loading quotation...

      </div>
    `;

    try {
      const payload = await apiRequest(`/api/quotations/${id}`);

      const quotation = payload?.quotation || payload?.data;

      if (!quotation) {
        throw new Error("Quotation not found.");
      }

      elements.viewTitle.textContent = quotation.quotation_no || "Quotation";

      elements.viewSubtitle.textContent =
        quotation.customer_name || "Quotation details";

      renderQuotationDetails(quotation);
    } catch (error) {
      console.error("[Quotation] view error:", error);

      elements.details.innerHTML = `
        <div class="quotations-loading">

          <i class="fa-solid fa-triangle-exclamation"></i>

          ${escapeHtml(error.message)}

        </div>
      `;
    }
  };

  /* ========================================
     RENDER DETAILS
  ======================================== */

  const renderQuotationDetails = (quotation) => {
    const items = Array.isArray(quotation.items) ? quotation.items : [];

    const terms = Array.isArray(quotation.terms) ? quotation.terms : [];

    const discount = Number(quotation.discount || 0);

    let grossSubtotal = 0;
    let taxableSubtotal = 0;
    let totalGst = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;

    items.forEach((item) => {
      const quantity = Number(item.quantity || 0);
      const rate = Number(item.rate || 0);
      const gstRate = Number(item.gst_tax_rate || 0);

      // Rate already includes GST
      const grossAmount = quantity * rate;

      // Reverse GST
      const taxableAmount =
        gstRate > 0 ? (grossAmount * 100) / (100 + gstRate) : grossAmount;

      const gstAmount = grossAmount - taxableAmount;

      grossSubtotal += grossAmount;
      taxableSubtotal += taxableAmount;
      totalGst += gstAmount;
    });

    // Split GST into CGST + SGST
    cgstAmount = totalGst / 2;
    sgstAmount = totalGst / 2;

    // Discount is already treated as gross/inclusive amount
    const grossAfterDiscount = Math.max(0, grossSubtotal - discount);

    // Reverse GST again after discount
    let finalTaxableAmount = 0;
    let finalGstAmount = 0;

    if (grossSubtotal > 0 && grossAfterDiscount > 0) {
      items.forEach((item) => {
        const quantity = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        const gstRate = Number(item.gst_tax_rate || 0);

        const itemGross = quantity * rate;

        if (!itemGross) return;

        // Allocate discount proportionally
        const itemDiscount = discount * (itemGross / grossSubtotal);

        const itemGrossAfterDiscount = Math.max(0, itemGross - itemDiscount);

        const itemTaxable =
          gstRate > 0
            ? (itemGrossAfterDiscount * 100) / (100 + gstRate)
            : itemGrossAfterDiscount;

        const itemGst = itemGrossAfterDiscount - itemTaxable;

        finalTaxableAmount += itemTaxable;
        finalGstAmount += itemGst;
      });
    }

    const finalCgstAmount = finalGstAmount / 2;
    const finalSgstAmount = finalGstAmount / 2;

    const grandTotal = grossAfterDiscount;

    const subtotal = finalTaxableAmount;
    const taxAmount = finalGstAmount;

    /*
     * Show CGST/SGST rate when all items use the same GST rate.
     * Example:
     * GST 18% => CGST 9% + SGST 9%
     */
    const gstRates = [
      ...new Set(
        items
          .map((item) => Number(item.gst_tax_rate || 0))
          .filter((rate) => rate >= 0),
      ),
    ];

    const hasSingleGstRate = gstRates.length === 1;

    const cgstRate = hasSingleGstRate ? gstRates[0] / 2 : null;

    const sgstRate = hasSingleGstRate ? gstRates[0] / 2 : null;

    /*
     * Customer details can come from the quotation response.
     * Different backend field names are supported as fallbacks.
     */
    const customerMobile =
      quotation.customer_mobile ||
      quotation.mobile ||
      quotation.customer?.mobile ||
      "";

    const customerAddress =
      quotation.customer_address ||
      quotation.address ||
      quotation.customer?.address ||
      "";

    const customerGstin =
      quotation.customer_gstin ||
      quotation.gstin ||
      quotation.customer?.gstin ||
      "";

    const customerContactPerson =
      quotation.contact_person ||
      quotation.customer_contact_person ||
      quotation.customer?.contact_person ||
      "";

    const company = quotation.company || {};

    const companyName = company.company_name || "";

    const companyTagline = company.tagline || "";

    const companyAddress = company.address || "";

    const companyMobile = company.phone || "";

    const companyEmail = company.email || "";

    const companyWebsite = company.website || "";

    const companyGstin = company.gstin || "";

    const companyLogo = company.logo_url || "";

    const companyStamp = company.stamp_url || "";

    const authorizedSignatory = company.authorized_signatory_name || "";

    // ${
    //     companyLogo
    //       ? `
    //         <div class="quotation-company-logo">
    //           <img
    //             src="${escapeHtml(companyLogo)}"
    //             alt="${escapeHtml(companyName || "Company Logo")}"
    //           />
    //         </div>
    //       `
    //       : ""
    //   }

    elements.details.innerHTML = `
    <div class="quotation-preview">

      <!-- =====================================================
           QUOTATION HEADER
      ====================================================== -->

      <header class="quotation-preview-header">

        
      <div class="quotation-company">

  <div class="quotation-company-info">

    <h1>
      ${escapeHtml(companyName)}
    </h1>

    ${
      companyTagline
        ? `
          <div class="quotation-company-tagline">
            ${escapeHtml(companyTagline)}
          </div>
        `
        : ""
    }
     ${
       companyAddress
         ? `
            <div class="quotation-company-address">
              ${escapeHtml(companyAddress)}
            </div>
          `
         : ""
     }

    <div class="quotation-company-contact">

    ${
        companyGstin
          ? `
            <span>
              GSTIN: ${escapeHtml(companyGstin)}
            </span>
          `
          : ""
      }

      ${
        companyMobile
          ? `
            <span class="quotation-contact-separator">|</span>
            <span>
              Phone: ${escapeHtml(companyMobile)}
            </span>
          `
          : ""
      }

      ${
        companyEmail
          ? `
            <span class="quotation-contact-separator">|</span>
            <span>
              Email: ${escapeHtml(companyEmail)}
            </span>
          `
          : ""
      }

      ${
        companyWebsite
          ? `
            <span class="quotation-contact-separator">|</span>
            <span>
              Website: ${escapeHtml(companyWebsite)}
            </span>
          `
          : ""
      }

    </div>

  </div>

</div>

        <div class="quotation-document-title">
          QUOTATION
        </div>

      </header>


      <!-- =====================================================
           QUOTATION META
      ====================================================== -->

      <section class="quotation-preview-meta">

        <div class="quotation-meta-left">
          <span>Quotation No.</span>
          <strong>
            ${escapeHtml(quotation.quotation_no || "—")}
          </strong>
        </div>

        <div class="quotation-meta-right">
          <span>Date</span>
          <strong>
            ${escapeHtml(formatDate(quotation.quotation_date))}
          </strong>
        </div>

      </section>


      <!-- =====================================================
           BILL TO
      ====================================================== -->

      <section class="quotation-bill-to">

        <div class="quotation-section-label">
          BILL TO
        </div>

        <div class="quotation-customer-name">
          ${escapeHtml(quotation.customer_name || "—")}
        </div>

        ${
          customerContactPerson
            ? `
              <div class="quotation-customer-line">
                <strong>Contact Person:</strong>
                ${escapeHtml(customerContactPerson)}
              </div>
            `
            : ""
        }

        ${
          customerMobile
            ? `
              <div class="quotation-customer-line">
                <strong>Mobile:</strong>
                ${escapeHtml(customerMobile)}
              </div>
            `
            : ""
        }

        ${
          customerAddress
            ? `
              <div class="quotation-customer-line">
                <strong>Address:</strong>
                ${escapeHtml(customerAddress)}
              </div>
            `
            : ""
        }

        ${
          customerGstin
            ? `
              <div class="quotation-customer-line">
                <strong>GSTIN:</strong>
                ${escapeHtml(customerGstin)}
              </div>
            `
            : ""
        }

      </section>


      <!-- =====================================================
           ITEMS
      ====================================================== -->

      <section class="quotation-preview-items">

        <table>

          <thead>
            <tr>
              <th class="col-number">#</th>
              <th class="col-product">Product</th>
              <th class="col-qty">Qty</th>
              <th class="col-rate">Rate (Incl. GST)</th>
              <th class="col-amount">Amount</th>
            </tr>
          </thead>

          <tbody>

            ${
              items.length
                ? items
                    .map(
                      (item, index) => `
                        <tr>

                          <td class="col-number">
                            ${index + 1}
                          </td>

                          <td class="col-product">
                            <div class="quotation-product-name">
                              ${escapeHtml(item.product_name || "—")}
                            </div>

                            ${
                              item.product_code
                                ? `
                                  <div class="quotation-product-code">
                                    ${escapeHtml(item.product_code)}
                                  </div>
                                `
                                : ""
                            }
                          </td>

                          <td class="col-qty">
                            ${formatNumber(item.quantity)}

                            ${
                              item.unit
                                ? `
                                  <span class="quotation-item-unit">
                                    ${escapeHtml(item.unit)}
                                  </span>
                                `
                                : ""
                            }
                          </td>

                          <td class="col-rate">
                            ${formatCurrency(item.rate)}

                            <span class="quotation-item-gst">
                              Incl. ${Number(item.gst_tax_rate || 0).toFixed(2)}% GST
                            </span>
                          </td>

                          <td class="col-amount">
                            <strong>
                              ${formatCurrency(item.amount)}
                            </strong>
                          </td>

                        </tr>
                      `,
                    )
                    .join("")
                : `
                    <tr>
                      <td colspan="5" class="quotation-no-items">
                        No quotation items.
                      </td>
                    </tr>
                  `
            }

          </tbody>

        </table>

      </section>


      <!-- =====================================================
           TOTALS
      ====================================================== -->

      <section class="quotation-preview-summary">

        <div class="quotation-summary-box">

          <div class="quotation-summary-row">
            <span>Taxable Amount</span>
            <strong>
              ${formatCurrency(subtotal)}
            </strong>
          </div>

          ${
            discount > 0
              ? `
                <div class="quotation-summary-row">
                  <span>Discount</span>
                  <strong>
                    - ${formatCurrency(discount)}
                  </strong>
                </div>
              `
              : ""
          }

          <div class="quotation-summary-row">

            <span>
              ${cgstRate !== null ? `CGST @ ${cgstRate.toFixed(2)}%` : "CGST"}
            </span>

            <strong>
              ${formatCurrency(finalCgstAmount)}
            </strong>

          </div>

          <div class="quotation-summary-row">

            <span>
              ${sgstRate !== null ? `SGST @ ${sgstRate.toFixed(2)}%` : "SGST"}
            </span>

            <strong>
              ${formatCurrency(finalSgstAmount)}
            </strong>

          </div>

          <div class="quotation-summary-divider"></div>

          <div class="quotation-summary-row quotation-grand-total">

            <span>
              GRAND TOTAL
            </span>

            <strong>
              ${formatCurrency(grandTotal)}
            </strong>

          </div>

        </div>

      </section>


      <!-- =====================================================
           TERMS & CONDITIONS
      ====================================================== -->

      ${
        terms.length
          ? `
            <section class="quotation-preview-terms">

              <h3>
                TERMS & CONDITIONS
              </h3>

              <ol>
                ${terms
                  .map(
                    (term) => `
                      <li>
                        ${escapeHtml(term.term_text || "")}
                      </li>
                    `,
                  )
                  .join("")}
              </ol>

            </section>
          `
          : ""
      }


      <!-- =====================================================
           REMARKS
      ====================================================== -->

      ${
        quotation.remarks
          ? `
            <section class="quotation-preview-remarks">

              <h3>
                REMARKS
              </h3>

              <p>
                ${escapeHtml(quotation.remarks)}
              </p>

            </section>
          `
          : ""
      }


      <!-- =====================================================
           SIGNATURE
      ====================================================== -->

            <section class="quotation-signature">

  <div class="quotation-signature-box">

    <div class="quotation-for-company">
      For ${escapeHtml(companyName)}
    </div>

    ${
      companyStamp
        ? `
          <div class="quotation-stamp">
            <img
              src="${escapeHtml(companyStamp)}"
              alt="Company Stamp"
            />
          </div>
        `
        : ""
    }

    <div class="quotation-sign-line">
      SIGNATURE
    </div>

    <div class="quotation-authorized">
      ${
        authorizedSignatory
          ? escapeHtml(authorizedSignatory)
          : "Authorized Signatory"
      }
    </div>

  </div>

</section>

  `;
  };

  /* ========================================
     CLOSE VIEW
  ======================================== */

  const closeView = () => {
    elements.viewModal.hidden = true;

    state.viewingId = null;

    document.body.style.overflow = "";
  };

  /* ========================================
     DELETE MODAL
  ======================================== */

  const openDeleteModal = (id) => {
    const quotation = state.quotations.find(
      (item) => Number(item.id) === Number(id),
    );

    if (!quotation) {
      showToast("Quotation not found.", "error");

      return;
    }

    state.deletingId = Number(id);

    elements.deleteMessage.textContent = `Delete ${
      quotation.quotation_no
    }? This action cannot be undone.`;

    elements.confirmDeleteButton.disabled = false;

    elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-trash-can"></i>
      Delete
    `;

    elements.deleteModal.hidden = false;

    elements.deleteModal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";
  };

  // const closeDeleteModal = () => {
  //   elements.deleteModal.hidden = true;

  //   elements.deleteModal.setAttribute("aria-hidden", "true");

  //   state.deletingId = null;

  //   document.body.style.overflow = "";
  // };

  const closeDeleteModal = () => {
    elements.deleteModal.hidden = true;

    elements.deleteModal.setAttribute("aria-hidden", "true");

    state.deletingId = null;
    state.deletingTermId = null;

    document.body.style.overflow = "";
  };
  const openDeleteTermConfirmation = (termId) => {
    const id = Number(termId);

    if (!Number.isSafeInteger(id) || id <= 0) {
      showToast("Invalid quotation term.", "error");
      return;
    }

    const term = state.terms.find((item) => Number(item.id) === id);

    if (!term) {
      showToast("Quotation term not found.", "error");
      return;
    }

    // Store term ID separately
    state.deletingTermId = id;

    // Use EXISTING delete confirmation modal
    elements.deleteMessage.textContent = `Delete this quotation term? "${term.term_text}" This action cannot be undone.`;

    // Reset confirm button
    elements.confirmDeleteButton.disabled = false;

    elements.confirmDeleteButton.innerHTML = `
    <i class="fa-solid fa-trash-can"></i>
    Delete
  `;

    // Open existing confirmation modal
    elements.deleteModal.hidden = false;
    elements.deleteModal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";
  };

  const closeConfirmationModal = () => {
    if (elements.confirmationModal) {
      elements.confirmationModal.hidden = true;
    }

    document.body.style.overflow = "";

    state.deletingTermId = null;
  };
  /* ========================================
     DELETE QUOTATION
  ======================================== */

  // const confirmDeleteQuotation = async () => {
  //   const id = state.deletingId;

  //   if (!id) {
  //     closeDeleteModal();

  //     return;
  //   }

  //   try {
  //     elements.confirmDeleteButton.disabled = true;

  //     elements.confirmDeleteButton.innerHTML = `
  //         <i class="fa-solid fa-spinner fa-spin"></i>
  //         Deleting...
  //       `;

  //     await apiRequest(`/api/quotations/${id}`, {
  //       method: "DELETE",
  //     });

  //     closeDeleteModal();

  //     showToast("Quotation deleted successfully.");

  //     await loadQuotations();
  //   } catch (error) {
  //     console.error("[Quotation] delete error:", error);

  //     elements.confirmDeleteButton.disabled = false;

  //     elements.confirmDeleteButton.innerHTML = `
  //         <i class="fa-solid fa-trash-can"></i>
  //         Delete
  //       `;

  //     showToast(error.message || "Unable to delete quotation.", "error");
  //   }
  // };

  const confirmDeleteQuotation = async () => {
    // ==========================================
    // DELETE TERM
    // ==========================================

    if (state.deletingTermId) {
      const termId = Number(state.deletingTermId);

      if (!Number.isSafeInteger(termId) || termId <= 0) {
        closeDeleteModal();
        return;
      }

      try {
        elements.confirmDeleteButton.disabled = true;

        elements.confirmDeleteButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Deleting...
      `;

        await apiRequest(`/api/quotations/terms/${termId}`, {
          method: "DELETE",
        });

        // Remove from currently selected terms
        state.selectedTerms = state.selectedTerms.filter(
          (id) => Number(id) !== termId,
        );

        // Close confirmation modal
        closeDeleteModal();

        showToast("Quotation term deleted successfully.", "success");

        // Reload terms
        const response = await apiRequest("/api/quotations/terms");

        state.terms = Array.isArray(response)
          ? response
          : response?.terms || response?.data || [];

        renderTerms();

        return;
      } catch (error) {
        console.error("[Quotation] term delete error:", error);

        elements.confirmDeleteButton.disabled = false;

        elements.confirmDeleteButton.innerHTML = `
        <i class="fa-solid fa-trash-can"></i>
        Delete
      `;

        showToast(error.message || "Unable to delete quotation term.", "error");

        return;
      }
    }

    // ==========================================
    // DELETE QUOTATION
    // ==========================================

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

      await apiRequest(`/api/quotations/${id}`, {
        method: "DELETE",
      });

      closeDeleteModal();

      showToast("Quotation deleted successfully.", "success");

      await loadQuotations();
    } catch (error) {
      console.error("[Quotation] delete error:", error);

      elements.confirmDeleteButton.disabled = false;

      elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-trash-can"></i>
      Delete
    `;

      showToast(error.message || "Unable to delete quotation.", "error");
    }
  };
  /* ========================================
     PRINT
  ======================================== */

  const printQuotation = () => {
    if (!state.viewingId) {
      return;
    }

    const preview = document.querySelector(
      "#quotationDetailsContent .quotation-preview",
    );

    if (!preview) {
      showToast("Quotation preview not found.", "error");
      return;
    }

    document.body.classList.add("printing-quotation");

    // Give browser a moment to apply print layout
    setTimeout(() => {
      window.print();

      setTimeout(() => {
        document.body.classList.remove("printing-quotation");
      }, 300);
    }, 100);
  };


  /* ========================================
   DOWNLOAD ONE-PAGE PDF
======================================== */

const downloadQuotationPdf = async () => {
  if (!state.viewingId) {
    showToast("Quotation not found.", "error");
    return;
  }

  const preview = document.querySelector(
    "#quotationDetailsContent .quotation-preview",
  );

  if (!preview) {
    showToast("Quotation preview not found.", "error");
    return;
  }

  // Check PDF libraries
  if (
    typeof window.html2canvas !== "function" ||
    !window.jspdf?.jsPDF
  ) {
    showToast(
      "PDF library is not loaded. Please refresh the page.",
      "error",
    );
    return;
  }

  const button = elements.downloadPdf;
  const originalHtml = button?.innerHTML || "";

  try {
    /* ---------------------------------------
       LOADING
    --------------------------------------- */

    if (button) {
      button.disabled = true;

      button.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Generating PDF...</span>
      `;
    }

    /* ---------------------------------------
       RENDER QUOTATION PREVIEW
    --------------------------------------- */

    const canvas = await window.html2canvas(preview, {
      scale: 2,

      useCORS: true,

      allowTaint: false,

      backgroundColor: "#ffffff",

      logging: false,

      imageTimeout: 15000,

      scrollX: 0,

      scrollY: 0,
    });

    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    const pageWidth = 210;
    const pageHeight = 297;

    const margin = 6;

    const quotationWidth = pageWidth - margin * 2;
    const quotationHeight = pageHeight - margin * 2;

    const imageData = canvas.toDataURL(
      "image/jpeg",
      0.96,
    );

    pdf.addImage(
      imageData,
      "JPEG",
      margin,
      margin,
      quotationWidth,
      quotationHeight,
      undefined,
      "FAST",
    );

    /* ---------------------------------------
   FILE NAME
--------------------------------------- */

const quotationNo =
  preview
    .querySelector(".quotation-meta-left strong")
    ?.textContent
    ?.trim() ||
  `quotation-${state.viewingId}`;

// Customer / Party Name
const partyName =
  preview
    .querySelector(".quotation-customer-name")
    ?.textContent
    ?.trim() ||
  "Customer";

// Clean filename parts
const safePartyName = partyName
  .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const safeQuotationNo = quotationNo
  .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const fileName =
  `${safePartyName || "Customer"} - ${safeQuotationNo || `Quotation-${state.viewingId}`}.pdf`;

    /* ---------------------------------------
       DOWNLOAD
    --------------------------------------- */

   pdf.save(fileName);

    showToast(
      "Quotation PDF downloaded successfully.",
      "success",
    );

  } catch (error) {

    console.error(
      "[Quotation] PDF download error:",
      error,
    );

    showToast(
      error?.message ||
        "Unable to generate quotation PDF.",
      "error",
    );

  } finally {

    /* ---------------------------------------
       RESTORE BUTTON
    --------------------------------------- */

    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};
  /* ========================================
     TABLE ACTION
  ======================================== */

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

  /* ========================================
     BIND EVENTS
  ======================================== */

  const bindEvents = () => {
    /* ---------------------------------------
       NEW QUOTATION
    --------------------------------------- */

    elements.addButton?.addEventListener("click", (event) => {
      event.preventDefault();

      openModal();
    });

    elements.emptyAdd?.addEventListener("click", (event) => {
      event.preventDefault();

      openModal();
    });

    /* ---------------------------------------
       CLOSE QUOTATION
    --------------------------------------- */

    elements.closeModal?.addEventListener("click", closeModal);

    elements.cancel?.addEventListener("click", closeModal);

    /* ---------------------------------------
       FORM
    --------------------------------------- */

    elements.form?.addEventListener("submit", saveQuotation);

    /* ---------------------------------------
       CUSTOMER
    --------------------------------------- */

    elements.customerId?.addEventListener("change", updateCustomerInfo);

    /* ---------------------------------------
       VALID UNTIL
    --------------------------------------- */

    elements.quotationDate?.addEventListener("change", () => {
      if (
        !elements.validUntil.value ||
        elements.validUntil.value < elements.quotationDate.value
      ) {
        elements.validUntil.value = addDays(elements.quotationDate.value, 15);
      }
    });

    /* ---------------------------------------
       ADD ITEM
    --------------------------------------- */

    elements.addItem?.addEventListener("click", (event) => {
      event.preventDefault();

      addItem();
    });

    /* ---------------------------------------
       ITEM EVENTS
    --------------------------------------- */

    elements.itemsBody?.addEventListener("change", (event) => {
      const row = event.target.closest("tr");

      if (row) {
        updateItemFromRow(row);
      }
    });

    elements.itemsBody?.addEventListener("input", (event) => {
      const row = event.target.closest("tr");

      if (row) {
        updateItemFromRow(row);
      }
    });

    elements.itemsBody?.addEventListener("click", (event) => {
      const button = event.target.closest('[data-action="remove-item"]');

      if (button) {
        removeItem(button.dataset.uid);
      }
    });

    /* ---------------------------------------
       DISCOUNT
    --------------------------------------- */

    elements.discount?.addEventListener("input", updateTotal);

    /* ---------------------------------------
       TERMS
    --------------------------------------- */

    elements.termsList?.addEventListener("change", updateSelectedTerms);

    elements.termsList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");

      if (!button) return;

      const action = button.dataset.action;
      const termId = Number(button.dataset.termId);

      if (!Number.isSafeInteger(termId) || termId <= 0) {
        showToast("Invalid quotation term.", "error");
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      // EDIT TERM
      if (action === "edit-term") {
        openEditTermModal(termId);
        return;
      }

      // DELETE TERM
      if (action === "delete-term") {
        openDeleteTermConfirmation(termId);
        return;
      }
    });

    elements.addNewTermButton?.addEventListener("click", openTermModal);

    elements.closeTermModal?.addEventListener("click", closeTermModal);

    elements.cancelTerm?.addEventListener("click", closeTermModal);

    elements.termForm?.addEventListener("submit", saveTerm);

    /* ---------------------------------------
       FILTERS
    --------------------------------------- */

    elements.search?.addEventListener("input", applyFilters);

    elements.customerFilter?.addEventListener("change", applyFilters);

    elements.dateFilter?.addEventListener("change", applyFilters);

    elements.resetFilters?.addEventListener("click", () => {
      elements.search.value = "";

      elements.customerFilter.value = "";

      elements.dateFilter.value = "";

      applyFilters();
    });

    /* ---------------------------------------
       PAGINATION
    --------------------------------------- */

    elements.previousPage?.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;

        renderTable();
      }
    });

    elements.nextPage?.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(state.filteredQuotations.length / state.pageSize),
      );

      if (state.page < totalPages) {
        state.page += 1;

        renderTable();
      }
    });

    /* ---------------------------------------
       TABLE
    --------------------------------------- */

    elements.tableBody?.addEventListener("click", handleTableAction);

    /* ---------------------------------------
       VIEW MODAL
    --------------------------------------- */

    elements.closeViewButton?.addEventListener("click", closeView);

    elements.closeView?.addEventListener("click", closeView);

    elements.printQuotation?.addEventListener("click", printQuotation);

    elements.downloadPdf?.addEventListener("click", downloadQuotationPdf);

    /* ---------------------------------------
       DELETE
    --------------------------------------- */

    elements.cancelDeleteButton?.addEventListener("click", closeDeleteModal);

    elements.confirmDeleteButton?.addEventListener(
      "click",
      confirmDeleteQuotation,
    );

    /* ---------------------------------------
       MODAL BACKDROP
    --------------------------------------- */

    elements.modal?.addEventListener("click", (event) => {
      if (event.target === elements.modal) {
        closeModal();
      }
    });

    elements.viewModal?.addEventListener("click", (event) => {
      if (event.target === elements.viewModal) {
        closeView();
      }
    });

    elements.termModal?.addEventListener("click", (event) => {
      if (event.target === elements.termModal) {
        closeTermModal();
      }
    });

    elements.deleteModal?.addEventListener("click", (event) => {
      if (event.target === elements.deleteModal) {
        closeDeleteModal();
      }
    });

    /* ---------------------------------------
       ESCAPE
    --------------------------------------- */

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (elements.deleteModal && !elements.deleteModal.hidden) {
        closeDeleteModal();

        return;
      }

      if (elements.termModal && !elements.termModal.hidden) {
        closeTermModal();

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

  /* ========================================
     CACHE ELEMENTS
  ======================================== */

  const cacheElements = () => {
    elements.addButton = qs("#addQuotationButton");

    elements.emptyAdd = qs("#emptyAddQuotation");

    elements.totalQuotations = qs("#totalQuotations");

    elements.todayQuotations = qs("#todayQuotations");

    elements.expiredQuotations = qs("#expiredQuotations");

    elements.totalQuotationValue = qs("#totalQuotationValue");

    elements.search = qs("#quotationSearch");

    elements.customerFilter = qs("#customerFilter");

    elements.dateFilter = qs("#quotationDateFilter");

    elements.resetFilters = qs("#resetFilters");

    elements.tableBody = qs("#quotationsTableBody");

    elements.empty = qs("#quotationsEmpty");

    elements.count = qs("#quotationsCount");

    elements.previousPage = qs("#previousPage");

    elements.nextPage = qs("#nextPage");

    elements.pageNumber = qs("#pageNumber");

    /* ---------------------------------------
       FORM
    --------------------------------------- */

    elements.modal = qs("#quotationModal");

    elements.closeModal = qs("#closeQuotationModal");

    elements.cancel = qs("#cancelQuotation");

    elements.form = qs("#quotationForm");

    elements.modalTitle = qs("#quotationModalTitle");

    elements.quotationNo = qs("#quotationNo");

    elements.quotationDate = qs("#quotationDate");

    elements.validUntil = qs("#validUntil");

    elements.customerId = qs("#customerId");

    elements.customerInfo = qs("#customerInfo");

    elements.customerContactPerson = qs("#customerContactPerson");

    elements.customerMobile = qs("#customerMobile");

    elements.customerGstin = qs("#customerGstin");

    elements.customerAddress = qs("#customerAddress");

    elements.itemsBody = qs("#quotationItemsBody");

    elements.itemsError = qs("#itemsError");

    elements.noItemsMessage = qs("#noItemsMessage");

    elements.addItem = qs("#addQuotationItemButton");

    elements.subtotalAmount = qs("#subtotalAmount");

    elements.discount = qs("#discount");

    elements.discountAmount = qs("#discountAmount");

    elements.taxAmount = qs("#taxAmount");

    elements.grandTotal = qs("#grandTotal");

    elements.termsList = qs("#quotationTermsList");

    elements.addNewTermButton = qs("#addNewTermButton");

    elements.remarks = qs("#remarks");

    elements.saveQuotation = qs("#saveQuotation");

    /* ---------------------------------------
       TERM
    --------------------------------------- */

    elements.termModal = qs("#termModal");

    elements.closeTermModal = qs("#closeTermModal");

    elements.cancelTerm = qs("#cancelTerm");

    elements.termForm = qs("#termForm");

    elements.termModalTitle = qs("#termModalTitle");

    elements.termText = qs("#termText");

    elements.termSortOrder = qs("#termSortOrder");

    elements.termIsActive = qs("#termIsActive");

    elements.saveTerm = qs("#saveTerm");

    /* ---------------------------------------
       VIEW
    --------------------------------------- */

    elements.viewModal = qs("#viewQuotationModal");

    elements.closeViewButton = qs("#closeViewQuotationModal");

    elements.closeView = qs("#closeViewQuotation");

    elements.viewTitle = qs("#viewQuotationTitle");

    elements.viewSubtitle = qs("#viewQuotationSubtitle");

    elements.details = qs("#quotationDetailsContent");

    elements.downloadPdf = qs("#downloadQuotationPdf");

    elements.printQuotation = qs("#printQuotation");

    /* ---------------------------------------
       DELETE
    --------------------------------------- */

    elements.deleteModal = qs("#deleteModal");

    elements.deleteMessage = qs("#deleteMessage");

    elements.cancelDeleteButton = qs("#cancelDeleteButton");

    elements.confirmDeleteButton = qs("#confirmDeleteButton");

    /* ---------------------------------------
       TOAST
    --------------------------------------- */

    elements.toastContainer = qs("#toastContainer");
  };

  /* ========================================
     INIT
  ======================================== */

  const init = async () => {
    cacheElements();

    bindEvents();

    try {
      await loadOptions();

      await loadQuotations();
    } catch (error) {
      console.error("[Quotation] initialization error:", error);

      showToast(error.message, "error");
    }
  };

  return {
    init,
  };
})();

/* ========================================
   GLOBAL INIT
======================================== */

const initQuotationPage = () => QuotationPage.init();
