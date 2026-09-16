(() => {
  const q = (selector) => document.querySelector(selector);

  const state = {
    page: 1,

    pageSize: 30,

    entries: [],

    partySummary: [],
  };

  const e = {};

  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const num = (value) => Number(value || 0).toLocaleString("en-IN");

  const money = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const date = (value) => {
    if (!value) return "—";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
      return value;
    }

    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const label = (value) => {
    if (!value) return "—";

    return String(value)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const toast = (message, type = "success") => {
    if (!e.toast) return;

    const item = document.createElement("div");

    item.className = `payment-report-toast ${type}`;

    item.textContent = message;

    e.toast.appendChild(item);

    requestAnimationFrame(() => item.classList.add("show"));

    setTimeout(() => {
      item.classList.remove("show");

      setTimeout(() => item.remove(), 250);
    }, 3000);
  };

  const api = async (url) => {
    const token = localStorage.getItem("accessToken");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,

        "Content-Type": "application/json",
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Unable to load payment report.");
    }

    return data;
  };

  const populate = (element, rows, placeholder) => {
    if (!element) return;

    const current = element.value;

    element.innerHTML = `
        <option value="">
          ${esc(placeholder)}
        </option>

        ${(rows || [])
          .map(
            (row) =>
              `
                <option value="${esc(row.id)}">
                  ${esc(row.name)}
                </option>
              `,
          )
          .join("")}
      `;

    if ([...element.options].some((option) => option.value === current)) {
      element.value = current;
    }
  };

  const loadFilters = async () => {
    const response = await api("/api/reports/payments/filters");

    const data = response?.data || {};

    populate(e.party, data.parties, "All Parties");
  };

  const query = (pagination = true) => {
    const params = new URLSearchParams();

    const filters = [
      ["from_date", e.from.value],

      ["to_date", e.to.value],

      ["party_id", e.party.value],

      ["payment_type", e.type.value],

      ["payment_mode", e.mode.value],

      ["search", e.search.value.trim()],
    ];

    filters.forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    if (pagination) {
      params.set("page", state.page);

      params.set("limit", state.pageSize);
    }

    return params.toString();
  };

  const renderSummary = (summary) => {
    e.total.textContent = num(summary.total_entries);

    e.received.textContent = money(summary.received_amount);

    e.paid.textContent = money(summary.paid_amount);

    e.net.textContent = money(summary.total_amount);

    if (e.expenseAmount) {
      e.expenseAmount.textContent = money(summary.expense_amount);
    }

    e.receivedEntries.textContent = num(summary.received_entries);
  };

  const renderPartySummary = (rows) => {
    e.partyBody.innerHTML = "";

    e.partyEmpty.hidden = rows.length > 0;

    if (!rows.length) {
      return;
    }

    rows.forEach((row, index) => {
      const received = Number(row.received_amount || 0);

      const paid = Number(row.paid_amount || 0);

      const net = Number(row.total_amount ?? received - paid);

      const type = row.party_type || "Party";

      const tr = document.createElement("tr");

      tr.innerHTML = `

            <td>
              ${index + 1}
            </td>

            <td>
              <strong>
                ${esc(row.name || "Unknown")}
              </strong>
            </td>

            <td>
              <span class="party-type-badge">
                ${esc(type)}
              </span>
            </td>

            <td>
              ${num(row.total_entries)}
            </td>

            <td class="payment-amount received">
              ${money(received)}
            </td>

            <td class="payment-amount paid">
              ${money(paid)}
            </td>

            <td class="${
              net >= 0 ? "party-net-positive" : "party-net-negative"
            }">

              ${money(net)}

            </td>

          `;

      e.partyBody.appendChild(tr);
    });
  };

  const renderEntries = (rows, pagination) => {
    e.body.innerHTML = "";

    e.empty.hidden = rows.length > 0;

    if (!rows.length) {
      e.count.textContent = "Showing 0 payments";
      e.prev.disabled = true;
      e.next.disabled = true;
      e.page.textContent = "1";
      return;
    }

    rows.forEach((row, index) => {
      const paymentType = String(row.payment_type || "").toUpperCase();

      const isCustomer = paymentType === "CUSTOMER";

      const isExpense = paymentType === "EXPENSE";

      const type = isCustomer
        ? "received"
        : isExpense
          ? "expense"
          : "paid";

      const typeLabel = isCustomer
        ? "Received"
        : isExpense
          ? "Expense"
          : "Paid";

      const typeIcon = isCustomer
        ? "fa-arrow-down"
        : isExpense
          ? "fa-receipt"
          : "fa-arrow-up";

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>
          ${pagination?.from ? pagination.from + index : index + 1}
        </td>

        <td>
          ${esc(date(row.payment_date))}
        </td>

        <td>
          <strong>
            ${esc(row.payment_no || "—")}
          </strong>
        </td>

        <td>
          <strong>
            ${esc(row.party_name || "-")}
          </strong>

          <small class="party-subtitle">
            ${esc(isExpense ? "Expense" : row.party_type || "")}
          </small>
        </td>

        <td>
          <span
            class="
              payment-type-badge
              ${type}
            "
          >
            <i
              class="
                fa-solid
                ${typeIcon}
              "
            ></i>

            ${typeLabel}
          </span>
        </td>

        <td>
          <span class="payment-mode-badge">
            ${esc(label(row.payment_mode))}
          </span>
        </td>

        <td
          class="
            payment-amount
            ${type}
          "
        >
          ${type === "received" ? "+" : "-"}
          ${money(row.amount)}
        </td>

        <td>
          ${esc(row.reference_no || "—")}
        </td>

        <td>
          ${esc(row.created_by_name || "—")}
        </td>

        <td>
          <button
            class="payment-action"
            data-action="view"
            data-id="${row.id}"
            title="View"
          >
            <i class="fa-solid fa-eye"></i>
          </button>
        </td>
      `;

      e.body.appendChild(tr);
    });

    const page = Number(pagination?.page || state.page);

    const pages = Math.max(1, Number(pagination?.total_pages || 1));

    state.page = page;

    e.count.textContent = pagination
      ? `Showing ${pagination.from}-${pagination.to} of ${pagination.total} payments`
      : `Showing ${rows.length} payments`;

    e.page.textContent = page;

    e.prev.disabled = page <= 1;
    e.next.disabled = page >= pages;
  };

  const load = async () => {
    e.body.innerHTML = `

      <tr>

        <td colspan="10">

          <div class="report-loading">

            <i
              class="fa-solid fa-spinner fa-spin"
            ></i>

            Loading payments...

          </div>

        </td>

      </tr>

    `;

    try {
      const response = await api(`/api/reports/payments?${query()}`);

      state.entries = response.entries || [];

      state.partySummary = response.partySummary || [];

      renderSummary(response.summary || {});

      renderPartySummary(state.partySummary);

      renderEntries(state.entries, response.pagination);

      e.period.textContent =
        e.from.value || e.to.value
          ? `Report Period: ${
              e.from.value ? date(e.from.value) : "Beginning"
            } - ${e.to.value ? date(e.to.value) : "Today"}`
          : "Report Period: All Dates";
    } catch (error) {
      e.body.innerHTML = `

        <tr>

          <td colspan="10">

            <div class="report-error">

              ${esc(error.message)}

            </div>

          </td>

        </tr>

      `;

      toast(error.message, "error");
    }
  };

  const open = (id) => {
    const row = state.entries.find((item) => Number(item.id) === Number(id));

    if (!row) return;

    const paymentType = String(row.payment_type || "").toUpperCase();

    const isCustomer = paymentType === "CUSTOMER";

    const isExpense = paymentType === "EXPENSE";

    const type = isCustomer ? "received" : "paid";

    const typeLabel = isCustomer ? "Received" : isExpense ? "Expense" : "Paid";

    e.modalTitle.textContent = "Payment Details";

    e.modalSub.textContent = `${row.party_name || "Unknown Party"} · ${date(
      row.payment_date,
    )}`;

    e.modalBody.innerHTML = `
      <div class="payment-detail-grid">

        <div class="payment-detail-box">
          <span>Payment No.</span>
          <strong>
            ${esc(row.payment_no || "—")}
          </strong>
        </div>

        <div class="payment-detail-box">
          <span>Payment Date</span>
          <strong>
            ${esc(date(row.payment_date))}
          </strong>
        </div>

        <div class="payment-detail-box">
          <span>Party</span>
          <strong>
            ${esc(row.party_name || "—")}
          </strong>
        </div>

        <div class="payment-detail-box">
          <span>Party Type</span>
          <strong>
            ${esc(row.party_type || "—")}
          </strong>
        </div>

        ${
          isExpense
            ? `
              <div class="payment-detail-box">
                <span>Expense Category</span>
                <strong>
                  ${esc(row.expense_category_name || "—")}
                </strong>
              </div>

              <div class="payment-detail-box">
                <span>Paid To / Vendor</span>
                <strong>
                  ${esc(row.paid_to || "—")}
                </strong>
              </div>
            `
            : ""
        }

        <div class="payment-detail-box">
          <span>Payment Type</span>
          <strong>
            ${typeLabel}
          </strong>
        </div>

        <div class="payment-detail-box">
          <span>Payment Mode</span>
          <strong>
            ${esc(label(row.payment_mode))}
          </strong>
        </div>

        <div class="payment-detail-box">
          <span>Reference No.</span>
          <strong>
            ${esc(row.reference_no || "—")}
          </strong>
        </div>

        <div class="payment-detail-box">
          <span>Added By</span>
          <strong>
            ${esc(row.created_by_name || "—")}
          </strong>
        </div>

        ${
          row.remarks
            ? `
              <div class="
                payment-detail-box
                payment-detail-full
              ">
                <span>Remarks</span>
                <strong>
                  ${esc(row.remarks)}
                </strong>
              </div>
            `
            : ""
        }

      </div>

      <div
        class="
          payment-detail-amount
          ${type}
        "
      >
        <span>Payment Amount</span>

        <strong>
          ${type === "received" ? "+" : "-"}
          ${money(row.amount)}
        </strong>
      </div>
    `;

    e.modal.hidden = false;
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    e.modal.hidden = true;

    document.body.style.overflow = "";
  };

  const exportExcel = async () => {
    const button = e.export;

    const old = button.innerHTML;

    try {
      button.disabled = true;

      button.innerHTML = `

          <i
            class="fa-solid fa-spinner fa-spin"
          ></i>

          <span>
            Preparing...
          </span>

        `;

      const response = await api(
        `/api/reports/payments/export?${query(false)}`,
      );

      const rows = response.entries || [];

      if (!rows.length) {
        toast("There is no payment data to export.", "warning");

        return;
      }

      const workbook = XLSX.utils.book_new();

      const summary = response.summary || {};

      /* ==========================================
           SHEET 1
        ========================================== */

      const summarySheet = XLSX.utils.json_to_sheet([
        {
          Metric: "Total Entries",

          Value: Number(summary.total_entries || rows.length),
        },

        {
          Metric: "Received Entries",

          Value: Number(summary.received_entries || 0),
        },

        {
          Metric: "Paid Entries",

          Value: Number(summary.paid_entries || 0),
        },

        {
          Metric: "Received Amount",

          Value: Number(summary.received_amount || 0),
        },

        {
          Metric: "Paid Amount",

          Value: Number(summary.paid_amount || 0),
        },

        {
          Metric: "Expense Entries",

          Value: Number(summary.expense_entries || 0),
        },

        {
          Metric: "Expense Amount",

          Value: Number(summary.expense_amount || 0),
        },

        {
          Metric: "Net Amount",

          Value: Number(summary.total_amount || 0),
        },

        {
          Metric: "Report Period",

          Value:
            e.from.value || e.to.value
              ? `${e.from.value || "Beginning"} to ${e.to.value || "Today"}`
              : "All Dates",
        },
      ]);

      XLSX.utils.book_append_sheet(workbook, summarySheet, "Payment Summary");

      /* ==========================================
           SHEET 2 - PARTY WISE
        ========================================== */

      const partyRows = (response.partySummary || []).map((row, index) => ({
        "#": index + 1,

        Party: row.name || "",

        "Party Type": row.party_type || "",

        Entries: Number(row.total_entries || 0),

        Received: Number(row.received_amount || 0),

        Paid: Number(row.paid_amount || 0),

        "Net Amount": Number(
          row.total_amount ??
            Number(row.received_amount || 0) - Number(row.paid_amount || 0),
        ),
      }));

      XLSX.utils.book_append_sheet(
        workbook,

        XLSX.utils.json_to_sheet(
          partyRows.length
            ? partyRows
            : [
                {
                  Party: "No data found",
                },
              ],
        ),

        "Party Wise",
      );

      /* ==========================================
           SHEET 3 - PAYMENT ENTRIES
        ========================================== */

      const detailRows = rows.map((row, index) => {
        const paymentType = String(row.payment_type || "").toUpperCase();

        return {
          "#": index + 1,

          Date: date(row.payment_date),

          "Payment No.": row.payment_no || "",

          Party: row.party_name || "",

          "Party Type": row.party_type || "",

          "Expense Category":
            paymentType === "EXPENSE" ? row.expense_category_name || "" : "",

          "Paid To / Vendor":
            paymentType === "EXPENSE" ? row.paid_to || "" : "",

          Type:
            paymentType === "CUSTOMER"
              ? "Received"
              : paymentType === "EXPENSE"
                ? "Expense"
                : "Paid",

          Mode: label(row.payment_mode || ""),

          Amount: Number(row.amount || 0),

          "Reference No.": row.reference_no || "",

          "Added By": row.created_by_name || "",

          Remarks: row.remarks || "",
        };
      });

      const detailSheet = XLSX.utils.json_to_sheet(detailRows);

      detailSheet["!autofilter"] = {
        ref: detailSheet["!ref"],
      };

      detailSheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };

      XLSX.utils.book_append_sheet(workbook, detailSheet, "Payment Entries");

      XLSX.writeFile(
        workbook,
        `payment-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );

      toast("Payment report Excel exported successfully.");
    } catch (error) {
      toast(error.message || "Unable to export payment report.", "error");
    } finally {
      button.disabled = false;

      button.innerHTML = old;
    }
  };

  const reset = () => {
    [e.search, e.party, e.type, e.mode, e.from, e.to].forEach((element) => {
      element.value = "";
    });

    state.page = 1;

    load();
  };

  const bind = () => {
    [e.party, e.type, e.mode, e.from, e.to].forEach((element) => {
      element.addEventListener("change", () => {
        state.page = 1;

        load();
      });
    });

    let timer;

    e.search.addEventListener("input", () => {
      clearTimeout(timer);

      timer = setTimeout(() => {
        state.page = 1;

        load();
      }, 300);
    });

    e.reset.addEventListener("click", reset);

    e.prev.addEventListener("click", () => {
      if (state.page > 1) {
        state.page--;

        load();
      }
    });

    e.next.addEventListener("click", () => {
      state.page++;

      load();
    });

    e.body.addEventListener("click", (event) => {
      const button = event.target.closest('[data-action="view"]');

      if (button) {
        open(button.dataset.id);
      }
    });

    e.close.addEventListener("click", close);

    e.modal.addEventListener("click", (event) => {
      if (event.target === e.modal) {
        close();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !e.modal.hidden) {
        close();
      }
    });

    e.export.addEventListener("click", exportExcel);

    e.print.addEventListener("click", () => window.print());
  };

  window.initPaymentReportPage = async () => {
    Object.assign(e, {
      total: q("#totalEntries"),

      received: q("#receivedAmount"),

      paid: q("#paidAmount"),

      net: q("#netAmount"),

      expenseAmount: q("#expenseAmount"),

      receivedEntries: q("#receivedEntries"),

      partyBody: q("#partyWiseBody"),

      partyEmpty: q("#partyWiseEmpty"),

      body: q("#paymentBody"),

      empty: q("#paymentEmpty"),

      search: q("#search"),

      party: q("#partyFilter"),

      type: q("#paymentTypeFilter"),

      mode: q("#paymentModeFilter"),

      from: q("#fromDate"),

      to: q("#toDate"),

      reset: q("#resetFilters"),

      print: q("#printReport"),

      export: q("#exportReport"),

      prev: q("#previousPage"),

      next: q("#nextPage"),

      page: q("#pageNumber"),

      count: q("#reportCount"),

      period: q("#reportPeriod"),

      modal: q("#paymentDetailModal"),

      modalTitle: q("#modalPaymentTitle"),

      modalSub: q("#modalPaymentSubtitle"),

      modalBody: q("#paymentModalBody"),

      close: q("#closePaymentModal"),

      toast: q("#toastContainer"),
    });

    bind();

    try {
      await loadFilters();
    } catch (error) {
      toast(error.message, "error");
    }

    await load();
  };
})();
