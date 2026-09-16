const ExpenseReportPage = (() => {
  const state = {
    rows: [],
    filteredRows: [],
    byCategory: [],
    monthly: [],
    categories: [],
    page: 1,
    pageSize: 30,
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

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const formatDateForExcel = (value) => {
    if (!value) return "";

    const parts = String(value).slice(0, 10).split("-");

    if (parts.length !== 3) {
      return String(value);
    }

    const [year, month, day] = parts;

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

    if (response.status === 401) {
      localStorage.removeItem("accessToken");

      window.location.replace("/login");

      throw new Error("Session expired");
    }

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

    if (!container) {
      alert(message);
      return;
    }

    const toast = document.createElement("div");

    toast.className = `purchase-report-toast ${type}`;

    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  };

  const normalizeStatus = (value) =>
    String(value || "PENDING")
      .trim()
      .toUpperCase();

  const paymentBadge = (status) => {
    const normalized = normalizeStatus(status);

    const label = normalized.charAt(0) + normalized.slice(1).toLowerCase();

    return `
      <span class="payment-badge ${normalized.toLowerCase()}">
        <i class="fa-solid ${
          normalized === "PAID"
            ? "fa-circle-check"
            : normalized === "PARTIAL"
              ? "fa-circle-half-stroke"
              : "fa-clock"
        }"></i>
        ${escapeHtml(label)}
      </span>
    `;
  };

  const buildReportQuery = () => {
    const params = new URLSearchParams();

    if (elements.fromDate.value) {
      params.set("from_date", elements.fromDate.value);
    }

    if (elements.toDate.value) {
      params.set("to_date", elements.toDate.value);
    }

    return params.toString();
  };

  const buildBillsQuery = () => {
    const params = new URLSearchParams();

    const values = {
      search: elements.search.value.trim(),

      status: elements.statusFilter.value,

      category_id: elements.categoryFilter.value,

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

  // const updateSummary = (summary) => {
  //   elements.totalExpenses.textContent = formatNumber(
  //     summary?.total_bills ?? summary?.totalExpenses ?? state.rows.length,
  //   );

  //   elements.totalBilled.textContent = formatCurrency(summary?.total_billed);

  //   elements.totalPaid.textContent = formatCurrency(summary?.total_paid);

  //   elements.totalDue.textContent = formatCurrency(summary?.total_due);

  //   const paidBills = state.rows.filter(
  //     (row) => normalizeStatus(row.payment_status) === "PAID",
  //   ).length;

  //   const pendingBills = state.rows.filter(
  //     (row) => normalizeStatus(row.payment_status) === "PENDING",
  //   ).length;

  //   elements.paidBills.textContent = formatNumber(paidBills);

  //   elements.pendingBills.textContent = formatNumber(pendingBills);
  // };

  const updateSummary = (summary) => {
  // Total Expenses
  elements.totalExpenses.textContent = formatNumber(
    summary?.total_bills ?? 0
  );

  // Total Billed
  elements.totalBilled.textContent = formatCurrency(
    summary?.total_billed ?? 0
  );

  // Total Paid
  elements.totalPaid.textContent = formatCurrency(
    summary?.total_paid ?? 0
  );

  // Total Due
  elements.totalDue.textContent = formatCurrency(
    summary?.total_due ?? 0
  );

  // Paid Bills
  elements.paidBills.textContent = formatNumber(
    summary?.paid_bills ?? 0
  );

  // Pending Bills
  elements.pendingBills.textContent = formatNumber(
    summary?.pending_bills ?? 0
  );
};

  const renderLoading = () => {
    elements.categoryRows.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="report-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading category report...
          </div>
        </td>
      </tr>
    `;

    elements.monthRows.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="report-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading monthly report...
          </div>
        </td>
      </tr>
    `;

    elements.expenseBody.innerHTML = `
      <tr>
        <td colspan="11">
          <div class="report-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading expenses...
          </div>
        </td>
      </tr>
    `;

    elements.categoryEmpty.hidden = true;

    elements.monthEmpty.hidden = true;

    elements.expenseEmpty.hidden = true;
  };

  const renderCategoryWise = () => {
    const rows = state.byCategory;

    if (!rows.length) {
      elements.categoryRows.innerHTML = "";

      elements.categoryEmpty.hidden = false;

      return;
    }

    elements.categoryEmpty.hidden = true;

    elements.categoryRows.innerHTML = rows
      .map(
        (row, index) => `
            <tr>

              <td>
                ${index + 1}
              </td>

              <td>
                <strong>
                  ${escapeHtml(row.name || row.category_name || "—")}
                </strong>
              </td>

              <td>
                ${formatNumber(row.bill_count)}
              </td>

              <td>
                ${formatCurrency(row.total_billed)}
              </td>

              <td>
                ${formatCurrency(row.total_paid)}
              </td>

              <td>
                ${formatCurrency(row.total_due)}
              </td>

            </tr>
          `,
      )
      .join("");
  };

  const renderMonthly = () => {
    const rows = state.monthly;

    if (!rows.length) {
      elements.monthRows.innerHTML = "";

      elements.monthEmpty.hidden = false;

      return;
    }

    elements.monthEmpty.hidden = true;

    elements.monthRows.innerHTML = rows
      .map(
        (row, index) => `
            <tr>

              <td>
                ${index + 1}
              </td>

              <td>
                <strong>
                  ${escapeHtml(row.month || "—")}
                </strong>
              </td>

              <td>
                ${formatCurrency(row.total_billed)}
              </td>

              <td>
                ${formatCurrency(row.total_paid)}
              </td>

              <td>
                ${formatCurrency(row.total_due)}
              </td>

            </tr>
          `,
      )
      .join("");
  };

  const applyClientFilters = () => {
    const search = elements.search.value.trim().toLowerCase();

    state.filteredRows = state.rows.filter((row) => {
      if (!search) {
        return true;
      }

      return [
        row.expense_no,
        row.category_name,
        row.vendor_name,
        row.paid_to,
        row.bill_number,
        row.remarks,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    state.page = 1;

    renderExpenses();
  };

  const renderExpenses = () => {
    const rows = state.filteredRows;

    if (!rows.length) {
      elements.expenseBody.innerHTML = "";

      elements.expenseEmpty.hidden = false;

      elements.reportCount.textContent = "Showing 0 expenses";

      updatePagination();

      return;
    }

    elements.expenseEmpty.hidden = true;

    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));

    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * state.pageSize;

    const pageRows = rows.slice(start, start + state.pageSize);

    elements.expenseBody.innerHTML = pageRows
      .map(
        (expense, index) => `
            <tr>

              <td>
                ${start + index + 1}
              </td>

              <td>
                <strong>
                  ${escapeHtml(expense.expense_no || "—")}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  formatDate(
                    expense.bill_date ||
                      expense.expense_date ||
                      expense.created_at,
                  ),
                )}
              </td>

              <td>
                <span class="supplier-name">
                  ${escapeHtml(expense.category_name || "—")}
                </span>
              </td>

              <td>
                <span class="supplier-name">
                  ${escapeHtml(expense.vendor_name || expense.paid_to || "—")}
                </span>
              </td>

              <td>
                <span class="muted">
                  ${escapeHtml(expense.bill_number || "—")}
                </span>
              </td>

              <td>
                <strong>
                  ${formatCurrency(expense.total_amount)}
                </strong>
              </td>

              <td>
                ${formatCurrency(expense.paid_amount)}
              </td>

              <td>
                ${formatCurrency(expense.due_amount)}
              </td>

              <td>
                ${paymentBadge(expense.payment_status)}
              </td>

              <td class="action-column">

                <button
                  class="table-action"
                  type="button"
                  data-action="view"
                  data-id="${Number(expense.id)}"
                  title="View expense"
                  aria-label="View expense"
                >
                  <i class="fa-solid fa-eye"></i>
                </button>

              </td>

            </tr>
          `,
      )
      .join("");

    elements.reportCount.textContent = `Showing ${start + 1}-${Math.min(
      start + pageRows.length,
      rows.length,
    )} of ${rows.length} expenses`;

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

  const loadCategories = async () => {
    try {
      const payload = await apiRequest("/api/expenses/categories");

      const categories = Array.isArray(payload?.categories)
        ? payload.categories
        : Array.isArray(payload)
          ? payload
          : [];

      state.categories = categories;

      elements.categoryFilter.innerHTML = `
        <option value="">
          All Categories
        </option>

        ${categories
          .map(
            (category) => `
              <option
                value="${category.id}"
              >
                ${escapeHtml(category.name)}
              </option>
            `,
          )
          .join("")}
      `;
    } catch (error) {
      console.error("Failed to load expense categories:", error);
    }
  };

  const loadExpenseBills = async () => {
    const query = buildBillsQuery();

    const payload = await apiRequest(
      `/api/expenses/bills${query ? `?${query}` : ""}`,
    );

    state.rows = Array.isArray(payload?.bills) ? payload.bills : [];

    state.filteredRows = [...state.rows];

    state.page = 1;

    renderExpenses();

    return payload;
  };

  const loadSummaryReport = async () => {
    const query = buildReportQuery();

    const payload = await apiRequest(
      `/api/expenses/reports${query ? `?${query}` : ""}`,
    );

    state.byCategory = Array.isArray(payload?.by_category)
      ? payload.by_category
      : [];

    state.monthly = Array.isArray(payload?.monthly) ? payload.monthly : [];

    updateSummary(payload?.summary || {});

    renderCategoryWise();

    renderMonthly();

    return payload;
  };

  const loadReport = async () => {
    renderLoading();

    try {
      await Promise.all([loadSummaryReport(), loadExpenseBills()]);

      elements.reportPeriod.textContent = `Report Period: ${getDateRangeLabel()}`;
    } catch (error) {
      console.error("Failed to load expense report:", error);

      elements.expenseBody.innerHTML = `
        <tr>
          <td colspan="11">

            <div class="report-error">

              <i class="fa-solid fa-circle-exclamation"></i>

              ${escapeHtml(error.message || "Unable to load expense report.")}

            </div>

          </td>
        </tr>
      `;

      showToast(error.message || "Unable to load expense report.", "error");
    }
  };

  const openDetail = async (id) => {
    elements.expenseDetailModal.hidden = false;

    document.body.style.overflow = "hidden";

    elements.expenseModalBody.innerHTML = `
      <div class="report-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Loading expense details...
      </div>
    `;

    try {
      const payload = await apiRequest(`/api/expenses/bills/${id}`);

      const expense = payload?.bill;

      if (!expense) {
        throw new Error("Expense not found.");
      }

      elements.modalExpenseNo.textContent =
        expense.expense_no || "Expense Details";

      elements.modalExpenseSubtitle.textContent = `${
        expense.category_name || "—"
      } · ${formatDate(expense.bill_date)}`;

      elements.expenseModalBody.innerHTML = `

        <div class="details-grid">

          <div class="detail-box">
            <span>Expense No.</span>
            <strong>
              ${escapeHtml(expense.expense_no || "—")}
            </strong>
          </div>

          <div class="detail-box">
            <span>Category</span>
            <strong>
              ${escapeHtml(expense.category_name || "—")}
            </strong>
          </div>

          <div class="detail-box">
            <span>Paid To / Vendor</span>
            <strong>
              ${escapeHtml(expense.vendor_name || expense.paid_to || "—")}
            </strong>
          </div>

          <div class="detail-box">
            <span>Bill Number</span>
            <strong>
              ${escapeHtml(expense.bill_number || "—")}
            </strong>
          </div>

          <div class="detail-box">
            <span>Bill Date</span>
            <strong>
              ${escapeHtml(formatDate(expense.bill_date))}
            </strong>
          </div>

          <div class="detail-box">
            <span>Due Date</span>
            <strong>
              ${escapeHtml(formatDate(expense.due_date))}
            </strong>
          </div>

          <div class="detail-box">
            <span>Payment Status</span>
            <strong>
              ${paymentBadge(expense.payment_status)}
            </strong>
          </div>

          <div class="detail-box">
            <span>Total Amount</span>
            <strong>
              ${formatCurrency(expense.total_amount)}
            </strong>
          </div>

          <div class="detail-box">
            <span>Paid Amount</span>
            <strong>
              ${formatCurrency(expense.paid_amount)}
            </strong>
          </div>

          <div class="detail-box">
            <span>Due Amount</span>
            <strong>
              ${formatCurrency(expense.due_amount)}
            </strong>
          </div>

        </div>

        <section class="purchase-total-box">

          <div>
            <span>Total Billed</span>

            <strong>
              ${formatCurrency(expense.total_amount)}
            </strong>
          </div>

          <div>
            <span>Total Paid</span>

            <strong>
              ${formatCurrency(expense.paid_amount)}
            </strong>
          </div>

          <div class="grand-total">
            <span>Balance Due</span>

            <strong>
              ${formatCurrency(expense.due_amount)}
            </strong>
          </div>

        </section>

        ${
          expense.remarks
            ? `
              <div class="remarks-box">

                <span>Remarks</span>

                <p>
                  ${escapeHtml(expense.remarks)}
                </p>

              </div>
            `
            : ""
        }

      `;
    } catch (error) {
      elements.expenseModalBody.innerHTML = `
        <div class="report-error">

          <i class="fa-solid fa-circle-exclamation"></i>

          ${escapeHtml(error.message || "Unable to load expense details.")}

        </div>
      `;
    }
  };

  const closeDetail = () => {
    elements.expenseDetailModal.hidden = true;

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
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Exporting...</span>
      `;

      const workbook = XLSX.utils.book_new();

      const dateRange = getDateRangeLabel();

      /*
       * EXPENSE SUMMARY
       */

      const summaryRows = [
        {
          "Report Period": dateRange,

          "Total Expenses": state.rows.length,

          "Total Billed": state.rows.reduce(
            (sum, row) => sum + number(row.total_amount),
            0,
          ),

          "Total Paid": state.rows.reduce(
            (sum, row) => sum + number(row.paid_amount),
            0,
          ),

          "Total Due": state.rows.reduce(
            (sum, row) => sum + number(row.due_amount),
            0,
          ),

          "Paid Bills": state.rows.filter(
            (row) => normalizeStatus(row.payment_status) === "PAID",
          ).length,

          "Pending Bills": state.rows.filter(
            (row) => normalizeStatus(row.payment_status) === "PENDING",
          ).length,
        },
      ];

      const summarySheet = XLSX.utils.json_to_sheet(summaryRows);

      summarySheet["!cols"] = [
        { wch: 24 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 16 },
        { wch: 18 },
      ];

      XLSX.utils.book_append_sheet(workbook, summarySheet, "Expense Summary");

      /*
       * CATEGORY WISE
       */

      const categoryRows = state.byCategory.map((row, index) => ({
        "#": index + 1,

        Category: row.name || row.category_name || "",

        Bills: number(row.bill_count),

        Billed: number(row.total_billed),

        Paid: number(row.total_paid),

        Due: number(row.total_due),
      }));

      const categorySheet = XLSX.utils.json_to_sheet(categoryRows);

      categorySheet["!cols"] = [
        { wch: 6 },
        { wch: 30 },
        { wch: 12 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
      ];

      if (categoryRows.length) {
        categorySheet["!autofilter"] = {
          ref: categorySheet["!ref"],
        };
      }

      categorySheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };

      XLSX.utils.book_append_sheet(workbook, categorySheet, "Category Wise");

      /*
       * MONTHLY
       */

      const monthlyRows = state.monthly.map((row, index) => ({
        "#": index + 1,

        Month: row.month || "",

        Billed: number(row.total_billed),

        Paid: number(row.total_paid),

        Due: number(row.total_due),
      }));

      const monthlySheet = XLSX.utils.json_to_sheet(monthlyRows);

      monthlySheet["!cols"] = [
        { wch: 6 },
        { wch: 20 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
      ];

      if (monthlyRows.length) {
        monthlySheet["!autofilter"] = {
          ref: monthlySheet["!ref"],
        };
      }

      monthlySheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };

      XLSX.utils.book_append_sheet(workbook, monthlySheet, "Monthly");

      /*
       * EXPENSE ENTRIES
       */

      const expenseRows = state.rows.map((row, index) => ({
        "#": index + 1,

        "Expense No.": row.expense_no || "",

        Date: formatDateForExcel(
          row.bill_date || row.expense_date || row.created_at,
        ),

        Category: row.category_name || "",

        "Paid To": row.vendor_name || row.paid_to || "",

        "Bill No.": row.bill_number || "",

        "Total Amount": number(row.total_amount),

        "Paid Amount": number(row.paid_amount),

        "Due Amount": number(row.due_amount),

        "Payment Status": row.payment_status || "",

        Remarks: row.remarks || "",
      }));

      const expenseSheet = XLSX.utils.json_to_sheet(expenseRows);

      expenseSheet["!cols"] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 14 },
        { wch: 28 },
        { wch: 28 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 35 },
      ];

      if (expenseRows.length) {
        expenseSheet["!autofilter"] = {
          ref: expenseSheet["!ref"],
        };
      }

      expenseSheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };

      XLSX.utils.book_append_sheet(workbook, expenseSheet, "Expense Entries");

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

      XLSX.writeFile(workbook, `expense-report${suffix}.xlsx`);

      showToast("Expense report exported successfully.", "success");
    } catch (error) {
      console.error("Expense Excel export error:", error);

      showToast(error.message || "Unable to export Excel file.", "error");
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  };

  const bindEvents = () => {
    elements.search.addEventListener("input", applyClientFilters);

    elements.categoryFilter.addEventListener("change", loadReport);

    elements.statusFilter.addEventListener("change", loadReport);

    elements.fromDate.addEventListener("change", loadReport);

    elements.toDate.addEventListener("change", loadReport);

    elements.resetFilters.addEventListener("click", () => {
      elements.search.value = "";

      elements.categoryFilter.value = "";

      elements.statusFilter.value = "";

      elements.fromDate.value = "";

      elements.toDate.value = "";

      loadReport();
    });

    elements.previousPage.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;

        renderExpenses();
      }
    });

    elements.nextPage.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(state.filteredRows.length / state.pageSize),
      );

      if (state.page < totalPages) {
        state.page += 1;

        renderExpenses();
      }
    });

    elements.expenseBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='view']");

      if (!button) {
        return;
      }

      openDetail(Number(button.dataset.id));
    });

    elements.closeExpenseModal.addEventListener("click", closeDetail);

    elements.expenseDetailModal.addEventListener("click", (event) => {
      if (event.target === elements.expenseDetailModal) {
        closeDetail();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.expenseDetailModal.hidden) {
        closeDetail();
      }
    });

    elements.exportReport.addEventListener("click", exportExcel);

    elements.printReport.addEventListener("click", () => window.print());
  };

  const init = async () => {
    elements.totalExpenses = qs("#totalExpenses");

    elements.totalBilled = qs("#totalBilled");

    elements.totalPaid = qs("#totalPaid");

    elements.totalDue = qs("#totalDue");

    elements.paidBills = qs("#paidBills");

    elements.pendingBills = qs("#pendingBills");

    elements.search = qs("#search");

    elements.categoryFilter = qs("#categoryFilter");

    elements.statusFilter = qs("#statusFilter");

    elements.fromDate = qs("#fromDate");

    elements.toDate = qs("#toDate");

    elements.categoryRows = qs("#categoryRows");

    elements.categoryEmpty = qs("#categoryEmpty");

    elements.monthRows = qs("#monthRows");

    elements.monthEmpty = qs("#monthEmpty");

    elements.expenseBody = qs("#expenseBody");

    elements.expenseEmpty = qs("#expenseEmpty");

    elements.reportCount = qs("#reportCount");

    elements.pageNumber = qs("#pageNumber");

    elements.previousPage = qs("#previousPage");

    elements.nextPage = qs("#nextPage");

    elements.resetFilters = qs("#resetFilters");

    elements.printReport = qs("#printReport");

    elements.exportReport = qs("#exportReport");

    elements.reportPeriod = qs("#reportPeriod");

    elements.expenseDetailModal = qs("#expenseDetailModal");

    elements.closeExpenseModal = qs("#closeExpenseModal");

    elements.modalExpenseNo = qs("#modalExpenseNo");

    elements.modalExpenseSubtitle = qs("#modalExpenseSubtitle");

    elements.expenseModalBody = qs("#expenseModalBody");

    elements.toastContainer = qs("#toastContainer");

    bindEvents();

    await loadCategories();

    await loadReport();
  };

  return {
    init,
  };
})();

const initExpenseReportPage = () => ExpenseReportPage.init();
