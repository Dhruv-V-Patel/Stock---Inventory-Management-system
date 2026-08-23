const PurchaseReportPage = (() => {
  const state = {
    rows: [],
    filteredRows: [],
    supplierWise: [],
    suppliers: [],
    page: 1,
    pageSize: 10,
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

  const number = (value) => Number(value || 0);

  const formatNumber = (value) =>
    new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 3,
    }).format(number(value));

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(number(value));

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

  const formatDateForExcel = (value) => {
    if (!value) return "";

    const [year, month, day] = String(value).slice(0, 10).split("-");

    return `${day}-${month}-${year}`;
  };

  const getDateRangeLabel = () => {
    const from = elements.fromDate.value;

    const to = elements.toDate.value;

    if (from && to) {
      return `${formatDateForExcel(from)} to ${formatDateForExcel(to)}`;
    }

    if (from) {
      return `From ${formatDateForExcel(from)}`;
    }

    if (to) {
      return `To ${formatDateForExcel(to)}`;
    }

    return "All Dates";
  };

  const apiRequest = async (url, options = {}) => {
    const token = localStorage.getItem("accessToken");

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

    const contentType = response.headers.get("content-type") || "";

    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          payload ||
          `Request failed with status ${response.status}`,
      );
    }

    return payload;
  };

  const showToast = (message, type = "info") => {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
      return;
    }

    const container = elements.toastContainer;

    if (!container) return;

    const toast = document.createElement("div");

    toast.className = `purchase-report-toast ${type}`;

    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  };

  const buildQuery = () => {
    const params = new URLSearchParams();

    const values = {
      search: elements.search.value.trim(),

      supplier_id: elements.supplierFilter.value,

      payment_status: elements.statusFilter.value,

      from_date: elements.fromDate.value,

      to_date: elements.toDate.value,
    };

    Object.entries(values).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    return params.toString();
  };

  const updateSummary = (summary) => {
    elements.totalPurchases.textContent = formatNumber(summary?.totalPurchases);

    elements.purchaseValue.textContent = formatCurrency(summary?.purchaseValue);

    elements.purchaseReturnValue.textContent = formatCurrency(summary?.purchaseReturnValue);

elements.netPurchaseValue.textContent =  formatCurrency(summary?.netPurchaseValue);

    elements.paidAmount.textContent = formatCurrency(summary?.paidAmount);

    elements.pendingAmount.textContent = formatCurrency(summary?.pendingAmount);

    // elements.totalItems.textContent = formatNumber(summary?.totalItems);
  };

  const renderSupplierWise = () => {
    const rows = state.supplierWise;

    if (!rows.length) {
      elements.supplierWiseBody.innerHTML = "";

      elements.supplierWiseEmpty.hidden = false;

      return;
    }

    elements.supplierWiseEmpty.hidden = true;

    elements.supplierWiseBody.innerHTML = rows
      .map(
        (row, index) => `
            <tr>

              <td>
                ${index + 1}
              </td>

              <td>
                <strong>
                  ${escapeHtml(row.supplier_name || "—")}
                </strong>
              </td>

              <td>
                ${formatNumber(row.purchase_count)}
              </td>

              <td>
                ${formatNumber(row.item_count)}
              </td>

              <td>
                ${formatCurrency(row.subtotal)}
              </td>

              <td>
                ${formatCurrency(row.discount)}
              </td>

              <td>
                ${formatCurrency(row.tax_amount)}
              </td>

              <td>
                ${formatCurrency(row.freight_amount)}
              </td>

              <td>
                <strong>
                  ${formatCurrency(row.total_amount)}
                </strong>
              </td>
              <td class="purchase-return-amount">
                ${formatCurrency(row.purchase_return_amount)}
              </td>

              <td class="purchase-net-amount">
                <strong>
                  ${formatCurrency(row.net_purchase_amount)}
                </strong>
              </td>

            </tr>
          `,
      )
      .join("");
  };

  const paymentBadge = (status) => {
    const normalized = String(status || "PENDING").toLowerCase();

    const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);

    return `
      <span
        class="payment-badge ${normalized}"
      >
        <i class="fa-solid ${
          normalized === "paid"
            ? "fa-circle-check"
            : normalized === "partial"
              ? "fa-circle-half-stroke"
              : "fa-clock"
        }"></i>

        ${escapeHtml(label)}

      </span>
    `;
  };

  const renderLoading = () => {
    elements.purchaseBody.innerHTML = `
      <tr>
        <td colspan="12">

          <div class="report-loading">

            <i
              class="fa-solid fa-spinner fa-spin"
            ></i>

            Loading purchases...

          </div>

        </td>
      </tr>
    `;

    elements.purchaseEmpty.hidden = true;
  };

  const renderPurchases = () => {
    const rows = state.filteredRows;

    if (!rows.length) {
      elements.purchaseBody.innerHTML = "";

      elements.purchaseEmpty.hidden = false;

      elements.reportCount.textContent = "Showing 0 purchases";

      updatePagination();

      return;
    }

    elements.purchaseEmpty.hidden = true;

    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));

    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.pageSize;

    const pageRows = rows.slice(start, start + state.pageSize);

    elements.purchaseBody.innerHTML = pageRows
      .map(
        (purchase, index) => `

            <tr>

              <td>
                ${start + index + 1}
              </td>


              <td>

                <strong>
                  ${escapeHtml(purchase.purchase_no)}
                </strong>

              </td>


              <td>
                ${escapeHtml(formatDate(purchase.purchase_date))}
              </td>


              <td>

                <span class="supplier-name">
                  ${escapeHtml(purchase.supplier_name || "—")}
                </span>

              </td>


              <td>

                <span class="muted">
                  ${escapeHtml(purchase.invoice_no || "—")}
                </span>

              </td>


              <td>
                ${formatNumber(purchase.item_count)}
              </td>


              <td>
                ${formatCurrency(purchase.subtotal)}
              </td>


              <td>
                ${formatCurrency(purchase.tax_amount)}
              </td>


              <td>
                ${formatCurrency(purchase.freight_amount)}
              </td>


              <td>

                <strong>
                  ${formatCurrency(purchase.total_amount)}
                </strong>

              </td>

              <td class="purchase-return-amount">
                ${formatCurrency(purchase.purchase_return_amount)}
              </td>

              <td class="purchase-net-amount">
                <strong>
                  ${formatCurrency(purchase.net_purchase_amount)}
                </strong>
              </td>


              <td>
                ${paymentBadge(purchase.payment_status)}
              </td>


              <td class="action-column">

                <button
                  class="table-action"
                  type="button"
                  data-action="view"
                  data-id="${purchase.id}"
                  title="View purchase"
                  aria-label="View purchase"
                >

                  <i
                    class="fa-solid fa-eye"
                  ></i>

                </button>

              </td>

            </tr>
          `,
      )
      .join("");

    elements.reportCount.textContent = `Showing ${start + 1}-${Math.min(
      start + pageRows.length,
      rows.length,
    )} of ${rows.length} purchases`;

    updatePagination();
  };

  const updatePagination = () => {
    const totalPages = Math.max(
      1,
      Math.ceil(state.filteredRows.length / state.pageSize),
    );

    elements.pageNumber.textContent = state.page;

    elements.previousPage.disabled = state.page <= 1;

    elements.nextPage.disabled = state.page >= totalPages;
  };

  const applyClientFilters = () => {
    const search = elements.search.value.trim().toLowerCase();

    state.filteredRows = state.rows.filter((row) => {
      if (!search) {
        return true;
      }

      return [row.purchase_no, row.supplier_name, row.invoice_no]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    state.page = 1;

    renderPurchases();
  };

  const loadOptionsIntoFilter = () => {
    elements.supplierFilter.innerHTML = `
      <option value="">
        All Suppliers
      </option>

      ${state.suppliers
        .map(
          (supplier) => `
            <option
              value="${supplier.id}"
            >
              ${escapeHtml(supplier.name)}
            </option>
          `,
        )
        .join("")}
    `;
  };

  const loadReport = async () => {
    renderLoading();

    try {
      const query = buildQuery();

      const payload = await apiRequest(
        `/api/purchase-report${query ? `?${query}` : ""}`,
      );

      state.rows = Array.isArray(payload?.rows) ? payload.rows : [];

      state.supplierWise = Array.isArray(payload?.supplierWise)
        ? payload.supplierWise
        : [];

      state.suppliers = Array.isArray(payload?.suppliers)
        ? payload.suppliers
        : [];

      updateSummary(payload?.summary || {});

      loadOptionsIntoFilter();

      /*
       * Keep selected supplier after
       * rebuilding options.
       */
      if (elements.supplierFilter.value) {
        elements.supplierFilter.value = String(elements.supplierFilter.value);
      }

      renderSupplierWise();

      state.filteredRows = [...state.rows];

      state.page = 1;

      renderPurchases();

      elements.reportPeriod.textContent = `Report Period: ${getDateRangeLabel()}`;
    } catch (error) {
      console.error("Failed to load purchase report:", error);

      elements.purchaseBody.innerHTML = `
        <tr>
          <td colspan="12">

            <div class="report-error">

              <i
                class="fa-solid fa-circle-exclamation"
              ></i>

              ${escapeHtml(error.message || "Unable to load purchase report.")}

            </div>

          </td>
        </tr>
      `;

      showToast(error.message || "Unable to load purchase report.", "error");
    }
  };

  const openDetail = async (id) => {
    elements.purchaseDetailModal.hidden = false;

    document.body.style.overflow = "hidden";

    elements.purchaseModalBody.innerHTML = `
      <div class="report-loading">

        <i
          class="fa-solid fa-spinner fa-spin"
        ></i>

        Loading purchase details...

      </div>
    `;

    try {
      const payload = await apiRequest(`/api/purchases/${id}`);

      const purchase = payload?.purchase;

      if (!purchase) {
        throw new Error("Purchase not found.");
      }

      elements.modalPurchaseNo.textContent =
        purchase.purchase_no || "Purchase Details";

      elements.modalPurchaseSubtitle.textContent = `${purchase.supplier_name || "—"} · ${formatDate(
        purchase.purchase_date,
      )}`;

      const items = Array.isArray(purchase.items) ? purchase.items : [];

      elements.purchaseModalBody.innerHTML = `

        <div class="details-grid">

          <div class="detail-box">
            <span>Supplier</span>
            <strong>
              ${escapeHtml(purchase.supplier_name || "—")}
            </strong>
          </div>


          <div class="detail-box">
            <span>Purchase Date</span>
            <strong>
              ${escapeHtml(formatDate(purchase.purchase_date))}
            </strong>
          </div>


          <div class="detail-box">
            <span>Invoice No.</span>
            <strong>
              ${escapeHtml(purchase.invoice_no || "—")}
            </strong>
          </div>


          <div class="detail-box">
            <span>Payment Status</span>
            <strong>
              ${paymentBadge(purchase.payment_status)}
            </strong>
          </div>


          <div class="detail-box">
            <span>Vehicle No.</span>
            <strong>
              ${escapeHtml(purchase.vehicle_no || "—")}
            </strong>
          </div>


          <div class="detail-box">
            <span>Transporter</span>
            <strong>
              ${escapeHtml(purchase.driver_name || "—")}
            </strong>
          </div>

        </div>


        <section class="modal-section">

          <div class="modal-section-title">

            <h3>
              Purchased Items
            </h3>

            <span>
              ${formatNumber(items.length)} items
            </span>

          </div>


          <div class="table-responsive">

            <table class="data-table modal-table">

              <thead>

                <tr>
                  <th>#</th>
                  <th>Raw Material</th>
                  <th>Code</th>
                  <th>Purchased</th>
                  <th>Returned</th>
                  <th>Remaining</th>
                  <th>Unit</th>
                  <th>Rate</th>
                  <th>Purchase Amount</th>
                  <th>Return Amount</th>
                  <th>Net Amount</th>
                </tr>

              </thead>


              <tbody>

                ${
                  items.length
                    ? items
                        .map(
                          (item, index) => `

                            <tr>

                              <td>
                                ${index + 1}
                              </td>

                              <td>
                                <strong>
                                  ${escapeHtml(item.material_name || "—")}
                                </strong>
                              </td>

                              <td>
                                ${escapeHtml(item.material_code || "—")}
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

                              <td class="purchase-remaining-qty">
                                ${formatNumber(item.remaining_quantity)}
                              </td>

                              <td>
                                ${escapeHtml(item.unit || "—")}
                              </td>

                              <td>
                                ${formatCurrency(item.rate)}
                              </td>

                              <td>
                                <strong>
                                  ${formatCurrency(item.amount)}
                                </strong>
                              </td>
                              <td class="purchase-return-amount">
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
                        .join("")
                    : `
                        <tr>
                          <td
                            colspan="11"
                            class="empty-cell"
                          >
                            No items found.
                          </td>
                        </tr>
                      `
                }

              </tbody>

            </table>

          </div>

        </section>


        <section class="purchase-total-box">

          <div>
            <span>Subtotal</span>
            <strong>
              ${formatCurrency(purchase.subtotal)}
            </strong>
          </div>


          <div>
            <span>Discount</span>
            <strong>
              ${formatCurrency(purchase.discount)}
            </strong>
          </div>


          <div>
            <span>Tax</span>
            <strong>
              ${formatCurrency(purchase.tax_amount)}
            </strong>
          </div>


          <div>
            <span>Freight</span>
            <strong>
              ${formatCurrency(purchase.freight_amount)}
            </strong>
          </div>

          <div class="purchase-return-total">

            <span>Purchase Return</span>

            <strong>
              ${
                Number(purchase.purchase_return_amount || 0) > 0
                  ? `-${formatCurrency(purchase.purchase_return_amount)}`
                  : formatCurrency(0)
              }
            </strong>

          </div>

          <div class="grand-total">

            <span>
              Grand Total
            </span>

            <strong>
              ${formatCurrency(purchase.net_purchase_amount)}
            </strong>

          </div>

        </section>


        ${
          purchase.remarks
            ? `
              <div class="remarks-box">

                <span>
                  Remarks
                </span>

                <p>
                  ${escapeHtml(purchase.remarks)}
                </p>

              </div>
            `
            : ""
        }

      `;
    } catch (error) {
      elements.purchaseModalBody.innerHTML = `
        <div class="report-error">
          <i
            class="fa-solid fa-circle-exclamation"
          ></i>

          ${escapeHtml(error.message || "Unable to load purchase details.")}
        </div>
      `;
    }
  };

  const closeDetail = () => {
    elements.purchaseDetailModal.hidden = true;

    document.body.style.overflow = "";
  };

  const exportExcel = () => {
    if (typeof XLSX === "undefined") {
      showToast("Excel library is not loaded.", "error");
      return;
    }

    const button = elements.exportReport;

    const originalHtml = button.innerHTML;

    try {
      button.disabled = true;

      button.innerHTML = `
        <i
          class="fa-solid fa-spinner fa-spin"
        ></i>

        <span>Exporting...</span>
      `;

      const workbook = XLSX.utils.book_new();

      const dateRange = getDateRangeLabel();

      /*
       * SHEET 1
       * Purchase Summary
       */
      const summaryRows = [
        {
          "Report Period": dateRange,
          "Total Purchases": state.rows.length,
          "Total Purchase Value": state.rows.reduce(
            (sum, row) => sum + number(row.total_amount),
            0,
          ),
          "Purchase Return Value": state.rows.reduce(
            (sum, row) => sum + number(row.purchase_return_amount),
            0,
          ),
          "Net Purchase Value": state.rows.reduce(
            (sum, row) => sum + number(row.net_purchase_amount),
            0,
          ),
          "Paid Amount": state.rows.reduce(
            (sum, row) => sum + number(row.paid_amount),
            0,
          ),
          "Pending Amount": state.rows.reduce(
            (sum, row) => sum + number(row.due_amount),
            0,
          ),

          "Total Items": state.rows.reduce(
            (sum, row) => sum + number(row.item_count),
            0,
          ),
        },
      ];

      const summarySheet = XLSX.utils.json_to_sheet(summaryRows);

      summarySheet["!cols"] = [
        { wch: 24 },
        { wch: 18 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 18 },
      ];

      XLSX.utils.book_append_sheet(workbook, summarySheet, "Purchase Summary");

      /*
       * SHEET 2
       * Supplier Wise
       */
      const supplierRows = state.supplierWise.map((row, index) => ({
        "#": index + 1,
        Supplier: row.supplier_name || "",
        Purchases: number(row.purchase_count),
        Items: number(row.item_count),
        Subtotal: number(row.subtotal),
        Discount: number(row.discount),
        Tax: number(row.tax_amount),
        Freight: number(row.freight_amount),
        Total: number(row.total_amount),
        Return: number(row.purchase_return_amount),
        Net_Total: number(row.net_purchase_amount),
      }));

      const supplierSheet = XLSX.utils.json_to_sheet(supplierRows);

      supplierSheet["!cols"] = [
        { wch: 6 },
        { wch: 30 },
        { wch: 12 },
        { wch: 12 },
        { wch: 18 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
      ];

      if (supplierRows.length) {
        supplierSheet["!autofilter"] = {
          ref: supplierSheet["!ref"],
        };
      }

      supplierSheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };

      XLSX.utils.book_append_sheet(workbook, supplierSheet, "Supplier Wise");

      /*
       * SHEET 3
       * Purchase Entries
       */
      const purchaseRows = state.rows.map((row, index) => ({
        "#": index + 1,
        "Purchase No.": row.purchase_no,
        Date: formatDateForExcel(row.purchase_date),
        Supplier: row.supplier_name,
        "Invoice No.": row.invoice_no || "",
        Items: number(row.item_count),
        Subtotal: number(row.subtotal),
        Discount: number(row.discount),
        Tax: number(row.tax_amount),
        Freight: number(row.freight_amount),
        Total: number(row.total_amount),
        Return: number(row.purchase_return_amount),
        Net_Total: number(row.net_purchase_amount),
        Paid: number(row.paid_amount),
        Due: number(row.due_amount),
        "Payment Status": row.payment_status,
      }));

      const purchaseSheet = XLSX.utils.json_to_sheet(purchaseRows);

      purchaseSheet["!cols"] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 14 },
        { wch: 28 },
        { wch: 18 },
        { wch: 10 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 18 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
      ];

      if (purchaseRows.length) {
        purchaseSheet["!autofilter"] = {
          ref: purchaseSheet["!ref"],
        };
      }

      purchaseSheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };

      XLSX.utils.book_append_sheet(workbook, purchaseSheet, "Purchase Entries");

      /*
       * SHEET 4
       * Purchase Items
       */
      const itemRows = [];

      state.rows.forEach((purchase) => {
        /*
         * Main report does not contain items.
         * They are loaded separately during
         * detail view, so export all items
         * from the purchases endpoint.
         *
         * This sheet will be populated by
         * loadPurchaseItemsForExport().
         */
      });

      /*
       * We intentionally export Purchase Items
       * using the already loaded item cache.
       */
      const cachedItems = Object.values(itemCache).flat();

      cachedItems.forEach((item) => {
        itemRows.push({
          "Purchase No.": item.purchase_no,
          "Purchase Date": formatDateForExcel(item.purchase_date),
          Supplier: item.supplier_name,
          "Raw Material": item.material_name,
          "Material Code": item.material_code,
          Quantity: number(item.quantity),
          Unit: item.unit,
          Rate: number(item.rate),
          Amount: number(item.amount),
        });
      });

      const itemSheet = XLSX.utils.json_to_sheet(itemRows);

      itemSheet["!cols"] = [
        { wch: 18 },
        { wch: 16 },
        { wch: 28 },
        { wch: 30 },
        { wch: 18 },
        { wch: 14 },
        { wch: 10 },
        { wch: 16 },
        { wch: 18 },
      ];

      if (itemRows.length) {
        itemSheet["!autofilter"] = {
          ref: itemSheet["!ref"],
        };
      }

      itemSheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };

      XLSX.utils.book_append_sheet(workbook, itemSheet, "Purchase Items");

      /*
 * SHEET 5
 * Purchase Return Items
 */

const purchaseReturnRows =
  Object.values(purchaseReturnItemCache)
    .flat()
    .map((item) => ({
      "Return No.": item.return_no,
      "Return Date": formatDateForExcel(
        item.return_date,
      ),
      "Purchase No.": item.purchase_no,
      Supplier: item.supplier_name,

      "Raw Material":
        item.material_name || "",

      "Material Code":
        item.material_code || "",

      Quantity: number(item.quantity),

      Unit: item.unit || "",

      Rate: number(item.rate),

      Amount: number(item.amount),

      Reason: item.reason || "",

      Remarks: item.return_remarks || "",
    }));

const purchaseReturnSheet =
  XLSX.utils.json_to_sheet(
    purchaseReturnRows,
  );

purchaseReturnSheet["!cols"] = [
  { wch: 18 }, // Return No.
  { wch: 16 }, // Return Date
  { wch: 18 }, // Purchase No.
  { wch: 28 }, // Supplier
  { wch: 30 }, // Raw Material
  { wch: 18 }, // Material Code
  { wch: 14 }, // Quantity
  { wch: 10 }, // Unit
  { wch: 16 }, // Rate
  { wch: 18 }, // Amount
  { wch: 28 }, // Reason
  { wch: 35 }, // Remarks
];

if (purchaseReturnRows.length) {
  purchaseReturnSheet["!autofilter"] = {
    ref: purchaseReturnSheet["!ref"],
  };
}

purchaseReturnSheet["!freeze"] = {
  xSplit: 0,
  ySplit: 1,
};

XLSX.utils.book_append_sheet(
  workbook,
  purchaseReturnSheet,
  "Purchase Return Items",
);

      const from = elements.fromDate.value;

      const to = elements.toDate.value;

      const suffix =
        from && to
          ? `-${from}-to-${to}`
          : from
            ? `-from-${from}`
            : to
              ? `-to-${to}`
              : "";

      XLSX.writeFile(workbook, `purchase-report${suffix}.xlsx`);

      showToast("Purchase report exported successfully.", "success");
    } catch (error) {
      console.error("Purchase Excel export error:", error);

      showToast(error.message || "Unable to export Excel file.", "error");
    } finally {
      button.disabled = false;

      button.innerHTML = originalHtml;
    }
  };

  /*
   * Cache purchase items so Excel can
   * contain a Purchase Items sheet.
   */
  const itemCache = {};

  const loadAllItemsForExport = async () => {
    const purchases = state.rows;

    await Promise.all(
      purchases.map(async (purchase) => {
        if (itemCache[purchase.id]) {
          return;
        }

        try {
          const payload = await apiRequest(`/api/purchases/${purchase.id}`);

          const detail = payload?.purchase;

          if (!detail) {
            return;
          }

          itemCache[purchase.id] = (detail.items || []).map((item) => ({
            ...item,
            purchase_no: detail.purchase_no,
            purchase_date: detail.purchase_date,
            supplier_name: detail.supplier_name,
          }));
        } catch (error) {
          console.error(`Failed to load purchase ${purchase.id} items:`, error);
        }
      }),
    );
  };

  /*
 * Cache purchase return items so Excel can
 * contain a Purchase Return Items sheet.
 */
const purchaseReturnItemCache = {};

const loadAllPurchaseReturnItemsForExport = async () => {
  const purchases = state.rows;

  if (!purchases.length) {
    return;
  }

  const purchaseIds = new Set(
    purchases.map((purchase) => Number(purchase.id)),
  );

  try {
    const payload = await apiRequest(
      "/api/purchase-returns",
    );

    const returns = Array.isArray(payload?.returns)
      ? payload.returns
      : [];

    const relevantReturns = returns.filter(
      (purchaseReturn) =>
        purchaseIds.has(
          Number(purchaseReturn.purchase_id),
        ),
    );

    await Promise.all(
      relevantReturns.map(async (purchaseReturn) => {
        const returnId = Number(purchaseReturn.id);

        if (!returnId) {
          return;
        }

        if (purchaseReturnItemCache[returnId]) {
          return;
        }

        try {
          const detailPayload = await apiRequest(
            `/api/purchase-returns/${returnId}`,
          );

          const detail = detailPayload?.return;

          if (!detail) {
            return;
          }

          purchaseReturnItemCache[returnId] =
            (detail.items || []).map((item) => ({
              ...item,

              return_id: returnId,

              return_no:
                detail.return_no || "",

              return_date:
                detail.return_date || "",

              purchase_id:
                detail.purchase_id ||
                purchaseReturn.purchase_id,

              purchase_no:
                detail.purchase_no ||
                purchaseReturn.purchase_no ||
                "",

              supplier_name:
                detail.supplier_name ||
                purchaseReturn.supplier_name ||
                "",

              return_remarks:
                detail.remarks || "",
            }));
        } catch (error) {
          console.error(
            `Failed to load purchase return ${returnId}:`,
            error,
          );
        }
      }),
    );
  } catch (error) {
    console.error(
      "Failed to load purchase returns for Excel:",
      error,
    );

    throw new Error(
      "Unable to load purchase return items for Excel export.",
    );
  }
};

  const handleExport = async () => {
    const button = elements.exportReport;

    const originalHtml = button.innerHTML;

    try {
      button.disabled = true;

      button.innerHTML = `
        <i
          class="fa-solid fa-spinner fa-spin"
        ></i>

        <span>Exporting...</span>
      `;

      await loadAllItemsForExport();

      await loadAllPurchaseReturnItemsForExport();

      exportExcel();
    } catch (error) {
      button.disabled = false;

      button.innerHTML = originalHtml;

      showToast(error.message || "Unable to prepare Excel export.", "error");
    } finally {
      button.disabled = false;
      button.innerHTML =
        originalHtml || '<i class="fa-solid fa-file-excel"></i> Export';
    }
  };

  const bindEvents = () => {
    elements.search.addEventListener("input", () => {
      applyClientFilters();
    });

    elements.supplierFilter.addEventListener("change", loadReport);

    elements.statusFilter.addEventListener("change", loadReport);

    elements.fromDate.addEventListener("change", loadReport);

    elements.toDate.addEventListener("change", loadReport);

    elements.resetFilters.addEventListener("click", () => {
      elements.search.value = "";

      elements.supplierFilter.value = "";

      elements.statusFilter.value = "";

      elements.fromDate.value = "";

      elements.toDate.value = "";

      loadReport();
    });

    elements.previousPage.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;

        renderPurchases();
      }
    });

    elements.nextPage.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(state.filteredRows.length / state.pageSize),
      );

      if (state.page < totalPages) {
        state.page += 1;

        renderPurchases();
      }
    });

    elements.purchaseBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='view']");

      if (!button) return;

      openDetail(Number(button.dataset.id));
    });

    elements.closePurchaseModal.addEventListener("click", closeDetail);

    elements.purchaseDetailModal.addEventListener("click", (event) => {
      if (event.target === elements.purchaseDetailModal) {
        closeDetail();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.purchaseDetailModal.hidden) {
        closeDetail();
      }
    });

    elements.exportReport.addEventListener("click", handleExport);

    elements.printReport.addEventListener("click", () => window.print());
  };

  const init = async () => {
    elements.totalPurchases = qs("#totalPurchases");

    elements.purchaseValue = qs("#purchaseValue");

    elements.purchaseReturnValue = qs("#purchaseReturnValue");

    elements.netPurchaseValue = qs("#netPurchaseValue");

    elements.paidAmount = qs("#paidAmount");

    elements.pendingAmount = qs("#pendingAmount");

    elements.totalItems = qs("#totalItems");

    elements.search = qs("#search");

    elements.supplierFilter = qs("#supplierFilter");

    elements.statusFilter = qs("#statusFilter");

    elements.fromDate = qs("#fromDate");

    elements.toDate = qs("#toDate");

    elements.supplierWiseBody = qs("#supplierWiseBody");

    elements.supplierWiseEmpty = qs("#supplierWiseEmpty");

    elements.purchaseBody = qs("#purchaseBody");

    elements.purchaseEmpty = qs("#purchaseEmpty");

    elements.reportCount = qs("#reportCount");

    elements.pageNumber = qs("#pageNumber");

    elements.previousPage = qs("#previousPage");

    elements.nextPage = qs("#nextPage");

    elements.resetFilters = qs("#resetFilters");

    elements.printReport = qs("#printReport");

    elements.exportReport = qs("#exportReport");

    elements.reportPeriod = qs("#reportPeriod");

    elements.purchaseDetailModal = qs("#purchaseDetailModal");

    elements.closePurchaseModal = qs("#closePurchaseModal");

    elements.modalPurchaseNo = qs("#modalPurchaseNo");

    elements.modalPurchaseSubtitle = qs("#modalPurchaseSubtitle");

    elements.purchaseModalBody = qs("#purchaseModalBody");

    elements.toastContainer = qs("#toastContainer");

    bindEvents();

    await loadReport();
  };

  return {
    init,
  };
})();

const initPurchaseReportPage = () => PurchaseReportPage.init();
