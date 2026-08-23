const SaleReportPage = (() => {
  const state = {
    rows: [],
    filteredRows: [],
    customerWise: [],
    customers: [],
    page: 1,
    pageSize: 30,
    itemCache: {},
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

    const [year, month, day] = String(value)
      .slice(0, 10)
      .split("-");

    return `${day}-${month}-${year}`;
  };

  const getDateRangeLabel = () => {
    const from = elements.fromDate.value;
    const to = elements.toDate.value;

    if (from && to) {
      return `${formatDateForExcel(from)} to ${formatDateForExcel(to)}`;
    }

    if (from) return `From ${formatDateForExcel(from)}`;
    if (to) return `To ${formatDateForExcel(to)}`;

    return "All Dates";
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
      customer_id: elements.customerFilter.value,
      payment_status: elements.statusFilter.value,
      from_date: elements.fromDate.value,
      to_date: elements.toDate.value,
    };

    Object.entries(values).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    return params.toString();
  };

  const updateSummary = (summary = {}) => {
    elements.totalSales.textContent = formatNumber(summary.totalSales);
    elements.salesValue.textContent = formatCurrency(summary.salesValue);
    elements.salesReturnValue.textContent = formatCurrency(summary?.salesReturnValue);
elements.netSalesValue.textContent =  formatCurrency(summary?.netSalesValue);
    elements.paidAmount.textContent = formatCurrency(summary.paidAmount);
    elements.pendingAmount.textContent = formatCurrency(summary.pendingAmount);
    // elements.totalItems.textContent = formatNumber(summary.totalItems);
  };

  const renderCustomerWise = () => {
    const rows = state.customerWise;

    if (!rows.length) {
      elements.customerWiseBody.innerHTML = "";
      elements.customerWiseEmpty.hidden = false;
      return;
    }

    elements.customerWiseEmpty.hidden = true;

    elements.customerWiseBody.innerHTML = rows
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>
              <strong>${escapeHtml(row.customer_name || "—")}</strong>
            </td>
            <td>${formatNumber(row.sale_count)}</td>
            <td>${formatNumber(row.item_count)}</td>
            <td>${formatCurrency(row.subtotal)}</td>
            <td>${formatCurrency(row.discount)}</td>
            <td>${formatCurrency(row.tax_amount)}</td>
            <td>${formatCurrency(row.freight_amount)}</td>
            <td>
              <strong>${formatCurrency(row.total_amount)}</strong>
            </td>
            <td class="sales-return-amount">
                ${formatCurrency(row.sales_return_amount)}
            </td>
            <td class="sales-net-amount">
                <strong>
                  ${formatCurrency(row.net_sales_amount)}
                </strong>
              </td>
          </tr>
        `,
      )
      .join("");
  };

  const paymentBadge = (status) => {
    const normalized = String(status || "PENDING").toLowerCase();

    const label =
      normalized.charAt(0).toUpperCase() + normalized.slice(1);

    return `
      <span class="payment-badge ${normalized}">
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
    elements.saleBody.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="report-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading sales...
          </div>
        </td>
      </tr>
    `;

    elements.saleEmpty.hidden = true;
  };

  const renderSales = () => {
    const rows = state.filteredRows;

    if (!rows.length) {
      elements.saleBody.innerHTML = "";
      elements.saleEmpty.hidden = false;
      elements.reportCount.textContent = "Showing 0 sales";
      updatePagination();
      return;
    }

    elements.saleEmpty.hidden = true;

    const totalPages = Math.max(
      1,
      Math.ceil(rows.length / state.pageSize),
    );

    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);

    elements.saleBody.innerHTML = pageRows
      .map(
        (sale, index) => `
          <tr>
            <td>${start + index + 1}</td>

            <td>
              <strong>${escapeHtml(sale.sale_no)}</strong>
            </td>

            <td>${escapeHtml(formatDate(sale.sale_date))}</td>

            <td>
              <span class="supplier-name">
                ${escapeHtml(sale.customer_name || "—")}
              </span>
            </td>

            <td>
              <span class="muted">
                ${escapeHtml(sale.invoice_no || sale.sale_no || "—")}
              </span>
            </td>

            <td>${formatNumber(sale.item_count)}</td>

            <td>${formatCurrency(sale.subtotal)}</td>

            <td>${formatCurrency(sale.tax_amount)}</td>

            <td>${formatCurrency(sale.freight_amount)}</td>

            <td>
              <strong>${formatCurrency(sale.total_amount)}</strong>
            </td>
            <td class="sales-return-amount">
                ${formatCurrency(sale.sales_return_amount)}
              </td>

              <td class="sales-net-amount">
                <strong>
                  ${formatCurrency(sale.net_sales_amount)}
                </strong>
              </td>

            <td>${paymentBadge(sale.payment_status)}</td>

            <td class="action-column">
              <button
                class="table-action"
                type="button"
                data-action="view"
                data-id="${sale.id}"
                title="View sale"
                aria-label="View sale"
              >
                <i class="fa-solid fa-eye"></i>
              </button>
            </td>
          </tr>
        `,
      )
      .join("");

    elements.reportCount.textContent =
      `Showing ${start + 1}-${Math.min(
        start + pageRows.length,
        rows.length,
      )} of ${rows.length} sales`;

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
      if (!search) return true;

      return [
        row.sale_no,
        row.customer_name,
        row.invoice_no,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    state.page = 1;
    renderSales();
  };

  const loadOptionsIntoFilter = () => {
    elements.customerFilter.innerHTML = `
      <option value="">All Customers</option>
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

  const loadReport = async () => {
    renderLoading();

    try {
      const query = buildQuery();

      const payload = await apiRequest(
        `/api/sale-report${query ? `?${query}` : ""}`,
      );

      state.rows = Array.isArray(payload?.rows)
        ? payload.rows
        : [];

      state.customerWise = Array.isArray(payload?.customerWise)
        ? payload.customerWise
        : [];

      state.customers = Array.isArray(payload?.customers)
        ? payload.customers
        : [];

      updateSummary(payload?.summary || {});
      loadOptionsIntoFilter();
      renderCustomerWise();

      state.filteredRows = [...state.rows];
      state.page = 1;
      renderSales();

      elements.reportPeriod.textContent =
        `Report Period: ${getDateRangeLabel()}`;
    } catch (error) {
      console.error("Failed to load sale report:", error);

      elements.saleBody.innerHTML = `
        <tr>
          <td colspan="12">
            <div class="report-error">
              <i class="fa-solid fa-circle-exclamation"></i>
              ${escapeHtml(
                error.message || "Unable to load sales report.",
              )}
            </div>
          </td>
        </tr>
      `;

      showToast(
        error.message || "Unable to load sales report.",
        "error",
      );
    }
  };

  const openDetail = async (id) => {
    elements.saleDetailModal.hidden = false;
    document.body.style.overflow = "hidden";

    elements.saleModalBody.innerHTML = `
      <div class="report-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Loading sale details...
      </div>
    `;

    try {
      const payload = await apiRequest(`/api/sales/${id}`);
      const sale = payload?.sale;

      if (!sale) {
        throw new Error("Sale not found.");
      }

      elements.modalSaleNo.textContent =
        sale.sale_no || "Sale Details";

      elements.modalSaleSubtitle.textContent =
        `${sale.customer_name || "—"} · ${formatDate(sale.sale_date)}`;

      const items = Array.isArray(sale.items) ? sale.items : [];

      elements.saleModalBody.innerHTML = `
        <div class="details-grid">
          <div class="detail-box">
            <span>Customer</span>
            <strong>${escapeHtml(sale.customer_name || "—")}</strong>
          </div>

          <div class="detail-box">
            <span>Sale Date</span>
            <strong>${escapeHtml(formatDate(sale.sale_date))}</strong>
          </div>

          <div class="detail-box">
            <span>Invoice No.</span>
            <strong>${escapeHtml(sale.invoice_no || sale.sale_no || "—")}</strong>
          </div>

          <div class="detail-box">
            <span>Payment Status</span>
            <strong>${paymentBadge(sale.payment_status)}</strong>
          </div>

          <div class="detail-box">
            <span>Vehicle No.</span>
            <strong>${escapeHtml(sale.vehicle_no || "—")}</strong>
          </div>

          <div class="detail-box">
            <span>Transporter</span>
            <strong>${escapeHtml(sale.driver_name || "—")}</strong>
          </div>
        </div>

        <section class="modal-section">
          <div class="modal-section-title">
            <h3>Sold Items</h3>
            <span>${formatNumber(items.length)} items</span>
          </div>

          <div class="table-responsive">
            <table class="data-table modal-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Code</th>
                  <th>Sold</th>
                  <th>Returned</th>
                  <th>Remaining</th>
                  <th>Unit</th>
                  <th>Rate</th>
                  <th>Sale Amount</th>
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
                              <td>${index + 1}</td>
                              <td>
                                <strong>
                                  ${escapeHtml(item.product_name || "—")}
                                </strong>
                              </td>
                              <td>${escapeHtml(item.product_code || "—")}</td>
                              <td>${formatNumber(item.quantity)}</td>
                              <td class="sales-return-qty">
                                ${
                                  Number(item.returned_quantity || 0) > 0
                                    ? formatNumber(item.returned_quantity)
                                    : "—"
                                }
                              </td>
                              <td class="sales-remaining-qty">
                                ${formatNumber(item.remaining_quantity)}
                              </td>
                              <td>${escapeHtml(item.unit || "—")}</td>
                              <td>${formatCurrency(item.rate)}</td>
                              <td>
                                <strong>${formatCurrency(item.amount)}</strong>
                              </td>
                              <td class="sales-return-amount">
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
                        <td colspan="7" class="empty-cell">
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
            <strong>${formatCurrency(sale.subtotal)}</strong>
          </div>

          <div>
            <span>Discount</span>
            <strong>${formatCurrency(sale.discount)}</strong>
          </div>

          <div>
            <span>Tax</span>
            <strong>${formatCurrency(sale.tax_amount)}</strong>
          </div>

          <div>
            <span>Freight</span>
            <strong>${formatCurrency(sale.freight_amount)}</strong>
          </div>
            
          <div class="purchase-return-total">
            <span>Sales Return</span>
            <strong>
              ${
                Number(sale.return_amount || 0) > 0
                  ? `-${formatCurrency(sale.return_amount)}`
                  : formatCurrency(0)
              }
            </strong>
          </div>

          <div class="grand-total">
            <span>Grand Total</span>
            <strong>${formatCurrency(sale.net_total)}</strong>
          </div>
        </section>

        ${
          sale.remarks
            ? `
              <div class="remarks-box">
                <span>Remarks</span>
                <p>${escapeHtml(sale.remarks)}</p>
              </div>
            `
            : ""
        }
      `;
    } catch (error) {
      elements.saleModalBody.innerHTML = `
        <div class="report-error">
          <i class="fa-solid fa-circle-exclamation"></i>
          ${escapeHtml(
            error.message || "Unable to load sale details.",
          )}
        </div>
      `;
    }
  };

  const closeDetail = () => {
    elements.saleDetailModal.hidden = true;
    document.body.style.overflow = "";
  };

  const loadAllItemsForExport = async () => {
    await Promise.all(
      state.rows.map(async (sale) => {
        if (state.itemCache[sale.id]) return;

        try {
          const payload = await apiRequest(`/api/sales/${sale.id}`);
          const detail = payload?.sale;

          if (!detail) return;

          state.itemCache[sale.id] = (detail.items || []).map((item) => ({
            ...item,
            sale_no: detail.sale_no,
            sale_date: detail.sale_date,
            customer_name: detail.customer_name,
          }));
        } catch (error) {
          console.error(
            `Failed to load sale ${sale.id} items:`,
            error,
          );
        }
      }),
    );
  };

  const salesReturnItemCache = {};

  const loadAllSalesReturnItemsForExport = async () => {
  const sales = state.rows;
  console.log("Sales:", sales);

  if (!sales.length) {
    return;
  }

  const saleIds = new Set(
    sales.map((sale) => Number(sale.id)),
  );

  try {
    const payload = await apiRequest(
      "/api/sales-returns",
    );

    const returns = Array.isArray(payload?.returns)
      ? payload.returns
      : [];

    const relevantReturns = returns.filter(
      (salesReturn) =>
        saleIds.has(
          Number(salesReturn.sale_id),
        ),
    );

    await Promise.all(
      relevantReturns.map(async (salesReturn) => {
        const returnId = Number(
          salesReturn.id,
        );

        if (!returnId) {
          return;
        }

        if (
          salesReturnItemCache[returnId]
        ) {
          return;
        }

        try {
          const detailPayload =
            await apiRequest(
              `/api/sales-returns/${returnId}`,
            );

          const detail =
            detailPayload?.return;

          if (!detail) {
            return;
          }

          salesReturnItemCache[returnId] =
            (detail.items || []).map((item) => ({
              ...item,

              return_id: returnId,

              return_no:
                detail.return_no ||
                "",

              return_date:
                detail.return_date ||
                "",

              sale_id:
                detail.sale_id ||
                salesReturn.sale_id,

              sale_no:
                detail.sale_no ||
                salesReturn.sale_no ||
                "",

              customer_name:
                detail.customer_name ||
                salesReturn.customer_name ||
                "",

              return_remarks:
                detail.remarks ||
                "",
            }));
        } catch (error) {
          console.error(
            `Failed to load sales return ${returnId}:`,
            error,
          );
        }
      }),
    );
  } catch (error) {
    console.error(
      "Failed to load sales returns for Excel:",
      error,
    );

    throw new Error(
      "Unable to load sales return items for Excel export.",
    );
  }
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
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Exporting...</span>
      `;

      const workbook = XLSX.utils.book_new();
      const dateRange = getDateRangeLabel();

      const summaryRows = [{
        "Report Period": dateRange,
        "Total Sales": state.rows.length,
        "Total Sales Value": state.rows.reduce(
          (sum, row) => sum + number(row.total_amount),
          0,
        ),
        "Sales Return Value": state.rows.reduce(
            (sum, row) => sum + number(row.sales_return_amount),
            0,
        ),
        "Net Sales Value": state.rows.reduce(
            (sum, row) => sum + number(row.net_sales_amount),
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
      }];

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
      XLSX.utils.book_append_sheet(
        workbook,
        summarySheet,
        "Sales Summary",
      );

      const customerRows = state.customerWise.map((row, index) => ({
        "#": index + 1,
        Customer: row.customer_name || "",
        Sales: number(row.sale_count),
        Items: number(row.item_count),
        Subtotal: number(row.subtotal),
        Discount: number(row.discount),
        Tax: number(row.tax_amount),
        Freight: number(row.freight_amount),
        Total: number(row.total_amount),
        Return: number(row.sales_return_amount),
        Net_Total: number(row.net_sales_amount),
      }));

      const customerSheet = XLSX.utils.json_to_sheet(customerRows);
      customerSheet["!cols"] = [
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

      if (customerRows.length) {
        customerSheet["!autofilter"] = { ref: customerSheet["!ref"] };
      }

      customerSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

      XLSX.utils.book_append_sheet(
        workbook,
        customerSheet,
        "Customer Wise",
      );

      const saleRows = state.rows.map((row, index) => ({
        "#": index + 1,
        "Sale No.": row.sale_no,
        Date: formatDateForExcel(row.sale_date),
        Customer: row.customer_name,
        "Invoice No.": row.invoice_no || row.sale_no || "",
        Items: number(row.item_count),
        Subtotal: number(row.subtotal),
        Discount: number(row.discount),
        Tax: number(row.tax_amount),
        Freight: number(row.freight_amount),
        Total: number(row.total_amount),
        Return: number(row.sales_return_amount),
        Net_Total: number(row.net_sales_amount),
        Paid: number(row.paid_amount),
        Due: number(row.due_amount),
        "Payment Status": row.payment_status,
      }));

      const saleSheet = XLSX.utils.json_to_sheet(saleRows);
      saleSheet["!cols"] = [
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

      if (saleRows.length) {
        saleSheet["!autofilter"] = { ref: saleSheet["!ref"] };
      }

      saleSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

      XLSX.utils.book_append_sheet(
        workbook,
        saleSheet,
        "Sales Entries",
      );

      const itemRows = Object.values(state.itemCache)
        .flat()
        .map((item) => ({
          "Sale No.": item.sale_no,
          "Sale Date": formatDateForExcel(item.sale_date),
          Customer: item.customer_name,
          Product: item.product_name,
          "Product Code": item.product_code,
          Quantity: number(item.quantity),
          Unit: item.unit,
          Rate: number(item.rate),
          Amount: number(item.amount),
        }));

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
        itemSheet["!autofilter"] = { ref: itemSheet["!ref"] };
      }

      itemSheet["!freeze"] = { xSplit: 0, ySplit: 1 };

      XLSX.utils.book_append_sheet(
        workbook,
        itemSheet,
        "Sale Items",
      );

      /*
 * SHEET 5
 * Sales Return Items
 */

const salesReturnRows = Object.values(
  salesReturnItemCache,
)
  .flat()
  .map((item) => ({
    "Return No.": item.return_no || "",

    "Return Date": formatDateForExcel(
      item.return_date,
    ),

    "Sale No.": item.sale_no || "",

    Customer: item.customer_name || "",

    Product: item.product_name || "",

    "Product Code":
      item.product_code || "",

    Quantity: number(item.quantity),

    Unit: item.unit || "",

    Rate: number(item.rate),

    Amount: number(item.amount),

    Reason: item.reason || "",

    Remarks: item.return_remarks || "",
  }));

const salesReturnSheet =
  XLSX.utils.json_to_sheet(
    salesReturnRows,
  );

salesReturnSheet["!cols"] = [
  { wch: 18 }, // Return No.
  { wch: 16 }, // Return Date
  { wch: 18 }, // Sale No.
  { wch: 28 }, // Customer
  { wch: 30 }, // Product
  { wch: 18 }, // Product Code
  { wch: 14 }, // Quantity
  { wch: 10 }, // Unit
  { wch: 16 }, // Rate
  { wch: 18 }, // Amount
  { wch: 28 }, // Reason
  { wch: 35 }, // Remarks
];

if (salesReturnRows.length) {
  salesReturnSheet["!autofilter"] = {
    ref: salesReturnSheet["!ref"],
  };
}

salesReturnSheet["!freeze"] = {
  xSplit: 0,
  ySplit: 1,
};

XLSX.utils.book_append_sheet(
  workbook,
  salesReturnSheet,
  "Sales Return Items",
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

      XLSX.writeFile(
        workbook,
        `sale-report${suffix}.xlsx`,
      );

      showToast(
        "Sales report exported successfully.",
        "success",
      );
    } catch (error) {
      console.error("Sales Excel export error:", error);

      showToast(
        error.message || "Unable to export Excel file.",
        "error",
      );
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  };

  const handleExport = async () => {
    const button = elements.exportReport;
    const originalHtml = button.innerHTML;

    try {
      button.disabled = true;
      button.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Exporting...</span>
      `;

      await loadAllItemsForExport();
      await loadAllSalesReturnItemsForExport();
      exportExcel();
    } catch (error) {
      button.disabled = false;
      button.innerHTML = originalHtml;

      showToast(
        error.message || "Unable to prepare Excel export.",
        "error",
      );
    }finally{
      button.disabled = false;
      button.innerHTML = originalHtml || '<i class="fa-solid fa-file-excel"></i> Export';
    }
  };

  const bindEvents = () => {
    elements.search.addEventListener("input", applyClientFilters);
    elements.customerFilter.addEventListener("change", loadReport);
    elements.statusFilter.addEventListener("change", loadReport);
    elements.fromDate.addEventListener("change", loadReport);
    elements.toDate.addEventListener("change", loadReport);

    elements.resetFilters.addEventListener("click", () => {
      elements.search.value = "";
      elements.customerFilter.value = "";
      elements.statusFilter.value = "";
      elements.fromDate.value = "";
      elements.toDate.value = "";
      loadReport();
    });

    elements.previousPage.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderSales();
      }
    });

    elements.nextPage.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(state.filteredRows.length / state.pageSize),
      );

      if (state.page < totalPages) {
        state.page += 1;
        renderSales();
      }
    });

    elements.saleBody.addEventListener("click", (event) => {
      const button = event.target.closest(
        "[data-action='view']",
      );

      if (!button) return;

      openDetail(Number(button.dataset.id));
    });

    elements.closeSaleModal.addEventListener("click", closeDetail);

    elements.saleDetailModal.addEventListener("click", (event) => {
      if (event.target === elements.saleDetailModal) {
        closeDetail();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !elements.saleDetailModal.hidden
      ) {
        closeDetail();
      }
    });

    elements.exportReport.addEventListener("click", handleExport);
    elements.printReport.addEventListener("click", () => window.print());
  };

  const init = async () => {
    elements.totalSales = qs("#totalSales");
    elements.salesValue = qs("#salesValue");
    elements.salesReturnValue = qs("#salesReturnValue");
    elements.netSalesValue = qs("#netSalesValue");
    elements.paidAmount = qs("#paidAmount");
    elements.pendingAmount = qs("#pendingAmount");
    // elements.totalItems = qs("#totalItems");

    elements.search = qs("#search");
    elements.customerFilter = qs("#customerFilter");
    elements.statusFilter = qs("#statusFilter");
    elements.fromDate = qs("#fromDate");
    elements.toDate = qs("#toDate");

    elements.customerWiseBody = qs("#customerWiseBody");
    elements.customerWiseEmpty = qs("#customerWiseEmpty");

    elements.saleBody = qs("#saleBody");
    elements.saleEmpty = qs("#saleEmpty");
    elements.reportCount = qs("#reportCount");
    elements.pageNumber = qs("#pageNumber");
    elements.previousPage = qs("#previousPage");
    elements.nextPage = qs("#nextPage");
    elements.resetFilters = qs("#resetFilters");
    elements.printReport = qs("#printReport");
    elements.exportReport = qs("#exportReport");
    elements.reportPeriod = qs("#reportPeriod");

    elements.saleDetailModal = qs("#saleDetailModal");
    elements.closeSaleModal = qs("#closeSaleModal");
    elements.modalSaleNo = qs("#modalSaleNo");
    elements.modalSaleSubtitle = qs("#modalSaleSubtitle");
    elements.saleModalBody = qs("#saleModalBody");

    elements.toastContainer = qs("#toastContainer");

    bindEvents();
    await loadReport();
  };

  return { init };
})();

const initSaleReportPage = () => SaleReportPage.init();
