(() => {
  "use strict";

  // =========================================================
  // STATE
  // =========================================================

  const state = {
    page: 1,
    pageSize: 30,
    totalPages: 1,
  };

  // =========================================================
  // DOM ELEMENTS
  // =========================================================

  const elements = {};

  // =========================================================
  // HELPERS
  // =========================================================

  const $ = (selector) => document.querySelector(selector);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");


  const apiRequest = async (url, options = {}) => {
    const token = localStorage.getItem("accessToken");

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });


    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      throw new Error("Your session has expired. Please login again.");
    }

    if (!response.ok) {
      throw new Error(
        payload?.message ||
          payload?.error ||
          `Request failed (${response.status}).`,
      );
    }

    return payload;
  };

  // =========================================================
  // DATE FORMATTER
  // =========================================================

  const formatDateTime = (value) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(date);
  };

  // =========================================================
  // USER INITIALS
  // =========================================================

  const getInitials = (name) => {
    const parts = String(name || "System")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    const initials = parts.map((part) => part.charAt(0).toUpperCase()).join("");

    return initials || "S";
  };

  const getActionClass = (action) => {
    const normalizedAction = String(action || "").toLowerCase();

    const supportedActions = ["create", "update", "delete", "login", "logout"];

    if (supportedActions.includes(normalizedAction)) {
      return normalizedAction;
    }

    return "default";
  };

  const getActionIcon = (action) => {
    const icons = {
      create: "fa-plus",
      update: "fa-pen",
      delete: "fa-trash",
      login: "fa-right-to-bracket",
      logout: "fa-right-from-bracket",
    };

    return icons[String(action || "").toLowerCase()] || "fa-bolt";
  };

  const formatJson = (value) => {
    if (value === null || value === undefined) {
      return "No data available";
    }

    return JSON.stringify(value, null, 2);
  };

  const showToast = (message, type = "error") => {
    const container = $("#toastContainer");

    if (!container) {
      return;
    }

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;

    const icon =
      type === "success" ? "fa-circle-check" : "fa-circle-exclamation";

    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>

      <span>
        ${escapeHtml(message)}
      </span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3200);
  };

  const cacheElements = () => {
    Object.assign(elements, {
      // Summary
      totalLogs: $("#totalLogs"),
      todayLogs: $("#todayLogs"),
      updateLogs: $("#updateLogs"),
      deleteLogs: $("#deleteLogs"),

      // Filters
      search: $("#auditSearch"),
      user: $("#auditUserFilter"),
      module: $("#auditModuleFilter"),
      action: $("#auditActionFilter"),
      from: $("#auditFromDate"),
      to: $("#auditToDate"),

      // Buttons
      reset: $("#resetAuditFilters"),
      refresh: $("#refreshAuditLogs"),

      // Table
      body: $("#auditLogsTableBody"),
      empty: $("#auditEmpty"),
      count: $("#auditCount"),

      // Pagination
      previousPage: $("#previousPage"),
      nextPage: $("#nextPage"),
      pageNumber: $("#pageNumber"),

      // Modal
      modal: $("#auditDetailsModal"),
      closeModal: $("#closeAuditDetails"),
      closeModalButton: $("#closeAuditDetailsButton"),
      title: $("#auditDetailsTitle"),
      subtitle: $("#auditDetailsSubtitle"),
      details: $("#auditDetails"),
    });
  };

  // =========================================================
  // BUILD QUERY
  // =========================================================

  const buildQuery = () => {
    const params = new URLSearchParams();

    const filters = [
      ["search", elements.search.value.trim()],
      ["user_id", elements.user.value],
      ["module", elements.module.value],
      ["action", elements.action.value],
      ["from", elements.from.value],
      ["to", elements.to.value],
      ["page", state.page],
      ["pageSize", state.pageSize],
    ];

    filters.forEach(([key, value]) => {
      if (value !== "") {
        params.set(key, value);
      }
    });

    return params.toString();
  };

  // =========================================================
  // LOAD SUMMARY
  // =========================================================

  const loadSummary = async () => {
    const response = await apiRequest("/api/audit-logs/summary");

    const summary = response.summary || {};

    elements.totalLogs.textContent = Number(summary.total || 0).toLocaleString(
      "en-IN",
    );

    elements.todayLogs.textContent = Number(summary.today || 0).toLocaleString(
      "en-IN",
    );

    elements.updateLogs.textContent = Number(
      summary.updates || 0,
    ).toLocaleString("en-IN");

    elements.deleteLogs.textContent = Number(
      summary.deletes || 0,
    ).toLocaleString("en-IN");
  };

  const loadOptions = async () => {
    const response = await apiRequest("/api/audit-logs/options");

    const users = response.users || [];
    const modules = response.modules || [];
    const actions = response.actions || [];

    elements.user.innerHTML = `
      <option value="">
        All Users
      </option>

      ${users
        .map(
          (user) => `
            <option value="${escapeHtml(user.id)}">
              ${escapeHtml(user.name || user.email || `User #${user.id}`)}
            </option>
          `,
        )
        .join("")}
    `;

    elements.module.innerHTML = `
      <option value="">
        All Modules
      </option>

      ${modules
        .map(
          (module) => `
            <option value="${escapeHtml(module)}">
              ${escapeHtml(module)}
            </option>
          `,
        )
        .join("")}
    `;

    // -------------------------------------------------------
    // Actions
    // -------------------------------------------------------

    elements.action.innerHTML = `
      <option value="">
        All Actions
      </option>

      ${actions
        .map(
          (action) => `
            <option value="${escapeHtml(action)}">
              ${escapeHtml(action)}
            </option>
          `,
        )
        .join("")}
    `;
  };

  // =========================================================
  // RENDER AUDIT LOGS
  // =========================================================

  const renderAuditLogs = async () => {
    elements.body.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="audit-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading audit logs...
          </div>
        </td>
      </tr>
    `;

    elements.empty.hidden = true;

    try {
      const response = await apiRequest(`/api/audit-logs?${buildQuery()}`);

      const rows = response.logs || [];
      const pagination = response.pagination || {};

      // -----------------------------------------------------
      // Pagination state
      // -----------------------------------------------------

      state.page = Number(pagination.page || 1);

      state.totalPages = Math.max(1, Number(pagination.totalPages || 1));

      // -----------------------------------------------------
      // Pagination UI
      // -----------------------------------------------------

      elements.pageNumber.textContent = state.page;

      elements.previousPage.disabled = state.page <= 1;

      elements.nextPage.disabled = state.page >= state.totalPages;

      elements.count.textContent = pagination.total
        ? `Showing ${pagination.from}-${pagination.to} of ${pagination.total} logs`
        : "Showing 0 logs";

      // -----------------------------------------------------
      // Empty state
      // -----------------------------------------------------

      if (!rows.length) {
        elements.body.innerHTML = "";
        elements.empty.hidden = false;

        return;
      }

      // -----------------------------------------------------
      // Render table rows
      // -----------------------------------------------------

      elements.body.innerHTML = rows
        .map((row) => {
          const action = String(row.action || "").toUpperCase();

          const actionClass = getActionClass(action);

          const actionIcon = getActionIcon(action);

          return `
            <tr>

              <!-- Date -->
              <td>
                <span class="audit-date">
                  ${escapeHtml(formatDateTime(row.created_at))}
                </span>
              </td>

              <!-- User -->
              <td>
                <div class="audit-user">

                  <span class="audit-user-avatar">
                    ${escapeHtml(getInitials(row.user_name))}
                  </span>

                  <div class="audit-user-info">

                    <strong>
                      ${escapeHtml(row.user_name || "System")}
                    </strong>

                    <small>
                      ${escapeHtml(row.user_email || "—")}
                    </small>

                  </div>
                </div>
              </td>

              <!-- Module -->
              <td>
                <span class="audit-module">
                  ${escapeHtml(row.module || "—")}
                </span>
              </td>

              <!-- Action -->
              <td>
                <span
                  class="audit-action-badge ${actionClass}"
                >
                  <i
                    class="fa-solid ${actionIcon}"
                  ></i>

                  ${escapeHtml(action || "ACTION")}
                </span>
              </td>

              <!-- Record ID -->
              <td>
                <span class="audit-record">
                  ${
                    row.record_id == null
                      ? "—"
                      : `#${escapeHtml(row.record_id)}`
                  }
                </span>
              </td>

              <!-- IP -->
              <td>
                <span class="audit-ip">
                  ${escapeHtml(row.ip_address || "—")}
                </span>
              </td>

              <!-- View -->
              <td class="action-column">

                <button
                  type="button"
                  class="audit-action-button"
                  data-id="${escapeHtml(row.id)}"
                  title="View audit details"
                  aria-label="View audit details"
                >
                  <i class="fa-solid fa-eye"></i>
                </button>

              </td>

            </tr>
          `;
        })
        .join("");
    } catch (error) {
      console.error("[Audit Logs] Load error:", error);

      elements.body.innerHTML = `
        <tr>
          <td colspan="7">

            <div class="audit-loading">

              <i
                class="fa-solid fa-triangle-exclamation"
              ></i>

              ${escapeHtml(error.message)}

            </div>

          </td>
        </tr>
      `;

      showToast(error.message);
    }
  };

  // =========================================================
  // OPEN AUDIT DETAILS
  // =========================================================

  const openAuditDetails = async (id) => {
    elements.modal.hidden = false;

    document.body.style.overflow = "hidden";

    elements.details.innerHTML = `
      <div class="audit-loading">

        <i
          class="fa-solid fa-spinner fa-spin"
        ></i>

        Loading audit log...

      </div>
    `;

    try {
      const response = await apiRequest(`/api/audit-logs/${id}`);

      const auditLog = response.log;

      if (!auditLog) {
        throw new Error("Audit log not found.");
      }

      // -----------------------------------------------------
      // Modal title
      // -----------------------------------------------------

      elements.title.textContent = `${String(
        auditLog.action || "Audit",
      ).toUpperCase()} Activity`;

      elements.subtitle.textContent = `${auditLog.module || "System"} • ${formatDateTime(
        auditLog.created_at,
      )}`;

      // -----------------------------------------------------
      // Modal content
      // -----------------------------------------------------

      elements.details.innerHTML = `

        <div class="audit-detail-grid">

          <div class="audit-detail-box">
            <span>Action</span>

            <strong>
              ${escapeHtml(auditLog.action)}
            </strong>
          </div>

          <div class="audit-detail-box">
            <span>Module</span>

            <strong>
              ${escapeHtml(auditLog.module)}
            </strong>
          </div>

          <div class="audit-detail-box">
            <span>Record ID</span>

            <strong>
              ${
                auditLog.record_id == null
                  ? "—"
                  : `#${escapeHtml(auditLog.record_id)}`
              }
            </strong>
          </div>

          <div class="audit-detail-box">
            <span>Date & Time</span>

            <strong>
              ${escapeHtml(formatDateTime(auditLog.created_at))}
            </strong>
          </div>

          <div class="audit-detail-box">
            <span>User</span>

            <strong>
              ${escapeHtml(auditLog.user_name || "System")}
            </strong>
          </div>

          <div class="audit-detail-box">
            <span>Email</span>

            <strong>
              ${escapeHtml(auditLog.user_email || "—")}
            </strong>
          </div>

          <div class="audit-detail-box">
            <span>IP Address</span>

            <strong>
              ${escapeHtml(auditLog.ip_address || "—")}
            </strong>
          </div>

          <div class="audit-detail-box">
            <span>Audit ID</span>

            <strong>
              #${escapeHtml(auditLog.id)}
            </strong>
          </div>

        </div>

        <div class="audit-json-grid">

          <!-- OLD DATA -->
          <section class="audit-json-card">

            <div class="audit-json-card-header">
              Old Data
            </div>

            <pre>
${escapeHtml(formatJson(auditLog.old_data))}
            </pre>

          </section>

          <!-- NEW DATA -->
          <section class="audit-json-card">

            <div class="audit-json-card-header">
              New Data
            </div>

            <pre>
${escapeHtml(formatJson(auditLog.new_data))}
            </pre>

          </section>

        </div>
      `;
    } catch (error) {
      console.error("[Audit Logs] Details error:", error);

      elements.details.innerHTML = `
        <div class="audit-loading">

          <i
            class="fa-solid fa-triangle-exclamation"
          ></i>

          ${escapeHtml(error.message)}

        </div>
      `;

      showToast(error.message);
    }
  };

  // =========================================================
  // CLOSE MODAL
  // =========================================================

  const closeAuditDetails = () => {
    elements.modal.hidden = true;

    document.body.style.overflow = "";
  };

  // =========================================================
  // RELOAD
  // =========================================================

  const reloadAuditLogs = () => Promise.all([loadSummary(), renderAuditLogs()]);

  // =========================================================
  // RESET FILTERS
  // =========================================================

  const resetFilters = () => {
    elements.search.value = "";
    elements.from.value = "";
    elements.to.value = "";

    elements.user.value = "";
    elements.module.value = "";
    elements.action.value = "";

    state.page = 1;

    renderAuditLogs();
  };

  // =========================================================
  // EVENT BINDINGS
  // =========================================================

  const bindEvents = () => {
    // -------------------------------------------------------
    // Search
    // -------------------------------------------------------

    elements.search.addEventListener("input", () => {
      state.page = 1;

      renderAuditLogs();
    });

    // -------------------------------------------------------
    // Filters
    // -------------------------------------------------------

    [
      elements.user,
      elements.module,
      elements.action,
      elements.from,
      elements.to,
    ].forEach((element) => {
      element.addEventListener("change", () => {
        state.page = 1;

        renderAuditLogs();
      });
    });

    // -------------------------------------------------------
    // Reset
    // -------------------------------------------------------

    elements.reset.addEventListener("click", resetFilters);

    // -------------------------------------------------------
    // Refresh
    // -------------------------------------------------------

    elements.refresh.addEventListener("click", reloadAuditLogs);

    // -------------------------------------------------------
    // Previous page
    // -------------------------------------------------------

    elements.previousPage.addEventListener("click", () => {
      if (state.page <= 1) {
        return;
      }

      state.page--;

      renderAuditLogs();
    });

    // -------------------------------------------------------
    // Next page
    // -------------------------------------------------------

    elements.nextPage.addEventListener("click", () => {
      if (state.page >= state.totalPages) {
        return;
      }

      state.page++;

      renderAuditLogs();
    });

    // -------------------------------------------------------
    // View audit details
    // -------------------------------------------------------

    elements.body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-id]");

      if (!button) {
        return;
      }

      const id = Number(button.dataset.id);

      if (!Number.isInteger(id)) {
        return;
      }

      openAuditDetails(id);
    });

    // -------------------------------------------------------
    // Close modal
    // -------------------------------------------------------

    elements.closeModal.addEventListener("click", closeAuditDetails);

    elements.closeModalButton.addEventListener("click", closeAuditDetails);

    // -------------------------------------------------------
    // Close modal by clicking overlay
    // -------------------------------------------------------

    elements.modal.addEventListener("click", (event) => {
      if (event.target === elements.modal) {
        closeAuditDetails();
      }
    });

    // -------------------------------------------------------
    // Escape key
    // -------------------------------------------------------

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.modal.hidden) {
        closeAuditDetails();
      }
    });
  };

  // =========================================================
  // INITIALIZE
  // =========================================================

  document.addEventListener("DOMContentLoaded", async () => {
    cacheElements();

    bindEvents();

    try {
      await Promise.all([loadOptions(), loadSummary(), renderAuditLogs()]);
    } catch (error) {
      console.error("[Audit Logs] Initialization error:", error);

      showToast(error.message);
    }
  });
})();
