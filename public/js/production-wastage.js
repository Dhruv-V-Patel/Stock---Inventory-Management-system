(() => {
  "use strict";

  const state = {
    records: [],
    filtered: [],
    productWise: [],
    page: 1,
    pageSize: 10,
  };
  const $ = (s) => document.querySelector(s);
  const el = {};

  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  const fmt = (v, d = 3) =>
    Number.isInteger(n(v))
      ? n(v).toLocaleString("en-IN")
      : n(v).toLocaleString("en-IN", { maximumFractionDigits: d });
  const esc = (v) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const token = () =>
    localStorage.getItem("accessToken") || localStorage.getItem("token") || "";

  const api = async (url) => {
    const res = await fetch(url, {
      headers: token() ? { Authorization: `Bearer ${token()}` } : {},
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok)
      throw new Error(
        data?.message || data?.error || `Request failed (${res.status})`,
      );
    return data;
  };

  const dateObj = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dateKey = (v) => {
    const d = dateObj(v);
    if (!d) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const today = () => dateKey(new Date());
  const dateText = (v) => {
    const d = dateObj(v);
    return d
      ? new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(d)
      : "—";
  };

  const produced = (r) => n(r.produced_quantity ?? r.producedQuantity);
  const damaged = (r) => {
    const explicit =
      r.damaged_quantity ??
      r.damagedQuantity ??
      r.wastage_quantity ??
      r.wastageQuantity;
    if (explicit !== undefined && explicit !== null)
      return Math.max(n(explicit), 0);
    return Math.max(n(r.planned_quantity) - produced(r), 0);
  };
  const product = (r) =>
    r.product_name || r.productName || r.name || "Unknown Product";
  const code = (r) => r.product_code || r.productCode || r.code || "";
  const batch = (r) => r.batch_no || r.batchNo || `PB-${r.id}`;
  const unit = (r) => r.product_unit || r.unit || "NOS";
  const shift = (r) => r.shift || "—";
  const rate = (r) => {
    const p = produced(r),
      d = damaged(r),
      total = p + d;
    return total ? (d / total) * 100 : 0;
  };

  const normalize = (payload) => {
    const rows =
      payload?.productions ||
      payload?.production ||
      payload?.data ||
      payload?.rows ||
      (Array.isArray(payload) ? payload : []);
    return Array.isArray(rows)
      ? rows
          .map((r) => ({ ...r, id: Number(r.id) }))
          .filter((r) => Number.isInteger(r.id) && damaged(r) > 0)
      : [];
  };

  const summary = () => {
    const total = state.records.reduce((s, r) => s + damaged(r), 0);
    const todayDamaged = state.records
      .filter((r) => dateKey(r.production_date) === today())
      .reduce((s, r) => s + damaged(r), 0);
    const producedTotal = state.records.reduce((s, r) => s + produced(r), 0);
    const productionTotal = producedTotal + total;
    el.totalDamaged.innerHTML = `${fmt(total)} <small>NOS</small>`;
    el.todayDamaged.innerHTML = `${fmt(todayDamaged)} <small>NOS</small>`;
    el.damagedBatches.textContent = fmt(state.records.length, 0);
    el.damageRate.innerHTML = `${productionTotal ? ((total / productionTotal) * 100).toFixed(2) : "0.00"}<small>%</small>`;
  };

  const buildProductWise = () => {
    const map = new Map();
    state.records.forEach((r) => {
      const key = String(r.product_id ?? r.productId ?? product(r));
      if (!map.has(key))
        map.set(key, {
          name: product(r),
          code: code(r),
          unit: unit(r),
          produced: 0,
          damaged: 0,
        });
      const x = map.get(key);
      x.produced += produced(r);
      x.damaged += damaged(r);
    });
    state.productWise = [...map.values()].sort(
      (a, b) => b.damaged - a.damaged || a.name.localeCompare(b.name),
    );
  };

  const renderProductWise = () => {
    if (!state.productWise.length) {
      el.productWiseTableBody.innerHTML = "";
      el.productWiseEmpty.hidden = false;
      return;
    }
    el.productWiseEmpty.hidden = true;
    el.productWiseTableBody.innerHTML = state.productWise
      .map((x) => {
        const total = x.produced + x.damaged;
        return `<tr><td><div class="product-wise-name"><div class="product-row-icon"><i class="fa-solid fa-box"></i></div><div><div class="product-name">${esc(x.name)}</div>${x.code ? `<div class="product-code">${esc(x.code)}</div>` : ""}</div></div></td><td><span class="quantity-value">${fmt(x.produced)}</span><span class="quantity-unit">${esc(x.unit)}</span></td><td><span class="damaged-value">${fmt(x.damaged)}</span><span class="quantity-unit">${esc(x.unit)}</span></td><td><span class="damage-rate">${total ? ((x.damaged / total) * 100).toFixed(2) : "0.00"}%</span></td></tr>`;
      })
      .join("");
  };

  const populateProducts = () => {
    const map = new Map();
    state.records.forEach((r) => {
      const id = String(r.product_id ?? r.productId ?? product(r));
      if (!map.has(id)) map.set(id, product(r));
    });
    el.wastageProductFilter.innerHTML =
      `<option value="">All Products</option>` +
      [...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`)
        .join("");
  };

  const filtered = () => {
    const q = el.wastageSearch.value.trim().toLowerCase(),
      p = el.wastageProductFilter.value,
      s = el.wastageShiftFilter.value,
      d = el.wastageDateFilter.value;
    return state.records.filter((r) => {
      const text = `${batch(r)} ${product(r)} ${code(r)}`.toLowerCase();
      const rid = String(r.product_id ?? r.productId ?? "");
      return (
        (!q || text.includes(q)) &&
        (!p || rid === p || product(r).toLowerCase() === p.toLowerCase()) &&
        (!s || shift(r).toLowerCase() === s.toLowerCase()) &&
        (!d || dateKey(r.production_date) === d)
      );
    });
  };

  const render = () => {
    state.filtered = filtered();
    const pages = Math.max(
      1,
      Math.ceil(state.filtered.length / state.pageSize),
    );
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * state.pageSize;
    const rows = state.filtered.slice(start, start + state.pageSize);
    if (!rows.length) {
      el.wastageTableBody.innerHTML = "";
      el.wastageEmpty.hidden = false;
    } else {
      el.wastageEmpty.hidden = true;
      el.wastageTableBody.innerHTML = rows
        .map(
          (r) =>
            `<tr><td><span class="batch-no">${esc(batch(r))}</span></td><td><div class="product-name">${esc(product(r))}</div>${code(r) ? `<div class="product-code">${esc(code(r))}</div>` : ""}</td><td>${esc(dateText(r.production_date))}</td><td><span class="quantity-value">${fmt(produced(r))}</span><span class="quantity-unit">${esc(unit(r))}</span></td><td><span class="damaged-value">${fmt(damaged(r))}</span><span class="quantity-unit">${esc(unit(r))}</span></td><td><span class="damage-rate">${rate(r).toFixed(2)}%</span></td><td><span class="shift-badge">${esc(shift(r))}</span></td><td class="action-column"><div class="action-buttons"><button class="table-action" type="button" data-action="view" data-id="${r.id}" title="View details"><i class="fa-solid fa-eye"></i></button></div></td></tr>`,
        )
        .join("");
    }
    const total = state.filtered.length,
      from = total ? start + 1 : 0,
      to = Math.min(start + state.pageSize, total);
    el.wastageCount.textContent = `Showing ${from}–${to} of ${total} wastage records`;
    el.wastagePageNumber.textContent = String(state.page);
    el.previousWastagePage.disabled = state.page <= 1;
    el.nextWastagePage.disabled = state.page >= pages;
  };

  const view = async (record) => {
    el.viewWastageModal.hidden = false;
    document.body.style.overflow = "hidden";
    el.viewWastageBody.innerHTML = `<div class="wastage-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading production details...</div>`;
    let d = record;
    try {
      const response = await api(`/api/production/${record.id}`);
      d = response?.production ?? response?.data ?? response ?? record;
    } catch {}
    const p = produced(d),
      w = damaged(d),
      total = p + w;
    const materials = Array.isArray(d.materials) ? d.materials : [];
    el.viewWastageBody.innerHTML = `<div class="detail-grid"><div class="detail-item"><span>Batch No.</span><strong>${esc(batch(d))}</strong></div><div class="detail-item"><span>Product</span><strong>${esc(product(d))}</strong></div><div class="detail-item"><span>Production Date</span><strong>${esc(dateText(d.production_date))}</strong></div><div class="detail-item"><span>Shift</span><strong>${esc(shift(d))}</strong></div><div class="detail-item"><span>Machine</span><strong>${esc(d.machine || "—")}</strong></div><div class="detail-item"><span>Supervisor</span><strong>${esc(d.supervisor || "—")}</strong></div></div><div class="detail-section"><h3>Production Summary</h3><div class="detail-summary-grid"><div class="detail-summary"><span>Produced</span><strong>${fmt(p)} ${esc(unit(d))}</strong></div><div class="detail-summary damaged"><span>Damaged</span><strong>${fmt(w)} ${esc(unit(d))}</strong></div><div class="detail-summary rate"><span>Damage Rate</span><strong>${total ? ((w / total) * 100).toFixed(2) : "0.00"}%</strong></div></div></div>${materials.length ? `<div class="detail-section"><h3>Material Consumption</h3><div class="table-responsive"><table class="data-table"><thead><tr><th>Material</th><th>Standard</th><th>Actual</th><th>Variance</th><th>Unit</th></tr></thead><tbody>${materials.map((m) => `<tr><td>${esc(m.raw_material_name || m.material_name || "Raw Material")}</td><td>${fmt(m.standard_quantity)}</td><td>${fmt(m.actual_quantity)}</td><td>${fmt(m.variance_quantity)}</td><td>${esc(m.unit || "")}</td></tr>`).join("")}</tbody></table></div></div>` : ""}${d.remarks ? `<div class="detail-section"><h3>Notes</h3><div class="detail-note"><i class="fa-solid fa-note-sticky"></i><span>${esc(d.remarks)}</span></div></div>` : ""}`;
  };

  const close = () => {
    el.viewWastageModal.hidden = true;
    document.body.style.overflow = "";
  };

  const load = async () => {
    try {
      const response = await api("/api/production");
      state.records = normalize(response);
      summary();
      buildProductWise();
      populateProducts();
      renderProductWise();
      render();
    } catch (e) {
      console.error("Failed to load production wastage:", e);
      state.records = [];
      el.productWiseTableBody.innerHTML = "";
      el.productWiseEmpty.hidden = false;
      el.wastageTableBody.innerHTML = "";
      el.wastageEmpty.hidden = false;
      el.wastageCount.textContent =
        e.message || "Unable to load production wastage.";
      summary();
    }
  };

  const init = () => {
    [
      "totalDamaged",
      "todayDamaged",
      "damagedBatches",
      "damageRate",
      "productWiseTableBody",
      "productWiseEmpty",
      "wastageSearch",
      "wastageProductFilter",
      "wastageShiftFilter",
      "wastageDateFilter",
      "resetWastageFilters",
      "wastageTableBody",
      "wastageEmpty",
      "wastageCount",
      "previousWastagePage",
      "nextWastagePage",
      "wastagePageNumber",
      "viewWastageModal",
      "viewWastageBody",
      "closeViewWastageModal",
    ].forEach((id) => (el[id] = $(`#${id}`)));
    [
      el.wastageSearch,
      el.wastageProductFilter,
      el.wastageShiftFilter,
      el.wastageDateFilter,
    ].forEach((x) =>
      x.addEventListener("input", () => {
        state.page = 1;
        render();
      }),
    );
    el.resetWastageFilters.addEventListener("click", () => {
      el.wastageSearch.value = "";
      el.wastageProductFilter.value = "";
      el.wastageShiftFilter.value = "";
      el.wastageDateFilter.value = "";
      state.page = 1;
      render();
    });
    el.previousWastagePage.addEventListener("click", () => {
      if (state.page > 1) {
        state.page--;
        render();
      }
    });
    el.nextWastagePage.addEventListener("click", () => {
      const pages = Math.max(
        1,
        Math.ceil(state.filtered.length / state.pageSize),
      );
      if (state.page < pages) {
        state.page++;
        render();
      }
    });
    el.wastageTableBody.addEventListener("click", (e) => {
      const b = e.target.closest('[data-action="view"]');
      if (!b) return;
      const r = state.records.find((x) => x.id === Number(b.dataset.id));
      if (r) view(r);
    });
    el.closeViewWastageModal.addEventListener("click", close);
    el.viewWastageModal.addEventListener("click", (e) => {
      if (e.target === el.viewWastageModal) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !el.viewWastageModal.hidden) close();
    });
    load();
  };

  window.initProductionWastagePage = init;
})();
