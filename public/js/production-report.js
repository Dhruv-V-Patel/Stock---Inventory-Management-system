const ProductionReportPage = (() => {
  const state = {
    rows: [],
    filteredRows: [],
    products: [],
    shifts: [],
    page: 1,
    pageSize: 10,
  };

  const qs = (selector) => document.querySelector(selector);
  const elements = {};

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const number = (value) =>
    Number(value || 0);

  const formatNumber = (value) =>
    new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 3,
    }).format(number(value));

  const formatPercent = (value) =>
    `${new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 2,
    }).format(number(value))}%`;

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

    if (Number.isNaN(date.getTime())) return "—";

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
    toast.className = `production-report-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    window.setTimeout(() => toast.remove(), 3000);
  };

  const buildQuery = () => {
    const params = new URLSearchParams();

    const values = {
      search: elements.search.value.trim(),
      product_id: elements.productFilter.value,
      shift: elements.shiftFilter.value,
      from_date: elements.fromDate.value,
      to_date: elements.toDate.value,
    };

    Object.entries(values).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    return params.toString();
  };

  const updatePeriod = () => {
    elements.reportPeriod.textContent =
      `Report Period: ${getDateRangeLabel()}`;
  };

  const updateSummary = (summary = {}) => {
    elements.totalBatches.textContent =
      formatNumber(summary.totalBatches);

    elements.plannedQuantity.textContent =
      formatNumber(summary.plannedQuantity);

    elements.producedQuantity.textContent =
      formatNumber(summary.producedQuantity);

    elements.wastageQuantity.textContent =
      formatNumber(summary.wastageQuantity);

    elements.efficiency.textContent =
      formatPercent(summary.efficiency);
  };

  const renderProductOptions = () => {
    const current = elements.productFilter.value;

    elements.productFilter.innerHTML = `
      <option value="">All Products</option>
      ${state.products
        .map(
          (product) => `
            <option value="${escapeHtml(product.id)}">
              ${escapeHtml(product.name)}
              ${product.code ? ` (${escapeHtml(product.code)})` : ""}
            </option>
          `,
        )
        .join("")}
    `;

    elements.productFilter.value = state.products.some(
      (product) => String(product.id) === String(current),
    )
      ? current
      : "";
  };

  const renderShiftOptions = () => {
    const current = elements.shiftFilter.value;

    elements.shiftFilter.innerHTML = `
      <option value="">All Shifts</option>
      ${state.shifts
        .map(
          (shift) =>
            `<option value="${escapeHtml(shift)}">${escapeHtml(shift)}</option>`,
        )
        .join("")}
    `;

    elements.shiftFilter.value = state.shifts.includes(current)
      ? current
      : "";
  };

  const setLoading = () => {
    elements.productWiseBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="report-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading production report...
          </div>
        </td>
      </tr>
    `;

    elements.batchBody.innerHTML = `
      <tr>
        <td colspan="11">
          <div class="report-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading production batches...
          </div>
        </td>
      </tr>
    `;

    elements.productWiseEmpty.hidden = true;
    elements.batchEmpty.hidden = true;
  };

  const renderProductWise = () => {
    const grouped = new Map();

    state.filteredRows.forEach((row) => {
      const key = String(row.product_id);

      if (!grouped.has(key)) {
        grouped.set(key, {
          product_id: row.product_id,
          product_name: row.product_name,
          product_code: row.product_code,
          product_unit: row.product_unit,
          planned_quantity: 0,
          produced_quantity: 0,
          wastage_quantity: 0,
        });
      }

      const item = grouped.get(key);

      item.planned_quantity += number(row.planned_quantity);
      item.produced_quantity += number(row.produced_quantity);
      item.wastage_quantity += number(row.wastage_quantity);
    });

    const rows = [...grouped.values()]
      .sort((a, b) =>
        String(a.product_name || "").localeCompare(
          String(b.product_name || ""),
        ),
      );

    if (!rows.length) {
      elements.productWiseBody.innerHTML = "";
      elements.productWiseEmpty.hidden = false;
      return;
    }

    elements.productWiseEmpty.hidden = true;

    elements.productWiseBody.innerHTML = rows
      .map((row, index) => {
        const efficiency =
          row.planned_quantity > 0
            ? (row.produced_quantity / row.planned_quantity) * 100
            : 0;

        return `
          <tr>
            <td>${index + 1}</td>
            <td>
              <strong>${escapeHtml(row.product_name || "—")}</strong>
            </td>
            <td>${escapeHtml(row.product_code || "—")}</td>
            <td>${escapeHtml(row.product_unit || "—")}</td>
            <td>${formatNumber(row.planned_quantity)}</td>
            <td>${formatNumber(row.produced_quantity)}</td>
            <td>
              <span class="${row.wastage_quantity > 0 ? "text-warning" : ""}">
                ${formatNumber(row.wastage_quantity)}
              </span>
            </td>
            <td>${formatPercent(efficiency)}</td>
          </tr>
        `;
      })
      .join("");
  };

  const renderBatches = () => {
    const total = state.filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));

    state.page = Math.min(Math.max(state.page, 1), totalPages);

    const start = (state.page - 1) * state.pageSize;
    const rows = state.filteredRows.slice(
      start,
      start + state.pageSize,
    );

    elements.pageNumber.textContent = String(state.page);
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= totalPages;

    elements.reportCount.textContent =
      total === 0
        ? "Showing 0 production batches"
        : `Showing ${start + 1}-${Math.min(
            start + rows.length,
            total,
          )} of ${total} production batches`;

    if (!rows.length) {
      elements.batchBody.innerHTML = "";
      elements.batchEmpty.hidden = false;
      return;
    }

    elements.batchEmpty.hidden = true;

    elements.batchBody.innerHTML = rows
      .map((row, index) => {
        const efficiency =
          number(row.planned_quantity) > 0
            ? (number(row.produced_quantity) /
                number(row.planned_quantity)) *
              100
            : 0;

        return `
          <tr>
            <td>${start + index + 1}</td>
            <td><strong>${escapeHtml(row.batch_no || "—")}</strong></td>
            <td>
              <div>${escapeHtml(row.product_name || "—")}</div>
              <small class="muted">
                ${escapeHtml(row.product_code || "")}
              </small>
            </td>
            <td>${formatDate(row.production_date)}</td>
            <td>${formatNumber(row.planned_quantity)}</td>
            <td>${formatNumber(row.produced_quantity)}</td>
            <td>
              <span class="${number(row.wastage_quantity) > 0 ? "text-warning" : ""}">
                ${formatNumber(row.wastage_quantity)}
              </span>
            </td>
            <td>${formatPercent(efficiency)}</td>
            <td>${escapeHtml(row.shift || "—")}</td>
            <td>${escapeHtml(row.machine || "—")}</td>
            <td>${escapeHtml(row.supervisor || "—")}</td>
          </tr>
        `;
      })
      .join("");
  };

  const render = () => {
    renderProductWise();
    renderBatches();
    updatePeriod();
  };

  const applyFilters = () => {
    const search = elements.search.value.trim().toLowerCase();
    const productId = elements.productFilter.value;
    const shift = elements.shiftFilter.value;

    state.filteredRows = state.rows.filter((row) => {
      const matchesSearch =
        !search ||
        [
          row.batch_no,
          row.product_name,
          row.product_code,
          row.machine,
          row.supervisor,
        ]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(search));

      const matchesProduct =
        !productId ||
        String(row.product_id) === String(productId);

      const matchesShift =
        !shift ||
        String(row.shift || "") === String(shift);

      return matchesSearch && matchesProduct && matchesShift;
    });

    state.page = 1;
    render();
  };

  const loadReport = async () => {
    setLoading();

    try {
      const query = buildQuery();

      const payload = await apiRequest(
        `/api/production-report${query ? `?${query}` : ""}`,
      );

      state.rows = Array.isArray(payload?.rows)
        ? payload.rows
        : [];

      state.filteredRows = [...state.rows];

      state.products = Array.isArray(payload?.products)
        ? payload.products
        : [];

      state.shifts = Array.isArray(payload?.shifts)
        ? payload.shifts
        : [];

      renderProductOptions();
      renderShiftOptions();
      updateSummary(payload?.summary || {});
      render();
    } catch (error) {
      console.error("Failed to load production report:", error);

      state.rows = [];
      state.filteredRows = [];

      updateSummary({});
      render();

      elements.batchBody.innerHTML = `
        <tr>
          <td colspan="11">
            <div class="report-loading">
              <i class="fa-solid fa-triangle-exclamation"></i>
              ${escapeHtml(
                error.message || "Unable to load production report.",
              )}
            </div>
          </td>
        </tr>
      `;

      elements.productWiseBody.innerHTML = "";
      elements.productWiseEmpty.hidden = false;

      showToast(
        error.message || "Unable to load production report.",
        "error",
      );
    }
  };

  let xlsxPromise = null;

  const ensureXlsx = () => {
    if (window.XLSX) {
      return Promise.resolve(window.XLSX);
    }

    if (xlsxPromise) return xlsxPromise;

    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src =
        "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.async = true;

      script.onload = () => {
        if (window.XLSX) resolve(window.XLSX);
        else reject(new Error("Excel library failed to initialize."));
      };

      script.onerror = () =>
        reject(new Error("Unable to load Excel export library."));

      document.head.appendChild(script);
    });

    return xlsxPromise;
  };

  const buildProductWiseRows = () => {
    const grouped = new Map();

    state.filteredRows.forEach((row) => {
      const key = String(row.product_id);

      if (!grouped.has(key)) {
        grouped.set(key, {
          Product: row.product_name || "",
          Code: row.product_code || "",
          Unit: row.product_unit || "",
          "Planned Qty": 0,
          "Produced Qty": 0,
          Wastage: 0,
        });
      }

      const item = grouped.get(key);

      item["Planned Qty"] += number(row.planned_quantity);
      item["Produced Qty"] += number(row.produced_quantity);
      item.Wastage += number(row.wastage_quantity);
    });

    return [...grouped.values()].map((row) => ({
      ...row,
      Efficiency:
        row["Planned Qty"] > 0
          ? `${(
              (row["Produced Qty"] / row["Planned Qty"]) *
              100
            ).toFixed(2)}%`
          : "0%",
    }));
  };

  const exportExcel = async () => {
    if (!state.filteredRows.length) {
      showToast("There is no production data to export.", "warning");
      return;
    }

    const button = elements.exportReport;
    const originalHtml = button?.innerHTML;

    try {
      if (button) {
        button.disabled = true;
        button.innerHTML = `
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>Exporting...</span>
        `;
      }

      const XLSX = await ensureXlsx();
      const dateRange = getDateRangeLabel();

      const summary = {
        "Total Batches": state.filteredRows.length,
        "Planned Quantity": state.filteredRows.reduce(
          (sum, row) => sum + number(row.planned_quantity),
          0,
        ),
        "Produced Quantity": state.filteredRows.reduce(
          (sum, row) => sum + number(row.produced_quantity),
          0,
        ),
        "Total Wastage": state.filteredRows.reduce(
          (sum, row) => sum + number(row.wastage_quantity),
          0,
        ),
      };

      const efficiency =
        summary["Planned Quantity"] > 0
          ? (summary["Produced Quantity"] /
              summary["Planned Quantity"]) *
            100
          : 0;

      const workbook = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.aoa_to_sheet([
        ["PRODUCTION REPORT"],
        ["Date Range", dateRange],
        [],
        ["Metric", "Value"],
        ["Total Batches", summary["Total Batches"]],
        ["Planned Quantity", summary["Planned Quantity"]],
        ["Produced Quantity", summary["Produced Quantity"]],
        ["Total Wastage", summary["Total Wastage"]],
        ["Production Efficiency", `${efficiency.toFixed(2)}%`],
      ]);

      summarySheet["!cols"] = [
        { wch: 28 },
        { wch: 22 },
      ];

      XLSX.utils.book_append_sheet(
        workbook,
        summarySheet,
        "Production Summary",
      );

      const productRows = buildProductWiseRows();

      const productSheet = XLSX.utils.aoa_to_sheet([
        ["PRODUCT-WISE PRODUCTION"],
        ["Date Range", dateRange],
        [],
      ]);

      XLSX.utils.sheet_add_json(
        productSheet,
        productRows,
        {
          origin: "A4",
        },
      );

      productSheet["!cols"] = [
        { wch: 32 },
        { wch: 18 },
        { wch: 12 },
        { wch: 16 },
        { wch: 16 },
        { wch: 14 },
        { wch: 16 },
      ];

      XLSX.utils.book_append_sheet(
        workbook,
        productSheet,
        "Product Wise",
      );

      const batchRows = state.filteredRows.map((row, index) => ({
        "#": index + 1,
        "Batch No.": row.batch_no || "",
        Product: row.product_name || "",
        Code: row.product_code || "",
        Date: formatDateForExcel(row.production_date),
        "Planned Qty": number(row.planned_quantity),
        "Produced Qty": number(row.produced_quantity),
        Wastage: number(row.wastage_quantity),
        Efficiency:
          number(row.planned_quantity) > 0
            ? `${(
                (number(row.produced_quantity) /
                  number(row.planned_quantity)) *
                100
              ).toFixed(2)}%`
            : "0%",
        Unit: row.product_unit || "",
        Shift: row.shift || "",
        Machine: row.machine || "",
        Supervisor: row.supervisor || "",
        Remarks: row.remarks || "",
      }));

      // const batchSheet = XLSX.utils.aoa_to_sheet([
      //   // ["PRODUCTION BATCHES"],
      //   // ["Date Range", dateRange],
      //   [],
      // ]);

      // XLSX.utils.sheet_add_json(
      //   batchSheet,
      //   batchRows,
      //   {
      //     origin: "A4",
      //   },
      // );

      const batchSheet = XLSX.utils.json_to_sheet(batchRows);

      batchSheet["!cols"] = [
        { wch: 6 },
        { wch: 16 },
        { wch: 32 },
        { wch: 18 },
        { wch: 14 },
        { wch: 15 },
        { wch: 15 },
        { wch: 14 },
        { wch: 14 },
        { wch: 10 },
        { wch: 14 },
        { wch: 22 },
        { wch: 22 },
        { wch: 45 },
      ];

      if (batchRows.length) {
        batchSheet["!autofilter"] = {
          ref: batchSheet["!ref"],
        };
      }

      batchSheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };

      XLSX.utils.book_append_sheet(
        workbook,
        batchSheet,
        "Production Batches",
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
        `production-report${suffix}.xlsx`,
      );

      showToast(
        "Production report Excel exported successfully.",
        "success",
      );
    } catch (error) {
      console.error("Failed to export production report:", error);
      showToast(
        error.message || "Unable to export Excel file.",
        "error",
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML =
          originalHtml ||
          '<i class="fa-solid fa-file-excel"></i><span>Export</span>';
      }
    }
  };

  const bindEvents = () => {
    elements.search.addEventListener("input", applyFilters);

    elements.productFilter.addEventListener(
      "change",
      applyFilters,
    );

    elements.shiftFilter.addEventListener(
      "change",
      applyFilters,
    );

    elements.fromDate.addEventListener(
      "change",
      loadReport,
    );

    elements.toDate.addEventListener(
      "change",
      loadReport,
    );

    elements.resetFilters.addEventListener("click", () => {
      elements.search.value = "";
      elements.productFilter.value = "";
      elements.shiftFilter.value = "";
      elements.fromDate.value = "";
      elements.toDate.value = "";
      loadReport();
    });

    elements.previousPage.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderBatches();
      }
    });

    elements.nextPage.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(
          state.filteredRows.length / state.pageSize,
        ),
      );

      if (state.page < totalPages) {
        state.page += 1;
        renderBatches();
      }
    });

    elements.exportReport.addEventListener(
      "click",
      exportExcel,
    );

    elements.printReport.addEventListener(
      "click",
      () => window.print(),
    );
  };

  const init = async () => {
    elements.search = qs("#search");
    elements.productFilter = qs("#productFilter");
    elements.shiftFilter = qs("#shiftFilter");
    elements.fromDate = qs("#fromDate");
    elements.toDate = qs("#toDate");
    elements.resetFilters = qs("#resetFilters");
    elements.productWiseBody = qs("#productWiseBody");
    elements.productWiseEmpty = qs("#productWiseEmpty");
    elements.batchBody = qs("#batchBody");
    elements.batchEmpty = qs("#batchEmpty");
    elements.reportCount = qs("#reportCount");
    elements.previousPage = qs("#previousPage");
    elements.nextPage = qs("#nextPage");
    elements.pageNumber = qs("#pageNumber");
    elements.totalBatches = qs("#totalBatches");
    elements.plannedQuantity = qs("#plannedQuantity");
    elements.producedQuantity = qs("#producedQuantity");
    elements.wastageQuantity = qs("#wastageQuantity");
    elements.efficiency = qs("#efficiency");
    elements.reportPeriod = qs("#reportPeriod");
    elements.exportReport = qs("#exportReport");
    elements.printReport = qs("#printReport");
    elements.toastContainer = qs("#toastContainer");

    bindEvents();
    await loadReport();
  };

  return {
    init,
  };
})();

window.initProductionReportPage = () =>
  ProductionReportPage.init();
