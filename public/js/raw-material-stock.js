/* ========================================
   RAW MATERIAL STOCK PAGE
======================================== */

const RawMaterialStockPage = (() => {
    const state = {
        rows: [],
        filteredRows: [],
        page: 1,
        pageSize: 10,
        currentHistoryId: null,
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
            credentials: "same-origin",
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
                `Request failed with status ${response.status}.`
            );
        }

        return payload;
    };

    const formatNumber = (value) =>
        Number(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3,
        });

    const formatDateTime = (value) => {
        if (!value) return "-";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return new Intl.DateTimeFormat("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(date);
    };

    const normalize = (value) =>
        String(value ?? "").trim().toLowerCase();

    const showToast = (message, type = "success") => {
        const toast = document.createElement("div");

        toast.className = `toast ${type}`;

        toast.innerHTML = `
            <i class="fa-solid ${
                type === "success"
                    ? "fa-circle-check"
                    : "fa-circle-exclamation"
            }"></i>
            <span>${escapeHtml(message)}</span>
        `;

        elements.toastContainer.appendChild(toast);

        window.setTimeout(() => toast.remove(), 3500);
    };

    const normalizeRow = (row) => ({
        id: Number(row.id),
        code: row.code ?? "",
        name: row.name ?? "",
        category: row.category ?? "",
        unit: row.unit ?? "",
        minimum_stock: Number(row.minimum_stock ?? 0),
        current_stock: Number(row.current_stock ?? 0),
        stock_status: row.stock_status ?? "out_of_stock",
    });

    const renderLoading = (message = "Loading raw material stock...") => {
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="stock-loading">
                        <i class="fa-solid fa-spinner fa-spin"></i>
                        ${escapeHtml(message)}
                    </div>
                </td>
            </tr>
        `;

        elements.stockEmpty.hidden = true;
    };

    const renderError = (message) => {
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="stock-loading">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        ${escapeHtml(message || "Unable to load stock.")}
                    </div>
                </td>
            </tr>
        `;

        elements.stockEmpty.hidden = true;
        updateSummary([]);
        updatePagination();
    };

    const renderEmpty = () => {
        elements.tableBody.innerHTML = "";
        elements.stockEmpty.hidden = false;
        elements.stockCount.textContent = "Showing 0 materials";
        updatePagination();
    };

    const updateSummary = (rows) => {
        const total = rows.length;
        const inStock = rows.filter(
            (row) => row.stock_status === "in_stock"
        ).length;
        const lowStock = rows.filter(
            (row) => row.stock_status === "low_stock"
        ).length;
        const outOfStock = rows.filter(
            (row) => row.stock_status === "out_of_stock"
        ).length;

        elements.totalMaterials.textContent = total.toLocaleString("en-IN");
        elements.inStockMaterials.textContent = inStock.toLocaleString("en-IN");
        elements.lowStockMaterials.textContent = lowStock.toLocaleString("en-IN");
        elements.outOfStockMaterials.textContent = outOfStock.toLocaleString("en-IN");
    };

    const renderCategories = () => {
        const current = elements.categoryFilter.value;

        const categories = [
            ...new Set(
                state.rows
                    .map((row) => String(row.category ?? "").trim())
                    .filter(Boolean)
            ),
        ].sort((a, b) => a.localeCompare(b));

        elements.categoryFilter.innerHTML = `
            <option value="">All Categories</option>
            ${categories
                .map(
                    (category) =>
                        `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
                )
                .join("")}
        `;

        elements.categoryFilter.value = categories.includes(current)
            ? current
            : "";
    };

    const applyFilters = () => {
        const search = normalize(elements.search.value);
        const category = normalize(elements.categoryFilter.value);
        const status = elements.statusFilter.value;

        state.filteredRows = state.rows.filter((row) => {
            const matchesSearch =
                !search ||
                normalize(row.code).includes(search) ||
                normalize(row.name).includes(search) ||
                normalize(row.category).includes(search);

            const matchesCategory =
                !category ||
                normalize(row.category) === category;

            const matchesStatus =
                !status ||
                row.stock_status === status;

            return matchesSearch && matchesCategory && matchesStatus;
        });

        state.page = 1;
        renderTable();
    };

    const renderTable = () => {
        elements.stockEmpty.hidden = true;

        if (!state.filteredRows.length) {
            renderEmpty();
            return;
        }

        const start = (state.page - 1) * state.pageSize;
        const pageRows = state.filteredRows.slice(
            start,
            start + state.pageSize
        );

        elements.tableBody.innerHTML = pageRows
            .map((row) => {
                const statusClass = row.stock_status.replaceAll("_", "-");

                const statusLabel =
                    row.stock_status === "in_stock"
                        ? "In Stock"
                        : row.stock_status === "low_stock"
                            ? "Low Stock"
                            : "Out of Stock";

                const currentClass =
                    row.stock_status === "out_of_stock"
                        ? "out"
                        : row.stock_status === "low_stock"
                            ? "low"
                            : "";

                return `
                    <tr>
                        <td>
                            <div class="stock-material">
                                <div class="stock-material-icon">
                                    <i class="fa-solid fa-cubes"></i>
                                </div>

                                <div class="stock-material-info">
                                    <strong title="${escapeHtml(row.name)}">
                                        ${escapeHtml(row.name)}
                                    </strong>
                                    <span>Raw Material #${row.id}</span>
                                </div>
                            </div>
                        </td>

                        <td>
                            <span class="stock-code">
                                ${escapeHtml(row.code)}
                            </span>
                        </td>

                        <td>
                            <span class="stock-category">
                                ${escapeHtml(row.category || "Uncategorized")}
                            </span>
                        </td>

                        <td>
                            <span class="stock-unit">
                                ${escapeHtml(row.unit)}
                            </span>
                        </td>

                        <td>
                            <span class="stock-minimum">
                                ${formatNumber(row.minimum_stock)}
                            </span>
                        </td>

                        <td>
                            <span class="stock-current ${currentClass}">
                                ${formatNumber(row.current_stock)}
                            </span>
                        </td>

                        <td>
                            <span class="stock-status ${statusClass}">
                                ${statusLabel}
                            </span>
                        </td>

                        <td>
                            <button
                                type="button"
                                class="stock-view-button"
                                title="View stock history"
                                data-action="history"
                                data-id="${row.id}"
                            >
                                <i class="fa-solid fa-clock-rotate-left"></i>
                            </button>
                        </td>
                    </tr>
                `;
            })
            .join("");

        const from = start + 1;
        const to = Math.min(
            start + pageRows.length,
            state.filteredRows.length
        );

        elements.stockCount.textContent =
            `Showing ${from}-${to} of ${state.filteredRows.length} materials`;

        updatePagination();
    };

    const updatePagination = () => {
        const totalPages = Math.max(
            1,
            Math.ceil(state.filteredRows.length / state.pageSize)
        );

        elements.pageNumber.textContent = String(state.page);
        elements.previousPage.disabled = state.page <= 1;
        elements.nextPage.disabled = state.page >= totalPages;
    };

    const loadStock = async () => {
        renderLoading();

        try {
            const payload = await apiRequest("/api/raw-material-stock");

            const rows = Array.isArray(payload)
                ? payload
                : payload?.stock || payload?.data || [];

            state.rows = rows.map(normalizeRow);

            renderCategories();
            updateSummary(state.rows);
            applyFilters();
        } catch (error) {
            console.error("Failed to load raw material stock:", error);
            renderError(error.message);
        }
    };

    const openHistory = async (id) => {
        const row = state.rows.find((item) => item.id === Number(id));

        if (!row) return;

        state.currentHistoryId = row.id;

        elements.historyTitle.textContent = `${row.name} - Stock History`;
        elements.historySubtitle.textContent =
            `${row.code} • ${row.unit}`;

        elements.historyMaterialName.textContent = row.name;
        elements.historyCurrentStock.textContent =
            `${formatNumber(row.current_stock)} ${row.unit}`;

        elements.historyTableBody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="stock-loading">
                        <i class="fa-solid fa-spinner fa-spin"></i>
                        Loading movement history...
                    </div>
                </td>
            </tr>
        `;

        elements.historyModal.hidden = false;

        try {
            const payload = await apiRequest(
                `/api/raw-material-stock/${row.id}/movements`
            );

            const movements = Array.isArray(payload)
                ? payload
                : payload?.movements || payload?.data || [];

            if (!movements.length) {
                elements.historyTableBody.innerHTML = `
                    <tr>
                        <td colspan="5">
                            <div class="stock-empty">
                                <div class="empty-icon">
                                    <i class="fa-solid fa-clock-rotate-left"></i>
                                </div>
                                <h3>No stock movements</h3>
                                <p>No movement has been recorded for this material yet.</p>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            elements.historyTableBody.innerHTML = movements
                .map((movement) => {
                    const isIn = movement.direction === "IN";
                    const sign = isIn ? "+" : "-";
                    const movementClass = isIn
                        ? "movement-in"
                        : "movement-out";

                    const reference =
                        movement.reference_type && movement.reference_id
                            ? `${movement.reference_type} #${movement.reference_id}`
                            : "-";

                    return `
                        <tr>
                            <td>${escapeHtml(formatDateTime(movement.movement_date))}</td>

                            <td>
                                <span class="${movementClass}">
                                    ${escapeHtml(movement.movement_type || movement.direction)}
                                </span>
                            </td>

                            <td>${escapeHtml(reference)}</td>

                            <td>
                                <span class="${movementClass}">
                                    ${sign}${formatNumber(movement.quantity)}
                                    ${escapeHtml(row.unit)}
                                </span>
                            </td>

                            <td>${escapeHtml(movement.remarks || "-")}</td>
                        </tr>
                    `;
                })
                .join("");
        } catch (error) {
            console.error("Failed to load stock history:", error);

            elements.historyTableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="stock-loading">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            ${escapeHtml(error.message)}
                        </div>
                    </td>
                </tr>
            `;
        }
    };

    const closeHistory = () => {
        elements.historyModal.hidden = true;
        state.currentHistoryId = null;
    };

    const resetFilters = () => {
        elements.search.value = "";
        elements.categoryFilter.value = "";
        elements.statusFilter.value = "";
        state.page = 1;
        applyFilters();
    };

    const bindEvents = () => {
        elements.search.addEventListener("input", applyFilters);
        elements.categoryFilter.addEventListener("change", applyFilters);
        elements.statusFilter.addEventListener("change", applyFilters);
        elements.resetFilters.addEventListener("click", resetFilters);

        elements.previousPage.addEventListener("click", () => {
            if (state.page <= 1) return;
            state.page -= 1;
            renderTable();
        });

        elements.nextPage.addEventListener("click", () => {
            const totalPages = Math.ceil(
                state.filteredRows.length / state.pageSize
            );

            if (state.page >= totalPages) return;

            state.page += 1;
            renderTable();
        });

        elements.tableBody.addEventListener("click", (event) => {
            const button = event.target.closest(
                '[data-action="history"]'
            );

            if (!button) return;

            openHistory(button.dataset.id);
        });

        elements.closeHistoryModal.addEventListener("click", closeHistory);
        elements.closeHistoryButton.addEventListener("click", closeHistory);

        elements.historyModal.addEventListener("click", (event) => {
            if (event.target === elements.historyModal) {
                closeHistory();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !elements.historyModal.hidden) {
                closeHistory();
            }
        });
    };

    const init = async () => {
        Object.assign(elements, {
            tableBody: qs("#stockTableBody"),
            stockEmpty: qs("#stockEmpty"),
            stockCount: qs("#stockCount"),

            search: qs("#stockSearch"),
            categoryFilter: qs("#categoryFilter"),
            statusFilter: qs("#statusFilter"),
            resetFilters: qs("#resetFilters"),

            totalMaterials: qs("#totalMaterials"),
            inStockMaterials: qs("#inStockMaterials"),
            lowStockMaterials: qs("#lowStockMaterials"),
            outOfStockMaterials: qs("#outOfStockMaterials"),

            previousPage: qs("#previousPage"),
            nextPage: qs("#nextPage"),
            pageNumber: qs("#pageNumber"),

            historyModal: qs("#historyModal"),
            closeHistoryModal: qs("#closeHistoryModal"),
            closeHistoryButton: qs("#closeHistoryButton"),
            historyTitle: qs("#historyTitle"),
            historySubtitle: qs("#historySubtitle"),
            historyMaterialName: qs("#historyMaterialName"),
            historyCurrentStock: qs("#historyCurrentStock"),
            historyTableBody: qs("#historyTableBody"),

            toastContainer: qs("#toastContainer"),
        });

        bindEvents();
        await loadStock();
    };

    return { init };
})();

const initRawMaterialStockPage = () => RawMaterialStockPage.init();
