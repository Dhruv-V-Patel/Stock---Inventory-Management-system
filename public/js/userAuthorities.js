(() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */

  const API_BASE = "/api/authorizations";

  const state = {
    users: [],
    permissions: [],
    selectedUserId: null,
    selectedPermissionIds: new Set(),
    originalPermissionIds: new Set(),
  };

  /* =========================================================
     HELPERS
  ========================================================= */

  const $ = (id) => document.getElementById(id);

  const getToken = () => {
    return localStorage.getItem("accessToken");
  };

  const escapeHtml = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const initials = (name) => {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) return "U";

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const formatModuleName = (module) => {
    return String(module || "")
      .split("-")
      .map((part) => {
        if (part.toLowerCase() === "bom") {
          return "BOM";
        }

        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  };

  const showToast = (message, type = "success") => {
    const container = $("toastContainer");

    if (!container) return;

    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    const icon = type === "error" ? "fa-circle-exclamation" : "fa-circle-check";

    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    window.setTimeout(() => {
      toast.classList.remove("show");

      window.setTimeout(() => {
        toast.remove();
      }, 200);
    }, 3000);
  };

  /* =========================================================
     API
  ========================================================= */

  const apiRequest = async (url, options = {}) => {
    const token = getToken();

    if (!token) {
      window.location.replace("/login");
      throw new Error("Authentication required.");
    }

    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    let result = null;

    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (response.status === 401) {
      localStorage.removeItem("accessToken");
      window.location.replace("/login");

      throw new Error("Your session has expired.");
    }

    if (!response.ok) {
      throw new Error(
        result?.message || `Request failed with status ${response.status}`,
      );
    }

    return result;
  };

  /* =========================================================
     NORMALIZE USERS
  ========================================================= */

  const normalizeUsers = (result) => {
    const data = result?.data ?? result;

    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data?.users)) {
      return data.users;
    }

    return [];
  };

  /* =========================================================
     NORMALIZE PERMISSIONS
  ========================================================= */

  const normalizePermissions = (result) => {
    const data = result?.data ?? result;

    if (Array.isArray(data)) {
      return {
        permissions: data,
        selectedPermissionIds: [],
      };
    }

    return {
      permissions: Array.isArray(data?.permissions) ? data.permissions : [],

      selectedPermissionIds: Array.isArray(data?.selectedPermissionIds)
        ? data.selectedPermissionIds
        : [],
    };
  };

  /* =========================================================
     LOAD USERS
  ========================================================= */

  const loadUsers = async () => {
    const select = $("userSelect");

    select.disabled = true;

    try {
      const result = await apiRequest(`${API_BASE}/users`);

      state.users = normalizeUsers(result);

      renderUserSelect();
    } catch (error) {
      console.error("[Authorization] Load users:", error);

      select.innerHTML = `
        <option value="">
          Failed to load users
        </option>
      `;

      showToast(error.message, "error");
    } finally {
      select.disabled = false;
    }
  };

  /* =========================================================
     RENDER USER SELECT
  ========================================================= */

  const renderUserSelect = () => {
    const select = $("userSelect");

    select.innerHTML = `
      <option value="">
        Select User
      </option>
      ${state.users
        .filter((user) => user.is_active !== false)
        .map(
          (user) => `
            <option value="${escapeHtml(user.id)}">
              ${escapeHtml(user.name || "Unnamed User")}
              ${user.email ? ` — ${escapeHtml(user.email)}` : ""}
            </option>
          `,
        )
        .join("")}
    `;
  };

  /* =========================================================
     LOAD USER PERMISSIONS
  ========================================================= */

  const loadUserPermissions = async (userId) => {
    if (!userId) {
      resetPermissionState();
      return;
    }

    state.selectedUserId = Number(userId);

    renderPermissionsLoading();

    $("saveChangesButton").disabled = true;

    try {
      const result = await apiRequest(
        `${API_BASE}/${encodeURIComponent(userId)}`,
      );

      const normalized = normalizePermissions(result);

      state.permissions = normalized.permissions;

      state.selectedPermissionIds = new Set(
        normalized.selectedPermissionIds.map(Number),
      );

      state.originalPermissionIds = new Set(
        normalized.selectedPermissionIds.map(Number),
      );

      renderSelectedUser();
      renderPermissions();

      $("saveChangesButton").disabled = false;
    } catch (error) {
      console.error("[Authorization] Load permissions:", error);

      renderPermissionError(error.message);

      $("saveChangesButton").disabled = true;

      showToast(error.message, "error");
    }
  };

  /* =========================================================
     SELECTED USER
  ========================================================= */

  const renderSelectedUser = () => {
    const user = state.users.find(
      (item) => Number(item.id) === state.selectedUserId,
    );

    const info = $("selectedUserInfo");

    if (!user) {
      info.hidden = true;
      return;
    }

    $("selectedUserAvatar").textContent = initials(user.name);

    $("selectedUserName").textContent = user.name || "—";

    $("selectedUserEmail").textContent = user.email || user.mobile || "—";

    const role = String(user.role || "").toLowerCase();

    const roleElement = $("selectedUserRole");

    roleElement.textContent =
      role === "admin" ? "Admin" : role === "member" ? "Member" : role || "—";

    roleElement.className = `role-badge ${escapeHtml(role)}`;

    info.hidden = false;
  };

  /* =========================================================
     PERMISSION GROUPING
  ========================================================= */

  const groupPermissions = () => {
    const groups = new Map();

    state.permissions.forEach((permission) => {
      const module = permission.module;

      if (!groups.has(module)) {
        groups.set(module, []);
      }

      groups.get(module).push(permission);
    });

    return groups;
  };

  /* =========================================================
     PERMISSION ICON
  ========================================================= */

  const getModuleIcon = (module) => {
    const icons = {
      dashboard: "fa-chart-pie",
      products: "fa-boxes-stacked",
      "raw-materials": "fa-cubes",
      customers: "fa-users",
      suppliers: "fa-truck-field",
      "product-bom": "fa-sitemap",
      "raw-material-stock": "fa-boxes-stacked",
      "ready-stock": "fa-box",
      // "stock-movements": "fa-arrow-right-arrow-left",
      purchases: "fa-cart-shopping",
      "purchase-returns": "fa-rotate-left",
      production: "fa-industry",
      "production-wastage": "fa-trash-can",
      sales: "fa-file-invoice",
      "sales-returns": "fa-rotate-left",
      dispatch: "fa-truck",
      payments: "fa-money-bill-transfer",
      "stock-report": "fa-boxes-stacked",
      "production-report": "fa-chart-column",
      "purchase-report": "fa-cart-shopping",
      "sales-report": "fa-chart-line",
      "payments-report": "fa-money-bill-transfer",
      "manage-users": "fa-users-gear",
      "audit-logs": "fa-clock-rotate-left",
    };

    return icons[module] || "fa-shield-halved";
  };

  /* =========================================================
     GET PERMISSION
  ========================================================= */

  const getPermission = (module, action) => {
    return state.permissions.find(
      (permission) =>
        permission.module === module && permission.action === action,
    );
  };

  /* =========================================================
     RENDER PERMISSIONS
  ========================================================= */

  const renderPermissions = () => {
    const tbody = $("permissionsTableBody");
    const search = $("permissionSearch").value.trim().toLowerCase();

    const groups = groupPermissions();

    const rows = [];

    groups.forEach((permissions, module) => {
      const moduleName = formatModuleName(module);

      const matchesSearch =
        !search ||
        moduleName.toLowerCase().includes(search) ||
        permissions.some((permission) =>
          String(permission.name || "")
            .toLowerCase()
            .includes(search),
        );

      if (!matchesSearch) {
        return;
      }

      const viewPermission = getPermission(module, "view");

      const editPermission = getPermission(module, "edit");

      const deletePermission = getPermission(module, "delete");

      rows.push(`
        <tr data-module="${escapeHtml(module)}">

          <td>
            <div class="permission-module">

              <div class="permission-module-icon">
                <i class="fa-solid ${getModuleIcon(module)}"></i>
              </div>

              <div class="permission-module-details">

                <span class="permission-module-name">
                  ${escapeHtml(moduleName)}
                </span>

                <span class="permission-module-key">
                  ${escapeHtml(module)}
                </span>

              </div>

            </div>
          </td>


          <td class="permission-action-column">

            ${renderCheckbox(viewPermission, module, "view")}

          </td>


          <td class="permission-action-column">

            ${renderCheckbox(editPermission, module, "edit")}

          </td>


          <td class="permission-action-column">

            ${renderCheckbox(deletePermission, module, "delete")}

          </td>

        </tr>
      `);
    });

    if (!rows.length) {
      tbody.innerHTML = "";

      $("noPermissionResults").hidden = false;

      updatePermissionSummary();

      return;
    }

    $("noPermissionResults").hidden = true;

    tbody.innerHTML = rows.join("");

    updatePermissionSummary();
  };

  /* =========================================================
     RENDER CHECKBOX
  ========================================================= */

  const renderCheckbox = (permission, module, action) => {
    if (!permission) {
      return `<span class="permission-not-available">—</span>`;
    }

    const permissionId = Number(permission.id);

    const checked = state.selectedPermissionIds.has(permissionId);

    return `
      <input
        type="checkbox"
        class="permission-checkbox"
        data-permission-id="${escapeHtml(permissionId)}"
        data-module="${escapeHtml(module)}"
        data-action="${escapeHtml(action)}"
        ${checked ? "checked" : ""}
        aria-label="${escapeHtml(`${formatModuleName(module)} ${action}`)}"
      >
    `;
  };

  /* =========================================================
     PERMISSION CHANGE
  ========================================================= */

  const handlePermissionChange = (event) => {
    const checkbox = event.target.closest(".permission-checkbox");

    if (!checkbox) return;

    const permissionId = Number(checkbox.dataset.permissionId);

    if (checkbox.checked) {
      state.selectedPermissionIds.add(permissionId);
    } else {
      state.selectedPermissionIds.delete(permissionId);
    }

    updatePermissionSummary();

    updateSaveState();
  };

  /* =========================================================
     SELECT ALL
  ========================================================= */

  const selectAll = () => {
    if (!state.selectedUserId) {
      showToast("Please select a user first.", "error");
      return;
    }

    const search = $("permissionSearch").value.trim().toLowerCase();

    state.permissions.forEach((permission) => {
      const moduleName = formatModuleName(permission.module).toLowerCase();

      const permissionName = String(permission.name || "").toLowerCase();

      if (
        !search ||
        moduleName.includes(search) ||
        permissionName.includes(search)
      ) {
        state.selectedPermissionIds.add(Number(permission.id));
      }
    });

    renderPermissions();

    updateSaveState();
  };

  /* =========================================================
     CLEAR ALL
  ========================================================= */

  const clearAll = () => {
    if (!state.selectedUserId) {
      showToast("Please select a user first.", "error");
      return;
    }

    const search = $("permissionSearch").value.trim().toLowerCase();

    state.permissions.forEach((permission) => {
      const moduleName = formatModuleName(permission.module).toLowerCase();

      const permissionName = String(permission.name || "").toLowerCase();

      if (
        !search ||
        moduleName.includes(search) ||
        permissionName.includes(search)
      ) {
        state.selectedPermissionIds.delete(Number(permission.id));
      }
    });

    renderPermissions();

    updateSaveState();
  };

  /* =========================================================
     SUMMARY
  ========================================================= */

  const updatePermissionSummary = () => {
    const count = state.selectedPermissionIds.size;

    $("permissionCount").textContent =
      `${count} permission${count === 1 ? "" : "s"} enabled`;

    $("footerPermissionText").textContent = state.selectedUserId
      ? `${count} permission${count === 1 ? "" : "s"} selected for this user.`
      : "Select a user to manage permissions.";
  };

  /* =========================================================
     SAVE STATE
  ========================================================= */

  const updateSaveState = () => {
    if (!state.selectedUserId) {
      $("saveChangesButton").disabled = true;
      return;
    }

    const changed =
      state.selectedPermissionIds.size !== state.originalPermissionIds.size ||
      [...state.selectedPermissionIds].some(
        (id) => !state.originalPermissionIds.has(id),
      );

    $("saveChangesButton").disabled = !changed;
  };

  /* =========================================================
     SAVE CHANGES
  ========================================================= */

  const saveChanges = async () => {
    if (!state.selectedUserId) {
      showToast("Please select a user first.", "error");
      return;
    }

    const button = $("saveChangesButton");

    const permissionIds = [...state.selectedPermissionIds].map(Number);

    button.disabled = true;

    button.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>Saving...</span>
    `;

    try {
      await apiRequest(
        `${API_BASE}/${encodeURIComponent(state.selectedUserId)}`,
        {
          method: "PUT",

          body: JSON.stringify({
            permissionIds,
          }),
        },
      );

      state.originalPermissionIds = new Set(permissionIds);

      showToast("User permissions updated successfully.");

      updateSaveState();
    } catch (error) {
      console.error("[Authorization] Save:", error);

      showToast(error.message, "error");
    } finally {
      button.innerHTML = `
        <i class="fa-solid fa-check"></i>
        <span>Save Changes</span>
      `;

      updateSaveState();
    }
  };

  /* =========================================================
     RESET
  ========================================================= */

  const resetPermissionState = () => {
    state.selectedUserId = null;

    state.permissions = [];

    state.selectedPermissionIds.clear();

    state.originalPermissionIds.clear();

    $("selectedUserInfo").hidden = true;

    $("permissionCount").textContent = "0 permissions enabled";

    $("footerPermissionText").textContent =
      "Select a user to manage permissions.";

    $("saveChangesButton").disabled = true;

    $("permissionsTableBody").innerHTML = `
      <tr>

        <td colspan="4">

          <div class="authorization-empty">

            <div class="authorization-empty-icon">
              <i class="fa-solid fa-user-lock"></i>
            </div>

            <h3>Select a User</h3>

            <p>
              Select a user above to manage their permissions.
            </p>

          </div>

        </td>

      </tr>
    `;

    $("noPermissionResults").hidden = true;
  };

  /* =========================================================
     LOADING
  ========================================================= */

  const renderPermissionsLoading = () => {
    $("noPermissionResults").hidden = true;

    $("permissionsTableBody").innerHTML = `
      <tr>

        <td colspan="4">

          <div class="authorization-loading">

            <i class="fa-solid fa-spinner fa-spin"></i>

            <span>
              Loading permissions...
            </span>

          </div>

        </td>

      </tr>
    `;
  };

  /* =========================================================
     ERROR
  ========================================================= */

  const renderPermissionError = (message) => {
    $("permissionsTableBody").innerHTML = `
      <tr>

        <td colspan="4">

          <div class="authorization-empty">

            <div class="authorization-empty-icon">
              <i class="fa-solid fa-triangle-exclamation"></i>
            </div>

            <h3>
              Unable to Load Permissions
            </h3>

            <p>
              ${escapeHtml(message)}
            </p>

          </div>

        </td>

      </tr>
    `;
  };

  /* =========================================================
     EVENTS
  ========================================================= */

  const bindEvents = () => {
    $("userSelect").addEventListener("change", (event) => {
      loadUserPermissions(event.target.value);
    });

    $("permissionSearch").addEventListener("input", () => {
      if (!state.selectedUserId) return;

      renderPermissions();
    });

    $("permissionsTableBody").addEventListener(
      "change",
      handlePermissionChange,
    );

    $("selectAllButton").addEventListener("click", selectAll);

    $("clearAllButton").addEventListener("click", clearAll);

    $("saveChangesButton").addEventListener("click", saveChanges);
  };

  const initUserAuthorizationPage = async () => {
    bindEvents();

    resetPermissionState();

    await loadUsers();
  };

  window.initUserAuthorizationPage = initUserAuthorizationPage;
})();
