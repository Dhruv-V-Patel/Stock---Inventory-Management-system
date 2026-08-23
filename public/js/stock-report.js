const StockReportPage = (() => {
  const state = {
    rows: [],
    filteredRows: [],
    categories: [],
    page: 1,
    pageSize: 30,
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

  const formatNumber = (value) =>
    new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 3,
    }).format(Number(value || 0));

  const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const todayISO = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
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
    toast.className = `stock-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    window.setTimeout(() => toast.remove(), 3000);
  };

  const setLoading = () => {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="stock-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading stock report...
          </div>
        </td>
      </tr>
    `;

    elements.stockEmpty.hidden = true;
  };

  const buildQuery = () => {
    const params = new URLSearchParams();

    const values = {
      item_type: elements.typeFilter.value,
      status: elements.statusFilter.value,
      search: elements.search.value.trim(),
      category: elements.category.value.trim(),
      from_date: elements.fromDate.value,
      to_date: elements.toDate.value,
    };

    Object.entries(values).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    return params.toString();
  };

  const updateSummary = (summary = {}) => {
    elements.totalItems.textContent = formatNumber(summary.totalItems);
    elements.rawMaterials.textContent = formatNumber(summary.rawMaterials);
    elements.readyStock.textContent = formatNumber(summary.products);
    elements.lowStock.textContent = formatNumber(summary.lowStock);
    elements.outOfStock.textContent = formatNumber(summary.outOfStock);
  };

  const statusLabel = (status) => {
    const map = {
      IN_STOCK: "In Stock",
      LOW_STOCK: "Low Stock",
      OUT_OF_STOCK: "Out of Stock",
    };

    return map[status] || "Unknown";
  };

  const statusClass = (status) => {
    if (status === "LOW_STOCK") return "warning";
    if (status === "OUT_OF_STOCK") return "danger";
    return "success";
  };

  const typeLabel = (type) =>
    type === "RAW_MATERIAL" ? "Raw Material" : "Ready Stock";

    const formatCategoryName = (value) => {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
    };

  const renderTable = () => {
    const total = state.filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));

    state.page = Math.min(Math.max(state.page, 1), totalPages);

    const start = (state.page - 1) * state.pageSize;
    const rows = state.filteredRows.slice(start, start + state.pageSize);

    elements.pageNumber.textContent = String(state.page);
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= totalPages;

    elements.count.textContent =
      total === 0
        ? "Showing 0 items"
        : `Showing ${start + 1}-${Math.min(start + rows.length, total)} of ${total} items`;

    if (!rows.length) {
      elements.tableBody.innerHTML = "";
      elements.stockEmpty.hidden = false;
      return;
    }

    elements.stockEmpty.hidden = true;

    elements.tableBody.innerHTML = rows
      .map((row, index) => {
        const number = start + index + 1;

        return `
          <tr>
            <td>${number}</td>

            <td>
              <div class="stock-item">
                <div class="stock-item-icon">
                  <i class="fa-solid ${
                    row.item_type === "RAW_MATERIAL" ? "fa-cubes" : "fa-cube"
                  }"></i>
                </div>

                <div>
                  <div class="stock-item-name">
                    ${escapeHtml(row.item_name)}
                  </div>

                  <div class="stock-item-code">
                    ${escapeHtml(row.item_code || "—")}
                  </div>
                </div>
              </div>
            </td>

            <td>
              <span class="type-badge ${row.item_type === "PRODUCT" ? "product" : ""}">
                ${escapeHtml(typeLabel(row.item_type))}
              </span>
            </td>

             <td>${escapeHtml(formatCategoryName(row.category) || "-")}</td>

            <td>${escapeHtml(row.unit || "—")}</td>

            <td>
              <span class="quantity-value">
                ${formatNumber(row.opening_stock)}
              </span>
            </td>

            <td>
              <span class="quantity-value stock-in">
                +${formatNumber(row.stock_in)}
              </span>
            </td>

            <td>
              <span class="quantity-value stock-out">
                -${formatNumber(row.stock_out)}
              </span>
            </td>

            <td>
              <span class="closing-stock">
                ${formatNumber(row.closing_stock)}
              </span>
              <span class="quantity-unit">
                ${escapeHtml(row.unit || "")}
              </span>
            </td>

            <td>
              <span class="status-badge ${statusClass(row.stock_status)}">
                <i class="fa-solid ${
                  row.stock_status === "OUT_OF_STOCK"
                    ? "fa-circle-xmark"
                    : row.stock_status === "LOW_STOCK"
                      ? "fa-triangle-exclamation"
                      : "fa-circle-check"
                }"></i>
                ${escapeHtml(statusLabel(row.stock_status))}
              </span>
            </td>

            <td class="action-column">
              <button
                class="table-action"
                type="button"
                data-action="view"
                data-id="${row.id}"
                data-type="${row.item_type}"
                title="View stock details"
              >
                <i class="fa-solid fa-eye"></i>
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  };

  let filterTimer = null;

  const applyFilters = () => {
    window.clearTimeout(filterTimer);

    filterTimer = window.setTimeout(() => {
      loadStockReport();
    }, 250);
  };

  const updateCategoryOptions = (categories = []) => {
    const currentValue = elements.category.value;

    const uniqueCategories = [
      ...new Map(
        categories
          .map((category) => {
            const formatted = formatCategoryName(category);

            return [formatted.toLowerCase(), formatted];
          })
          .filter(([key]) => key),
      ).values(),
    ].sort((a, b) => a.localeCompare(b));

    elements.category.innerHTML = `
    <option value="">All Categories</option>
    ${uniqueCategories
      .map(
        (category) => `
          <option value="${escapeHtml(category)}">
            ${escapeHtml(category)}
          </option>
        `,
      )
      .join("")}
  `;

    const formattedCurrent = formatCategoryName(currentValue);

    const exists = uniqueCategories.some(
      (category) => category.toLowerCase() === formattedCurrent.toLowerCase(),
    );

    elements.category.value = exists ? formattedCurrent : "";
  };

  let categoriesInitialized = false;

  const initializeCategories = (rows) => {
    if (categoriesInitialized) {
      return;
    }

    const categories = [
      ...new Set(
        rows.map((row) => String(row.category || "").trim()).filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));

    state.categories = categories;

    updateCategoryOptions(categories);

    categoriesInitialized = true;
  };


  const loadStockReport = async () => {
    setLoading();

    try {
      const query = buildQuery();
      const payload = await apiRequest(
        `/api/stock-report${query ? `?${query}` : ""}`,
      );

      state.rows = Array.isArray(payload?.rows) ? payload.rows : [];
      initializeCategories(state.rows);
      state.filteredRows = [...state.rows];

      updateSummary(payload?.summary || {});
      renderTable();
    } catch (error) {
      console.error("Failed to load stock report:", error);

      state.rows = [];
      state.filteredRows = [];
      updateSummary({});
      elements.tableBody.innerHTML = `
        <tr>
          <td colspan="10">
            <div class="stock-loading error">
              <i class="fa-solid fa-triangle-exclamation"></i>
              ${escapeHtml(error.message || "Unable to load stock report.")}
            </div>
          </td>
        </tr>
      `;
    }
  };

  const openDetails = async (row) => {
    state.selectedRow = row;

    elements.stockModalTitle.textContent = row.item_name;
    elements.stockModalSubtitle.textContent = `${typeLabel(row.item_type)} • ${row.item_code || "No code"}`;

    elements.stockDetailBody.innerHTML = `
      <div class="stock-detail-summary">
        <div class="stock-detail-card">
          <span>Opening</span>
          <strong>${formatNumber(row.opening_stock)} ${escapeHtml(row.unit)}</strong>
        </div>
        <div class="stock-detail-card">
          <span>Inward</span>
          <strong class="stock-in">+${formatNumber(row.stock_in)} ${escapeHtml(row.unit)}</strong>
        </div>
        <div class="stock-detail-card">
          <span>Outward</span>
          <strong class="stock-out">-${formatNumber(row.stock_out)} ${escapeHtml(row.unit)}</strong>
        </div>
        <div class="stock-detail-card">
          <span>Closing</span>
          <strong>${formatNumber(row.closing_stock)} ${escapeHtml(row.unit)}</strong>
        </div>
      </div>

      <div class="movement-section">
        <div class="movement-section-header">
          <div>
            <h3>Recent Stock Movements</h3>
            <p>Latest 100 inventory movements for this item.</p>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table movement-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Direction</th>
                <th>Quantity</th>
                <th>Movement</th>
                <th>Reference</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody id="movementTableBody">
              <tr>
                <td colspan="6">
                  <div class="stock-loading">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    Loading movements...
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    elements.stockDetailsModal.hidden = false;
    document.body.style.overflow = "hidden";

    try {
      const payload = await apiRequest(
        `/api/stock-report/${encodeURIComponent(row.item_type)}/${row.id}/movements`,
      );

      const movements = Array.isArray(payload?.movements)
        ? payload.movements
        : [];

      const body = qs("#movementTableBody");

      if (!body) return;

      body.innerHTML = movements.length
        ? movements
            .map(
              (movement) => `
                <tr>
                  <td>${escapeHtml(formatDate(movement.movement_date))}</td>

                  <td>
                    <span class="direction-badge ${movement.direction === "IN" ? "in" : "out"}">
                      <i class="fa-solid ${
                        movement.direction === "IN"
                          ? "fa-arrow-down"
                          : "fa-arrow-up"
                      }"></i>
                      ${movement.direction === "IN" ? "In" : "Out"}
                    </span>
                  </td>

                  <td>
                    <strong>
                      ${movement.direction === "IN" ? "+" : "-"}${formatNumber(movement.quantity)}
                    </strong>
                  </td>

                  <td>${escapeHtml(movement.movement_type || "—")}</td>

                  <td>
                    ${escapeHtml(
                      movement.reference_type
                        ? `${movement.reference_type}${movement.reference_id ? ` #${movement.reference_id}` : ""}`
                        : "—",
                    )}
                  </td>

                  <td>${escapeHtml(movement.remarks || "—")}</td>
                </tr>
              `,
            )
            .join("")
        : `
          <tr>
            <td colspan="6">
              <div class="materials-placeholder">
                No stock movements found.
              </div>
            </td>
          </tr>
        `;
    } catch (error) {
      console.error("Failed to load stock movements:", error);

      const body = qs("#movementTableBody");
      if (body) {
        body.innerHTML = `
          <tr>
            <td colspan="6">
              <div class="materials-placeholder error">
                Failed to load stock movements.
              </div>
            </td>
          </tr>
        `;
      }

      showToast(error.message || "Unable to load stock movements.", "error");
    }
  };

  const closeDetails = () => {
    elements.stockDetailsModal.hidden = true;
    document.body.style.overflow = "";
  };

  /*
   * Load SheetJS only when Excel export is actually used.
   * This keeps the normal Stock Report page lightweight.
   */
  let xlsxPromise = null;

  const ensureXlsx = () => {
    if (window.XLSX) {
      return Promise.resolve(window.XLSX);
    }

    if (xlsxPromise) {
      return xlsxPromise;
    }

    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src =
        "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.async = true;

      script.onload = () => {
        if (window.XLSX) {
          resolve(window.XLSX);
          return;
        }

        reject(new Error("Excel library failed to initialize."));
      };

      script.onerror = () => {
        reject(new Error("Unable to load Excel export library."));
      };

      document.head.appendChild(script);
    });

    return xlsxPromise;
  };

  const getExportRows = () => {

    return state.filteredRows;
  };

  const getMovementDateRange = () => ({
    from: elements.fromDate.value
      ? new Date(`${elements.fromDate.value}T00:00:00`)
      : null,
    to: elements.toDate.value
      ? new Date(`${elements.toDate.value}T23:59:59.999`)
      : null,
  });

  const isMovementInSelectedDateRange = (value, range) => {
    if (!value) return false;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return false;
    if (range.from && date < range.from) return false;
    if (range.to && date > range.to) return false;

    return true;
  };

  const fetchExportMovements = async (rows) => {
    const range = getMovementDateRange();

    const results = await Promise.all(
      rows.map(async (row) => {
        const params = new URLSearchParams({
          limit: "50000",
        });

        if (elements.fromDate.value) {
          params.set("from_date", elements.fromDate.value);
        }

        if (elements.toDate.value) {
          params.set("to_date", elements.toDate.value);
        }

        const payload = await apiRequest(
          `/api/stock-report/${encodeURIComponent(row.item_type)}/${row.id}/movements?${params.toString()}`,
        );

        const movements = Array.isArray(payload?.movements)
          ? payload.movements
          : [];

        return movements
          .filter((movement) =>
            isMovementInSelectedDateRange(movement.movement_date, range),
          )
          .map((movement) => ({
            Date: formatDate(movement.movement_date),
            Item: row.item_name,
            Code: row.item_code || "",
            Type: typeLabel(row.item_type),
            Category: formatCategoryName(row.category) || "",
            Unit: row.unit || "",
            Direction: movement.direction === "IN" ? "In" : "Out",
            Quantity:
              (movement.direction === "IN" ? 1 : -1) *
              Number(movement.quantity || 0),
            Movement: movement.movement_type || "",
            Reference: movement.reference_type
              ? `${movement.reference_type}${movement.reference_id ? ` #${movement.reference_id}` : ""}`
              : "",
            Remarks: movement.remarks || "",
          }));
      }),
    );

    return results.flat().sort((a, b) => {
      const dateA = a.Date.split("/").reverse().join("");
      const dateB = b.Date.split("/").reverse().join("");

      return dateB.localeCompare(dateA) || a.Item.localeCompare(b.Item);
    });
  };

  const setWorksheetOptions = (worksheet, widths) => {
    worksheet["!cols"] = widths.map((width) => ({ wch: width }));
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  };

  const exportExcel = async () => {
    const exportRows = getExportRows();

    if (!exportRows.length) {
      showToast("There is no stock data to export.", "warning");
      return;
    }

    const button = elements.exportButton;
    const originalHtml = button?.innerHTML;

    try {
      if (button) {
        button.disabled = true;
        button.innerHTML = `
          <i class="fa-solid fa-spinner fa-spin"></i>
          Exporting...
        `;
      }

      const XLSX = await ensureXlsx();
      const movements = await fetchExportMovements(exportRows);

      const summaryRows = exportRows.map((row, index) => ({
        "#": index + 1,
        Item: row.item_name,
        Code: row.item_code || "",
        Type: typeLabel(row.item_type),
        Category: formatCategoryName(row.category) || "",
        Unit: row.unit || "",
        "Minimum Stock": row.minimum_stock,
        Opening: row.opening_stock,
        Inward: row.stock_in,
        Outward: row.stock_out,
        "Closing Stock": row.closing_stock,
        Status: statusLabel(row.stock_status),
      }));

      const workbook = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.json_to_sheet(summaryRows);

      setWorksheetOptions(
        summarySheet,
        [5, 30, 18, 16, 20, 10, 16, 14, 14, 14, 16, 16],
      );

      if (summaryRows.length) {
        summarySheet["!autofilter"] = {
          ref: summarySheet["!ref"],
        };
      }

      XLSX.utils.book_append_sheet(workbook, summarySheet, "Stock Summary");

      const movementSheet = XLSX.utils.json_to_sheet(
        movements.length
          ? movements
          : [
              {
                Date: "",
                Item: "No movements found",
                Code: "",
                Type: "",
                Category: "",
                Unit: "",
                Direction: "",
                Quantity: "",
                Movement: "",
                Reference: "",
                Remarks: "",
              },
            ],
      );

      setWorksheetOptions(
        movementSheet,
        [14, 30, 18, 16, 20, 10, 12, 14, 28, 24, 55],
      );

      if (movements.length) {
        movementSheet["!autofilter"] = {
          ref: movementSheet["!ref"],
        };
      }

      XLSX.utils.book_append_sheet(workbook, movementSheet, "Stock Movements");

      XLSX.writeFile(workbook, `stock-report_${todayISO()}.xlsx`);

      showToast("Stock report Excel exported successfully.","success");
    } catch (error) {
      console.error("Failed to export stock report:", error);
      showToast(error.message || "Unable to export Excel file.", "error");
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML =
          originalHtml || '<i class="fa-solid fa-file-excel"></i> Export';
      }
    }
  };

  const printReport = () => {
    window.print();
  };

  const bindEvents = () => {
    const filterElements = [
      elements.search,
      elements.category,
      elements.typeFilter,
      elements.statusFilter,
      elements.fromDate,
      elements.toDate,
    ];

    elements.search.addEventListener("input", applyFilters);
    elements.category.addEventListener("input", applyFilters);
    elements.typeFilter.addEventListener("change", applyFilters);
    elements.statusFilter.addEventListener("change", applyFilters);

    elements.fromDate.addEventListener("change", loadStockReport);
    elements.toDate.addEventListener("change", loadStockReport);

    elements.resetFilters.addEventListener("click", () => {
      elements.search.value = "";
      elements.category.value = "";
      elements.typeFilter.value = "";
      elements.statusFilter.value = "";
      elements.fromDate.value = "";
      elements.toDate.value = "";
      loadStockReport();
    });

    elements.previousPage.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderTable();
      }
    });

    elements.nextPage.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(state.filteredRows.length / state.pageSize),
      );

      if (state.page < totalPages) {
        state.page += 1;
        renderTable();
      }
    });

    elements.tableBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action='view']");
      if (!button) return;

      const row = state.rows.find(
        (item) =>
          String(item.id) === String(button.dataset.id) &&
          item.item_type === button.dataset.type,
      );

      if (row) openDetails(row);
    });

    elements.closeModal.addEventListener("click", closeDetails);

    elements.stockDetailsModal.addEventListener("click", (event) => {
      if (event.target === elements.stockDetailsModal) {
        closeDetails();
      }
    });

    elements.exportButton.addEventListener("click", exportExcel);
    elements.printButton.addEventListener("click", printReport);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.stockDetailsModal.hidden) {
        closeDetails();
      }
    });
  };

  const cacheElements = () => {
    elements.totalItems = qs("#totalItems");
    elements.rawMaterials = qs("#rawMaterials");
    elements.readyStock = qs("#readyStock");
    elements.lowStock = qs("#lowStock");
    elements.outOfStock = qs("#outOfStock");

    elements.search = qs("#stockSearch");
    elements.typeFilter = qs("#stockTypeFilter");
    elements.statusFilter = qs("#stockStatusFilter");
    elements.category = qs("#stockCategoryFilter");
    elements.fromDate = qs("#stockFromDate");
    elements.toDate = qs("#stockToDate");
    elements.resetFilters = qs("#resetStockFilters");

    elements.tableBody = qs("#stockTableBody");
    elements.stockEmpty = qs("#stockEmpty");
    elements.count = qs("#stockCount");
    elements.pageNumber = qs("#stockPageNumber");
    elements.previousPage = qs("#previousStockPage");
    elements.nextPage = qs("#nextStockPage");

    elements.exportButton = qs("#exportStockReport");
    elements.printButton = qs("#printStockReport");

    elements.stockDetailsModal = qs("#stockDetailsModal");
    elements.closeModal = qs("#closeStockDetailsModal");
    elements.stockModalTitle = qs("#stockModalTitle");
    elements.stockModalSubtitle = qs("#stockModalSubtitle");
    elements.stockDetailBody = qs("#stockDetailBody");

    elements.toastContainer = qs("#toastContainer");
  };

  const init = async () => {
    cacheElements();
    bindEvents();
    await loadStockReport();
  };

  return { init };
})();

const initStockReportPage = () => StockReportPage.init();
