/* ========================================
   FINISHED STOCK PAGE
======================================== */

const FinishedStockPage = (() => {
    const state = {
        rows: [],
        filteredRows: [],
        movements: [],
        page: 1,
        pageSize: 30,
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
                ...(token
                    ? { Authorization: `Bearer ${token}` }
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
        String(value ?? "")
            .trim()
            .toLowerCase();

    const showToast = (message, type = "success") => {
        if (!elements.toastContainer) return;

        const toast = document.createElement("div");

        toast.className = `toast toast-${type}`;

        toast.innerHTML = `
            <i class="fa-solid ${
                type === "success"
                    ? "fa-circle-check"
                    : "fa-circle-exclamation"
            }"></i>

            <span class="toast-message">
                ${escapeHtml(message)}
            </span>
        `;

        elements.toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add("show");
        });

        window.setTimeout(() => {
            toast.classList.remove("show");

            window.setTimeout(() => {
                toast.remove();
            }, 250);
        }, 3500);
    };

    const normalizeRow = (row) => ({
        id: Number(row.id),
        code: row.code ?? "",
        name: row.name ?? "",
        category: row.category ?? "",
        size: row.size ?? "",
        unit: row.unit ?? "NOS",
        minimum_stock: Number(row.minimum_stock ?? 0),
        opening_stock: Number(row.opening_stock ?? 0),
        stock_in: Number(row.stock_in ?? 0),
        stock_out: Number(row.stock_out ?? 0),
        damaged: Number(row.damaged ?? 0),
        current_stock: Number(
            row.current_stock ??
            Number(row.opening_stock ?? 0) +
            Number(row.stock_in ?? 0) -
            Number(row.stock_out ?? 0),
        ),
        stock_status: row.stock_status ?? "out_of_stock",
    });

    const normalizeMovement = (movement) => ({
        id: Number(movement.id),
        product_id: Number(movement.product_id ?? movement.item_id ?? 0),
        product_name: movement.product_name ?? "",
        product_code: movement.product_code ?? "",
        unit: movement.unit ?? "NOS",
        direction: String(movement.direction ?? "").toUpperCase(),
        quantity: Number(movement.quantity ?? 0),
        movement_type: movement.movement_type ?? "",
        reference_type: movement.reference_type ?? "",
        reference_id: movement.reference_id ?? null,
        movement_date: movement.movement_date ?? movement.created_at ?? null,
        remarks: movement.remarks ?? "",
    });

    const getStatusLabel = (status) => {
        if (status === "in_stock") return "In Stock";
        if (status === "low_stock") return "Low Stock";

        return "Out of Stock";
    };

    const renderLoading = (
        target,
        colspan,
        message,
    ) => {
        target.innerHTML = `
            <tr>
                <td colspan="${colspan}">
                    <div class="stock-loading">
                        <i class="fa-solid fa-spinner fa-spin"></i>
                        ${escapeHtml(message)}
                    </div>
                </td>
            </tr>
        `;
    };

    const renderError = (
        target,
        colspan,
        message,
    ) => {
        target.innerHTML = `
            <tr>
                <td colspan="${colspan}">
                    <div class="stock-loading stock-error">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        ${escapeHtml(message)}
                    </div>
                </td>
            </tr>
        `;
    };

    const updateSummary = () => {
        const rows = state.rows;

        const totalProducts = rows.length;

        const totalStock = rows.reduce(
            (sum, row) => sum + row.current_stock,
            0,
        );

        const stockInToday = rows.reduce(
            (sum, row) => sum + row.stock_in,
            0,
        );

        const stockOutToday = rows.reduce(
            (sum, row) => sum + row.stock_out,
            0,
        );

        elements.totalProducts.textContent =
            totalProducts.toLocaleString("en-IN");

        elements.totalStock.textContent =
            formatNumber(totalStock);

        elements.stockInToday.textContent =
            formatNumber(stockInToday);

        elements.stockOutToday.textContent =
            formatNumber(stockOutToday);
    };

    const renderCategories = () => {
        const current = elements.categoryFilter.value;

        const categories = [
            ...new Set(
                state.rows
                    .map((row) => String(row.category).trim())
                    .filter(Boolean),
            ),
        ].sort((a, b) => a.localeCompare(b));

        elements.categoryFilter.innerHTML = `
            <option value="">All Categories</option>

            ${categories
                .map(
                    (category) => `
                        <option value="${escapeHtml(category)}">
                            ${escapeHtml(category)}
                        </option>
                    `,
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
        const status = elements.stockStatusFilter.value;

        state.filteredRows = state.rows.filter((row) => {
            const matchesSearch =
                !search ||
                normalize(row.code).includes(search) ||
                normalize(row.name).includes(search) ||
                normalize(row.category).includes(search) ||
                normalize(row.size).includes(search);

            const matchesCategory =
                !category ||
                normalize(row.category) === category;

            const matchesStatus =
                !status ||
                row.stock_status === status;

            return (
                matchesSearch &&
                matchesCategory &&
                matchesStatus
            );
        });

        state.page = 1;

        renderStockTable();
    };

    const renderStockTable = () => {
        elements.stockEmpty.hidden = true;

        const total = state.filteredRows.length;

        if (!total) {
            elements.stockTableBody.innerHTML = "";
            elements.stockEmpty.hidden = false;

            elements.stockCount.textContent =
                "Showing 0 products";

            updatePagination();

            return;
        }

        const start =
            (state.page - 1) * state.pageSize;

        const pageRows = state.filteredRows.slice(
            start,
            start + state.pageSize,
        );

        elements.stockTableBody.innerHTML = pageRows
            .map((row) => {

                console.log("Row:",row);
                const statusClass = row.stock_status.replaceAll("_", "-");

                const currentClass =
                    row.stock_status === "out_of_stock"
                        ? "stock-out"
                        : row.stock_status === "low_stock"
                            ? "stock-low"
                            : "";

                return `
                    <tr>

                        <td>
                            <div class="product-cell">

                                <div class="product-row-icon">
                                    <i class="fa-solid fa-cube"></i>
                                </div>

                                <div class="product-cell-info">
                                    <strong
                                        title="${escapeHtml(row.name)}"
                                    >
                                        ${escapeHtml(row.name)}
                                    </strong>

                                    <span>
                                        ${escapeHtml(
                                            row.code ||
                                            `Product #${row.id}`,
                                        )}
                                    </span>
                                </div>

                            </div>
                        </td>

                        <td>
                            <span class="category-badge">
                                ${escapeHtml(
                                    row.category ||
                                    "Uncategorized",
                                )}
                            </span>
                        </td>

                        <td>
                            <span class="unit">
                                ${escapeHtml(row.unit)}
                            </span>
                        </td>

                        <td>
                            <span class="quantity-value">
                                ${formatNumber(row.opening_stock)}
                            </span>
                        </td>

                        <td>
                            <span class="quantity-value movement-in">
                                +${formatNumber(row.stock_in)}
                            </span>
                        </td>

                        <td>
                            <span class="quantity-value movement-out">
                                -${formatNumber(row.stock_out)}
                            </span>
                        </td>

                        <td>
                            <span class="quantity-value stock-damaged">
                                ${formatNumber(row.damaged)}
                            </span>
                        </td>

                        <td>
                            <span class="quantity-value current-stock ${currentClass}">
                                ${formatNumber(row.current_stock)}
                            </span>
                        </td>

                        

                        <td>
                            <span class="stock-status ${statusClass}">
                                ${getStatusLabel(row.stock_status)}
                            </span>
                        </td>

                        <td class="action-column">

                            <button
                                type="button"
                                class="table-action"
                                title="View stock history"
                                aria-label="View stock history"
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
            total,
        );

        elements.stockCount.textContent =
            `Showing ${from}-${to} of ${total} products`;

        updatePagination();
    };

    const updatePagination = () => {
        const totalPages = Math.max(
            1,
            Math.ceil(
                state.filteredRows.length /
                state.pageSize,
            ),
        );

        if (state.page > totalPages) {
            state.page = totalPages;
        }

        elements.pageNumber.textContent =
            String(state.page);

        elements.previousPage.disabled =
            state.page <= 1;

        elements.nextPage.disabled =
            state.page >= totalPages;
    };

    const renderRecentMovements = () => {
        const movements = state.movements;

        elements.movementEmpty.hidden = true;

        if (!movements.length) {
            elements.movementTableBody.innerHTML = "";
            elements.movementEmpty.hidden = false;
            return;
        }

        elements.movementTableBody.innerHTML = movements
            .slice(0, 20)
            .map((movement) => {
                const isIn =
                    movement.direction === "IN";

                const movementClass =
                    isIn
                        ? "movement-in"
                        : "movement-out";

                const sign =
                    isIn ? "+" : "-";

                const reference =
                    movement.reference_type &&
                    movement.reference_id
                        ? `${movement.reference_type} #${movement.reference_id}`
                        : movement.reference_type ||
                          "-";

                return `
                    <tr>

                        <td>
                            ${escapeHtml(
                                formatDateTime(
                                    movement.movement_date,
                                ),
                            )}
                        </td>

                        <td>
                            <div class="movement-product">

                                <strong>
                                    ${escapeHtml(
                                        movement.product_name ||
                                        "Product",
                                    )}
                                </strong>

                                <span>
                                    ${escapeHtml(
                                        movement.product_code ||
                                        "",
                                    )}
                                </span>

                            </div>
                        </td>

                        <td>
                            <span class="${movementClass}">
                                ${escapeHtml(
                                    movement.movement_type ||
                                    movement.direction,
                                )}
                            </span>
                        </td>

                        <td>
                            <strong class="${movementClass}">
                                ${sign}${formatNumber(
                                    movement.quantity,
                                )}
                            </strong>

                            <span class="movement-unit">
                                ${escapeHtml(movement.unit)}
                            </span>
                        </td>

                        <td>
                            <span class="reference-badge">
                                ${escapeHtml(reference)}
                            </span>
                        </td>

                        <td>
                            <span class="movement-remarks">
                                ${escapeHtml(
                                    movement.remarks || "-",
                                )}
                            </span>
                        </td>

                    </tr>
                `;
            })
            .join("");
    };

    const loadStock = async () => {
        renderLoading(
            elements.stockTableBody,
            9,
            "Loading finished stock...",
        );

        try {
            const payload = await apiRequest(
                "/api/finished-stock",
            );

            const rows = Array.isArray(payload)
                ? payload
                : payload?.stock ||
                  payload?.products ||
                  payload?.data ||
                  [];

            state.rows = rows.map(normalizeRow);

            renderCategories();
            updateSummary();
            applyFilters();
        } catch (error) {
            console.error(
                "Failed to load finished stock:",
                error,
            );

            renderError(
                elements.stockTableBody,
                9,
                error.message ||
                "Unable to load finished stock.",
            );

            state.rows = [];
            state.filteredRows = [];

            updateSummary();
            updatePagination();
        }
    };

    const loadRecentMovements = async () => {
        renderLoading(
            elements.movementTableBody,
            6,
            "Loading recent movements...",
        );

        try {
            const payload = await apiRequest(
                "/api/finished-stock/movements?limit=30",
            );

            const rows = Array.isArray(payload)
                ? payload
                : payload?.movements ||
                  payload?.data ||
                  [];

            state.movements =
                rows.map(normalizeMovement);

            renderRecentMovements();
        } catch (error) {
            console.error(
                "Failed to load finished-stock movements:",
                error,
            );

            renderError(
                elements.movementTableBody,
                6,
                error.message ||
                "Unable to load recent movements.",
            );
        }
    };

    const openHistory = async (id) => {
        const row = state.rows.find(
            (item) => item.id === Number(id),
        );

        if (!row) return;

        state.currentHistoryId = row.id;

        elements.historyTitle.textContent =
            `${row.name} - Stock History`;

        elements.historySubtitle.textContent =
            `${row.code || "Product"} • ${row.unit}`;

        elements.historyProductName.textContent =
            row.name;

        elements.historyCurrentStock.textContent =
            `${formatNumber(row.current_stock)} ${row.unit}`;

        renderLoading(
            elements.historyTableBody,
            5,
            "Loading movement history...",
        );

        elements.historyModal.hidden = false;
        document.body.style.overflow = "hidden";

        try {
            const payload = await apiRequest(
                `/api/finished-stock/${row.id}/movements`,
            );

            const movements = Array.isArray(payload)
                ? payload
                : payload?.movements ||
                  payload?.data ||
                  [];

            if (!movements.length) {
                elements.historyTableBody.innerHTML = `
                    <tr>
                        <td colspan="5">

                            <div class="stock-empty compact">
                                <div class="empty-icon">
                                    <i class="fa-solid fa-clock-rotate-left"></i>
                                </div>

                                <h3>No stock movements</h3>

                                <p>
                                    No finished-stock movement has been
                                    recorded for this product yet.
                                </p>
                            </div>

                        </td>
                    </tr>
                `;

                return;
            }

            elements.historyTableBody.innerHTML =
                movements
                    .map(normalizeMovement)
                    .map((movement) => {
                        const isIn =
                            movement.direction === "IN";

                        const movementClass =
                            isIn
                                ? "movement-in"
                                : "movement-out";

                        const sign =
                            isIn ? "+" : "-";

                        const reference =
                            movement.reference_type &&
                            movement.reference_id
                                ? `${movement.reference_type} #${movement.reference_id}`
                                : movement.reference_type ||
                                  "-";

                        return `
                            <tr>

                                <td>
                                    ${escapeHtml(
                                        formatDateTime(
                                            movement.movement_date,
                                        ),
                                    )}
                                </td>

                                <td>
                                    <span class="${movementClass}">
                                        ${escapeHtml(
                                            movement.movement_type ||
                                            movement.direction,
                                        )}
                                    </span>
                                </td>

                                <td>
                                    <span class="reference-badge">
                                        ${escapeHtml(reference)}
                                    </span>
                                </td>

                                <td>
                                    <strong class="${movementClass}">
                                        ${sign}${formatNumber(
                                            movement.quantity,
                                        )}
                                    </strong>

                                    <span class="movement-unit">
                                        ${escapeHtml(
                                            row.unit,
                                        )}
                                    </span>
                                </td>

                                <td>
                                    ${escapeHtml(
                                        movement.remarks || "-",
                                    )}
                                </td>

                            </tr>
                        `;
                    })
                    .join("");
        } catch (error) {
            console.error(
                "Failed to load stock history:",
                error,
            );

            renderError(
                elements.historyTableBody,
                5,
                error.message ||
                "Unable to load stock history.",
            );
        }
    };

    const closeHistory = () => {
        elements.historyModal.hidden = true;
        state.currentHistoryId = null;
        document.body.style.overflow = "";
    };

    const resetFilters = () => {
        elements.search.value = "";
        elements.categoryFilter.value = "";
        elements.stockStatusFilter.value = "";

        state.page = 1;

        applyFilters();
    };

    const bindEvents = () => {
        elements.search.addEventListener(
            "input",
            applyFilters,
        );

        elements.categoryFilter.addEventListener(
            "change",
            applyFilters,
        );

        elements.stockStatusFilter.addEventListener(
            "change",
            applyFilters,
        );

        elements.resetFilters.addEventListener(
            "click",
            resetFilters,
        );

        elements.previousPage.addEventListener(
            "click",
            () => {
                if (state.page <= 1) return;

                state.page -= 1;

                renderStockTable();
            },
        );

        elements.nextPage.addEventListener(
            "click",
            () => {
                const totalPages = Math.max(
                    1,
                    Math.ceil(
                        state.filteredRows.length /
                        state.pageSize,
                    ),
                );

                if (state.page >= totalPages) return;

                state.page += 1;

                renderStockTable();
            },
        );

        elements.stockTableBody.addEventListener(
            "click",
            (event) => {
                const button =
                    event.target.closest(
                        '[data-action="history"]',
                    );

                if (!button) return;

                openHistory(button.dataset.id);
            },
        );

        elements.closeHistoryModal.addEventListener(
            "click",
            closeHistory,
        );

        elements.closeHistoryButton.addEventListener(
            "click",
            closeHistory,
        );

        elements.historyModal.addEventListener(
            "click",
            (event) => {
                if (
                    event.target ===
                    elements.historyModal
                ) {
                    closeHistory();
                }
            },
        );

        document.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key === "Escape" &&
                    !elements.historyModal.hidden
                ) {
                    closeHistory();
                }
            },
        );
    };

    const cacheElements = () => {
        Object.assign(elements, {
            totalProducts: qs("#totalProducts"),
            totalStock: qs("#totalStock"),
            stockInToday: qs("#stockInToday"),
            stockOutToday: qs("#stockOutToday"),

            search: qs("#stockSearch"),
            categoryFilter: qs("#categoryFilter"),
            stockStatusFilter: qs("#stockStatusFilter"),
            resetFilters: qs("#resetFilters"),

            stockTableBody: qs("#stockTableBody"),
            stockEmpty: qs("#stockEmpty"),
            stockCount: qs("#stockCount"),

            previousPage: qs("#previousPage"),
            nextPage: qs("#nextPage"),
            pageNumber: qs("#pageNumber"),

            movementTableBody: qs("#movementTableBody"),
            movementEmpty: qs("#movementEmpty"),

            historyModal: qs("#historyModal"),
            closeHistoryModal: qs("#closeHistoryModal"),
            closeHistoryButton: qs("#closeHistoryButton"),

            historyTitle: qs("#historyTitle"),
            historySubtitle: qs("#historySubtitle"),
            historyProductName: qs("#historyProductName"),
            historyCurrentStock: qs("#historyCurrentStock"),
            historyTableBody: qs("#historyTableBody"),

            toastContainer: qs("#toastContainer"),
        });
    };

    const init = async () => {
        cacheElements();
        bindEvents();

        await Promise.all([
            loadStock(),
            loadRecentMovements(),
        ]);
    };

    return {
        init,
    };
})();

const initFinishedStockPage = () =>
    FinishedStockPage.init();
