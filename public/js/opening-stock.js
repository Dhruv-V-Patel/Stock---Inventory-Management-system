const OpeningStockPage = (() => {
  "use strict";

  const API = {
    // /items returns ALL active products + raw materials, including items
    // that do not have an opening-stock entry yet.
    list: "/api/opening-stock/items",
    create: "/api/opening-stock",
    update: (id) => `/api/opening-stock/${encodeURIComponent(id)}`,
  };

  const state = {
    rows: [],
    filteredRows: [],
    page: 1,
    pageSize: 30,
    editingId: null,
  };

  const qs = (selector) => document.querySelector(selector);

  const getToken = () => localStorage.getItem("accessToken");

  const escapeHtml = (value) => {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  };

  const formatNumber = (value, decimals = 3) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0";

    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(number);
  };

  const formatRate = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0.00";

    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number);
  };

  const normalizeDate = (value) => {
    if (!value) return "";

    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";

    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };

  const formatDate = (value) => {
    const dateValue = normalizeDate(value);
    if (!dateValue) return "-";

    const [year, month, day] = dateValue.split("-");
    return `${day}/${month}/${year}`;
  };

  const normalizeType = (row) => {
    const type = String(
      row.item_type ?? row.itemType ?? row.type ?? ""
    ).toUpperCase();

    if (type === "RAW_MATERIAL" || type === "RAW MATERIAL") {
      return "RAW_MATERIAL";
    }

    return "PRODUCT";
  };

  const normalizeRow = (row, index) => ({
    id: row.id ?? row.stock_id ?? `${normalizeType(row)}-${row.item_id ?? index}`,
    item_type: normalizeType(row),
    item_id: row.item_id ?? row.itemId ?? row.product_id ?? row.raw_material_id ?? null,
    opening_date: normalizeDate(
      row.opening_date ?? row.openingDate ?? row.movement_date ?? row.date
    ),
    item_name:
      row.item_name ??
      row.itemName ??
      row.product_name ??
      row.raw_material_name ??
      row.name ??
      "-",
    item_code:
      row.item_code ??
      row.itemCode ??
      row.product_code ??
      row.raw_material_code ??
      row.code ??
      "",
    unit: row.unit ?? row.unit_name ?? "Nos",
    opening_stock: Number(
      row.opening_stock ?? row.openingStock ?? row.quantity ?? 0
    ),
    rate: Number(
      row.rate ?? row.opening_rate ?? row.openingRate ?? row.selling_rate ?? 0
    ),
  });

  const showToast = (message, type = "success") => {
    const container = qs("#toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    toast.innerHTML = `
      <i class="fa-solid ${
        type === "success" ? "fa-circle-check" : "fa-circle-exclamation"
      }"></i>
      <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    window.setTimeout(() => {
      toast.classList.remove("show");
      window.setTimeout(() => toast.remove(), 250);
    }, 2800);
  };

  const apiRequest = async (url, options = {}) => {
    const token = getToken();

    if (!token) {
      window.location.replace("/login");
      throw new Error("Authentication required");
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      localStorage.removeItem("accessToken");
      window.location.replace("/login");
      throw new Error("Session expired");
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "object"
          ? payload.message || payload.error
          : payload;

      throw new Error(message || `Request failed (${response.status})`);
    }

    return payload;
  };

  const extractRows = (payload) => {
    if (Array.isArray(payload)) return payload;

    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.rows)) return payload.rows;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.openingStock)) return payload.openingStock;

    return [];
  };

  const setLoading = () => {
    const tbody = qs("#openingStockTableBody");
    const empty = qs("#openingEmpty");

    if (empty) empty.hidden = true;

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="opening-loading">
              <i class="fa-solid fa-spinner fa-spin"></i>
              Loading opening stock...
            </div>
          </td>
        </tr>
      `;
    }
  };

  const setError = (message) => {
    const tbody = qs("#openingStockTableBody");
    const empty = qs("#openingEmpty");

    if (empty) empty.hidden = true;

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="opening-loading">
              <i class="fa-solid fa-circle-exclamation"></i>
              ${escapeHtml(message)}
            </div>
          </td>
        </tr>
      `;
    }
  };

  const getDateFilter = () => qs("#openingDate")?.value || "";

  const applyFilters = () => {
    const search = (qs("#itemSearch")?.value || "").trim().toLowerCase();
    const type = qs("#typeFilter")?.value || "";
    const date = getDateFilter();

    state.filteredRows = state.rows.filter((row) => {
      const matchesType = !type || row.item_type === type;

      const matchesDate =
        !date ||
        !row.opening_date ||
        row.opening_date === date;

      const haystack = [
        row.item_name,
        row.item_code,
        row.unit,
        row.item_type === "PRODUCT" ? "product" : "raw material",
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !search || haystack.includes(search);

      return matchesType && matchesDate && matchesSearch;
    });

    state.page = 1;
    render();
  };

  const render = () => {
    const tbody = qs("#openingStockTableBody");
    const empty = qs("#openingEmpty");
    const count = qs("#openingStockCount");
    const pageNumber = qs("#pageNumber");
    const previous = qs("#previousPage");
    const next = qs("#nextPage");

    if (!tbody) return;

    const total = state.filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));

    if (state.page > totalPages) {
      state.page = totalPages;
    }

    const start = (state.page - 1) * state.pageSize;
    const pageRows = state.filteredRows.slice(start, start + state.pageSize);

    if (pageRows.length === 0) {
      tbody.innerHTML = "";
      if (empty) empty.hidden = false;
    } else {
      if (empty) empty.hidden = true;

      tbody.innerHTML = pageRows
        .map((row) => renderRow(row))
        .join("");
    }

    const visibleFrom = total === 0 ? 0 : start + 1;
    const visibleTo = Math.min(start + pageRows.length, total);

    if (count) {
      count.textContent = `Showing ${visibleFrom}-${visibleTo} of ${total} items`;
    }

    if (pageNumber) pageNumber.textContent = String(state.page);

    if (previous) previous.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= totalPages;
  };

  const renderRow = (row) => {
    if (state.editingId === row.id) {
      return renderEditRow(row);
    }

    const typeLabel =
      row.item_type === "RAW_MATERIAL" ? "Raw Material" : "Product";

    const typeClass =
      row.item_type === "RAW_MATERIAL" ? "raw-material" : "product";

    return `
      <tr data-id="${escapeHtml(row.id)}">
        <td>${escapeHtml(formatDate(row.opening_date))}</td>

        <td>
          <span class="opening-type ${typeClass}">
            ${escapeHtml(typeLabel)}
          </span>
        </td>

        <td>
          <span class="opening-item-name">${escapeHtml(row.item_name)}</span>
          ${
            row.item_code
              ? `<span class="opening-item-code">${escapeHtml(row.item_code)}</span>`
              : ""
          }
        </td>

        <td>
          <span class="opening-quantity">${escapeHtml(
            formatNumber(row.opening_stock)
          )}</span>
        </td>

        <td>
          <span class="opening-unit">${escapeHtml(row.unit)}</span>
        </td>

        <td>
          <span class="opening-rate">₹${escapeHtml(formatRate(row.rate))}</span>
        </td>

        <td class="opening-action-column">
          <button
            type="button"
            class="opening-action"
            data-action="edit"
            data-id="${escapeHtml(row.id)}"
            title="Edit opening stock"
          >
            <i class="fa-solid fa-pen"></i>
            Edit
          </button>
        </td>
      </tr>
    `;
  };

  const renderEditRow = (row) => {
    const typeLabel =
      row.item_type === "RAW_MATERIAL" ? "Raw Material" : "Product";

    const typeClass =
      row.item_type === "RAW_MATERIAL" ? "raw-material" : "product";

    return `
      <tr
        data-id="${escapeHtml(row.id)}"
        class="opening-editing-row"
      >
        <td>${escapeHtml(formatDate(row.opening_date))}</td>

        <td>
          <span class="opening-type ${typeClass}">
            ${escapeHtml(typeLabel)}
          </span>
        </td>

        <td>
          <span class="opening-item-name">${escapeHtml(row.item_name)}</span>
          ${
            row.item_code
              ? `<span class="opening-item-code">${escapeHtml(row.item_code)}</span>`
              : ""
          }
        </td>

        <td>
          <input
            class="opening-edit-input quantity"
            data-field="quantity"
            type="number"
            min="0"
            step="0.001"
            value="${escapeHtml(row.opening_stock)}"
            aria-label="Opening stock"
          />
        </td>

        <td>
          <span class="opening-unit">${escapeHtml(row.unit)}</span>
        </td>

        <td>
          <input
            class="opening-edit-input rate"
            data-field="rate"
            type="number"
            min="0"
            step="0.01"
            value="${escapeHtml(row.rate)}"
            aria-label="Rate"
          />
        </td>

        <td class="opening-action-column">
          <div class="opening-edit-actions">
            <button
              type="button"
              class="opening-inline-button save"
              data-action="save"
              data-id="${escapeHtml(row.id)}"
              title="Save"
              aria-label="Save"
            >
              <i class="fa-solid fa-check"></i>
            </button>

            <button
              type="button"
              class="opening-inline-button cancel"
              data-action="cancel"
              data-id="${escapeHtml(row.id)}"
              title="Cancel"
              aria-label="Cancel"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  };

  const startEdit = (id) => {
    if (state.editingId !== null && state.editingId !== id) {
      showToast("Please save or cancel the current edit first.", "error");
      return;
    }

    state.editingId = id;
    render();

    const input = document.querySelector(
      `tr[data-id="${CSS.escape(String(id))}"] input[data-field="quantity"]`
    );

    if (input) {
      input.focus();
      input.select();
    }
  };

  const cancelEdit = () => {
    state.editingId = null;
    render();
  };

  const getTodayLocalISO = () => {
    const now = new Date();
    const local = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000
    );
    return local.toISOString().slice(0, 10);
  };

  const saveEdit = async (id) => {
    const row = state.rows.find((item) => String(item.id) === String(id));

    if (!row) {
      showToast("Opening stock item not found.", "error");
      return;
    }

    const tr = document.querySelector(
      `tr[data-id="${CSS.escape(String(id))}"]`
    );

    if (!tr) return;

    const quantityInput = tr.querySelector('[data-field="quantity"]');
    const rateInput = tr.querySelector('[data-field="rate"]');

    const quantity = Number(quantityInput?.value);
    const rate = Number(rateInput?.value);

    if (!Number.isFinite(quantity) || quantity < 0) {
      showToast("Please enter a valid opening stock quantity.", "error");
      quantityInput?.focus();
      return;
    }

    if (!Number.isFinite(rate) || rate < 0) {
      showToast("Please enter a valid rate.", "error");
      rateInput?.focus();
      return;
    }

    const saveButton = tr.querySelector('[data-action="save"]');

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    try {
      // Use the date on which the opening-stock edit is saved.
      const editDate = getTodayLocalISO();

      const payload = {
        item_type: row.item_type,
        item_id: row.item_id,
        opening_date: editDate,
        quantity,
        opening_stock: quantity,
        rate,
      };

      const isExistingRecord = Number.isInteger(Number(row.id)) && Number(row.id) > 0;

      await apiRequest(
        isExistingRecord ? API.update(row.id) : API.create,
        {
          method: isExistingRecord ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      );

      row.opening_stock = quantity;
      row.rate = rate;
      row.opening_date = editDate;

      state.editingId = null;
      render();

      showToast("Opening stock updated successfully.");
    } catch (error) {
      console.error("Failed to update opening stock:", error);
      showToast(error.message || "Failed to update opening stock.", "error");

      if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="fa-solid fa-check"></i>';
      }
    }
  };

  const handleTableClick = async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === "edit") {
      startEdit(id);
      return;
    }

    if (action === "cancel") {
      cancelEdit();
      return;
    }

    if (action === "save") {
      await saveEdit(id);
    }
  };

  const handleTableKeydown = async (event) => {
    if (event.key !== "Enter") return;

    const input = event.target.closest(".opening-edit-input");
    if (!input) return;

    const row = input.closest("tr");
    if (!row) return;

    const saveButton = row.querySelector('[data-action="save"]');
    if (saveButton) {
      event.preventDefault();
      await saveEdit(saveButton.dataset.id);
    }
  };

  const loadOpeningStock = async () => {
    setLoading();

    try {
      const payload = await apiRequest(API.list);
      state.rows = extractRows(payload).map(normalizeRow);
      state.filteredRows = [...state.rows];

      applyFilters();
    } catch (error) {
      console.error("Failed to load opening stock:", error);
      setError(error.message || "Failed to load opening stock.");
    }
  };

  const bindEvents = () => {
    qs("#openingDate")?.addEventListener("change", applyFilters);
    qs("#typeFilter")?.addEventListener("change", applyFilters);

    qs("#itemSearch")?.addEventListener("input", applyFilters);

    qs("#previousPage")?.addEventListener("click", () => {
      if (state.page <= 1) return;
      state.page -= 1;
      render();
    });

    qs("#nextPage")?.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(state.filteredRows.length / state.pageSize)
      );

      if (state.page >= totalPages) return;

      state.page += 1;
      render();
    });

    qs("#openingStockTableBody")?.addEventListener("click", handleTableClick);
    qs("#openingStockTableBody")?.addEventListener("keydown", handleTableKeydown);
  };

  const init = () => {
    bindEvents();
    loadOpeningStock();
  };

  return {
    init,
  };
})();

const initOpeningStockPage = () => OpeningStockPage.init();
