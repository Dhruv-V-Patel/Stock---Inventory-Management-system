(() => {
  "use strict";

  const API_BASE = "/api/users";
  const PAGE_SIZE = 10;
  const ROLES = ["admin", "member"];

  const getCurrentUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");

    return Number(
      user?.id ||
        user?.userId ||
        user?.user_id ||
        localStorage.getItem("userId") ||
        0,
    );
  } catch {
    return Number(localStorage.getItem("userId") || 0);
  }
};

  const state = {
    users: [],
    filteredUsers: [],
    page: 1,
    editingId: null,
    deletingId: null,
  };

  const $ = (id) => document.getElementById(id);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const initials = (name) =>
    String(name || "U")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase() || "U";

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const showToast = (message, type = "success") => {
  const container = document.querySelector(".toast-container");

  if (!container) {
    console.error("Toast container not found");
    return;
  }

  const toast = document.createElement("div");

  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: "fa-circle-check",
    error: "fa-circle-exclamation",
    warning: "fa-triangle-exclamation",
    info: "fa-circle-info",
  };

  toast.innerHTML = `
    <i class="fa-solid ${iconMap[type] || iconMap.info}"></i>

    <span class="toast-message">
      ${escapeHtml(message)}
    </span>

    <button
      type="button"
      class="toast-close"
      aria-label="Close">
      ×
    </button>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  const removeToast = () => {
    toast.classList.remove("show");

    setTimeout(() => {
      toast.remove();
    }, 250);
  };

  toast
    .querySelector(".toast-close")
    .addEventListener("click", removeToast);

  setTimeout(removeToast, 3500);
};

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

    if (!response.ok) {
      const message =
        payload?.message ||
        payload?.error ||
        "Something went wrong. Please try again.";

      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  };

  const normalizeUsers = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.users)) return payload.users;
    if (Array.isArray(payload?.data?.users)) return payload.data.users;
    return [];
  };

  const setFieldError = (field, message = "") => {
    const input = $(field);
    const error = document.querySelector(`[data-error-for="${field}"]`);

    input
      ?.closest(".form-group")
      ?.classList.toggle("has-error", Boolean(message));

    if (error) error.textContent = message;
  };

  const clearErrors = () => {
    [
      "userName",
      "userEmail",
      "userMobile",
      "userRole",
      "userPassword",
      "confirmUserPassword",
    ].forEach((field) => setFieldError(field, ""));
  };

  /* Password strength */

  const passwordRules = {
    length: (value) => value.length >= 8,
    uppercase: (value) => /[A-Z]/.test(value),
    digit: (value) => /\d/.test(value),
    special: (value) => /[^A-Za-z0-9\s]/.test(value),
  };

  const getPasswordState = (value) => {
    const result = Object.fromEntries(
      Object.entries(passwordRules).map(([key, test]) => [key, test(value)]),
    );

    const passed = Object.values(result).filter(Boolean).length;

    return {
      ...result,
      passed,
      valid: passed === 4,
    };
  };

  const updatePasswordStrength = () => {
    const value = $("userPassword").value;
    const state = getPasswordState(value);
    const bar = $("passwordStrengthBar");
    const text = $("passwordStrengthText");

    Object.entries(state).forEach(([key, valid]) => {
      const rule = document.querySelector(
        `.password-rules li[data-rule="${key}"]`,
      );

      if (rule) {
        rule.classList.toggle("valid", Boolean(valid));
      }
    });

    const percentage = (state.passed / 4) * 100;
    bar.style.width = `${percentage}%`;

    if (!value) {
      text.textContent = "Password strength: —";
      return;
    }

    text.textContent =
      state.passed <= 1
        ? "Password strength: Weak"
        : state.passed <= 3
          ? "Password strength: Medium"
          : "Password strength: Strong";
  };

  const validatePassword = (isEditing) => {
    const password = $("userPassword").value;
    const confirm = $("confirmUserPassword").value;

    setFieldError("userPassword", "");
    setFieldError("confirmUserPassword", "");

    // Edit: blank password means keep current password.
    if (isEditing && !password && !confirm) {
      return true;
    }

    if (!password) {
      setFieldError("userPassword", "New password is required.");
      return false;
    }

    const state = getPasswordState(password);

    if (!state.length) {
      setFieldError("userPassword", "Password must be at least 8 characters.");
      return false;
    }

    if (!state.uppercase) {
      setFieldError(
        "userPassword",
        "Password must contain at least one uppercase letter.",
      );
      return false;
    }

    if (!state.digit) {
      setFieldError(
        "userPassword",
        "Password must contain at least one digit.",
      );
      return false;
    }

    if (!state.special) {
      setFieldError(
        "userPassword",
        "Password must contain at least one special symbol.",
      );
      return false;
    }

    if (!confirm) {
      setFieldError("confirmUserPassword", "Confirm new password is required.");
      return false;
    }

    if (password !== confirm) {
      setFieldError(
        "confirmUserPassword",
        "New password and confirm password do not match.",
      );
      return false;
    }

    return true;
  };

  /* Form */

  const validateForm = () => {
    clearErrors();

    const name = $("userName").value.trim();
    const email = $("userEmail").value.trim();
    const mobile = $("userMobile").value.trim();
    const role = $("userRole").value;

    let valid = true;

    if (name.length < 2) {
      setFieldError("userName", "Full name is required.");
      valid = false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("userEmail", "Enter a valid email address.");
      valid = false;
    }

    if (!/^\d{10}$/.test(mobile.replace(/\D/g, ""))) {
      setFieldError("userMobile", "Enter a valid 10-digit mobile number.");
      valid = false;
    }

    if (!ROLES.includes(role)) {
      setFieldError("userRole", "Select a valid role.");
      valid = false;
    }

    const isEditing = Boolean(state.editingId);

    if (!validatePassword(isEditing)) {
      valid = false;
    }

    return valid;
  };

  const getPayload = () => {
    const password = $("userPassword").value;

    const payload = {
      name: $("userName").value.trim(),
      email: $("userEmail").value.trim().toLowerCase(),
      mobile: $("userMobile").value.replace(/\D/g, ""),
      role: $("userRole").value,
      is_active: $("userStatus").value === "true",
    };

    if (password) {
      payload.password = password;
    }

    return payload;
  };

  const resetForm = () => {
    state.editingId = null;

    $("userForm").reset();
    $("userId").value = "";
    $("userRole").value = "";
    $("userStatus").value = "true";

    $("userModalTitle").textContent = "Add User";
    $("userModalDescription").textContent = "Create a new user account.";
    $("saveUser").innerHTML =
      `<i class="fa-solid fa-check"></i><span>Save User</span>`;

    $("passwordRequiredMark").style.display = "";
    $("confirmPasswordRequiredMark").style.display = "";
    $("passwordHelp").textContent =
      "Minimum 8 characters with uppercase, digit and special symbol.";

    $("userPassword").value = "";
    $("confirmUserPassword").value = "";

    clearErrors();
    updatePasswordStrength();
  };

  const openModal = (user = null) => {
    resetForm();

    if (user) {
      state.editingId = user.id;

      $("userId").value = user.id;
      $("userName").value = user.name || "";
      $("userEmail").value = user.email || "";
      $("userMobile").value = user.mobile || "";
      $("userRole").value = user.role || "";
      $("userStatus").value = String(user.is_active !== false);

      $("userModalTitle").textContent = "Edit User";
      $("userModalDescription").textContent =
        "Update user account information.";
      $("saveUser").innerHTML =
        `<i class="fa-solid fa-check"></i><span>Update User</span>`;

      $("passwordRequiredMark").style.display = "none";
      $("confirmPasswordRequiredMark").style.display = "none";
      $("passwordHelp").textContent =
        "Leave both password fields blank to keep the current password.";
    }

    $("userModal").hidden = false;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => $("userName").focus());
  };

  const closeModal = () => {
    $("userModal").hidden = true;
    document.body.style.overflow = "";
    resetForm();
  };

  /* View */

  const openViewModal = (user) => {
    $("viewUserAvatar").textContent = initials(user.name);
    $("viewUserName").textContent = user.name || "—";
    $("viewUserEmail").textContent = user.email || "—";
    $("viewUserMobile").textContent = user.mobile || "—";

    const role = String(user.role || "").toLowerCase();
    const roleText =
      role === "admin" ? "Admin" : role === "member" ? "Member" : "—";

    $("viewUserRole").textContent = roleText;
    $("viewUserRole").className = `role-badge ${role}`;
    $("viewUserRoleDetail").textContent = roleText;

    const active = user.is_active !== false;
    $("viewUserStatus").innerHTML =
      `<span class="status-badge ${active ? "active" : "inactive"}">${active ? "Active" : "Inactive"}</span>`;

    $("viewUserCreated").textContent = formatDate(user.created_at);

    $("userViewModal").hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeViewModal = () => {
    $("userViewModal").hidden = true;
    document.body.style.overflow = "";
  };

  /* Delete */

  const openDeleteModal = (user) => {
    state.deletingId = user.id;
    $("deleteUserName").textContent = user.name || "this user";
    $("deleteUserModal").hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeDeleteModal = () => {
    state.deletingId = null;
    $("deleteUserModal").hidden = true;
    document.body.style.overflow = "";
  };

  const confirmDelete = async () => {
    if (!state.deletingId) return;

    const id = state.deletingId;
    const button = $("confirmDeleteUser");

    button.disabled = true;
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Deleting...</span>`;

    try {
      await apiRequest(`${API_BASE}/${id}`, {
        method: "DELETE",
      });

      closeDeleteModal();
      await Promise.all([loadUsers(), loadSummary()]);
      showToast("User deleted successfully.");
    } catch (error) {
      console.error("[Manage Users] Delete error:", error);
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = `<i class="fa-solid fa-trash"></i><span>Delete User</span>`;
    }
  };

  /* Data */

  const loadUsers = async () => {
    try {
      const result = await apiRequest(API_BASE);
      state.users = normalizeUsers(result);
      applyFilters();
      await loadSummary();
    } catch (error) {
      console.error("[Manage Users] Load error:", error);

      $("usersTableBody").innerHTML = `
        <tr>
          <td colspan="7">
            <div class="users-loading">
              <i class="fa-solid fa-triangle-exclamation"></i>
              ${escapeHtml(error.message)}
            </div>
          </td>
        </tr>
      `;

      showToast(error.message, "error");
    }
  };

  const loadSummary = async () => {
    const users = state.users;

    $("totalUsers").textContent = users.length;
    $("activeUsers").textContent = users.filter(
      (user) => user.is_active !== false,
    ).length;
    $("totalAdmins").textContent = users.filter(
      (user) => String(user.role).toLowerCase() === "admin",
    ).length;
    $("inactiveUsers").textContent = users.filter(
      (user) => user.is_active === false,
    ).length;
  };

  const applyFilters = () => {
    const search = $("userSearch").value.trim().toLowerCase();
    const role = $("roleFilter").value;
    const status = $("statusFilter").value;

    state.filteredUsers = state.users.filter((user) => {
      const matchesSearch =
        !search ||
        [user.name, user.email, user.mobile].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(search),
        );

      const matchesRole =
        !role || String(user.role || "").toLowerCase() === role;

      const isActive = user.is_active !== false;

      const matchesStatus =
        !status ||
        (status === "active" && isActive) ||
        (status === "inactive" && !isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });

    state.page = 1;
    renderTable();
  };

  const renderTable = () => {
    const totalPages = Math.max(
      1,
      Math.ceil(state.filteredUsers.length / PAGE_SIZE),
    );

    state.page = Math.min(state.page, totalPages);

    const start = (state.page - 1) * PAGE_SIZE;
    const rows = state.filteredUsers.slice(start, start + PAGE_SIZE);

    $("pageNumber").textContent = state.page;
    $("previousPage").disabled = state.page <= 1;
    $("nextPage").disabled = state.page >= totalPages;

    $("usersCount").textContent =
      state.filteredUsers.length === 0
        ? "Showing 0 users"
        : `Showing ${start + 1}-${Math.min(
            start + PAGE_SIZE,
            state.filteredUsers.length,
          )} of ${state.filteredUsers.length} users`;

    $("usersEmpty").hidden = rows.length !== 0;

    if (!rows.length) {
      $("usersTableBody").innerHTML = "";
      return;
    }

    $("usersTableBody").innerHTML = rows
      .map((user) => {
        const role = String(user.role || "").toLowerCase();
        const active = user.is_active !== false;

        const currentUserId = getCurrentUserId();
        const isCurrentUser = Number(user.id) === currentUserId;

        return `
          <tr>
            <td>
              <div class="user-name-cell">
                <div class="user-avatar">${escapeHtml(initials(user.name))}</div>
                <div>
                  <div class="user-name">${escapeHtml(user.name || "—")}</div>
                </div>
              </div>
            </td>

            <td>${escapeHtml(user.email || "—")}</td>
            <td>${escapeHtml(user.mobile || "—")}</td>

            <td>
              <span class="role-badge ${escapeHtml(role)}">
                ${role === "admin" ? "Admin" : "Member"}
              </span>
            </td>

            <td>
              <span class="status-badge ${active ? "active" : "inactive"}">
                ${active ? "Active" : "Inactive"}
              </span>
            </td>

            <td>${escapeHtml(formatDate(user.created_at))}</td>

            <td class="action-column">
              <div class="action-buttons">
                <button
                  class="table-action"
                  type="button"
                  data-action="view"
                  data-id="${escapeHtml(user.id)}"
                  title="View User"
                  aria-label="View User">
                  <i class="fa-solid fa-eye"></i>
                </button>

                <button
                  class="table-action"
                  type="button"
                  data-action="edit"
                  data-id="${escapeHtml(user.id)}"
                  title="Edit User"
                  aria-label="Edit User">
                  <i class="fa-solid fa-pen"></i>
                </button>

               ${
  isCurrentUser
    ? `
      <button
        class="table-action danger"
        type="button"
        data-action="self-delete"
        data-id="${escapeHtml(user.id)}"
        title="You cannot delete your own account"
        aria-label="You cannot delete your own account">
        <i class="fa-solid fa-trash"></i>
      </button>
    `
    : `
      <button
        class="table-action danger"
        type="button"
        data-action="delete"
        data-id="${escapeHtml(user.id)}"
        title="Delete User"
        aria-label="Delete User">
        <i class="fa-solid fa-trash"></i>
      </button>
    `
}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  };

  const saveUser = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;

    const isEditing = Boolean(state.editingId);
    const button = $("saveUser");

    button.disabled = true;
    button.querySelector("span").textContent = isEditing
      ? "Updating..."
      : "Saving...";

    try {
      const url = isEditing ? `${API_BASE}/${state.editingId}` : API_BASE;

      const method = isEditing ? "PUT" : "POST";

      await apiRequest(url, {
        method,
        body: JSON.stringify(getPayload()),
      });

      closeModal();
      await Promise.all([loadUsers(), loadSummary()]);

      showToast(
        isEditing ? "User updated successfully." : "User created successfully.",
      );
    } catch (error) {
      console.error("[Manage Users] Save error:", error);

      /*
       * Backend duplicate email/mobile errors are shown directly.
       * This keeps frontend UX clean while backend remains the source
       * of truth for uniqueness.
       */
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
      button.querySelector("span").textContent = isEditing
        ? "Update User"
        : "Save User";
    }
  };

  const handleTableAction = (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const user = state.users.find(
      (item) => String(item.id) === String(button.dataset.id),
    );

    if (!user) return;

    const action = button.dataset.action;

    if (action === "view") openViewModal(user);
    if (action === "edit") openModal(user);
    if (action === "self-delete") {
        showToast("You cannot delete your own account.", "warning");
        return;
      }
    if (action === "delete") openDeleteModal(user);
  };

  const togglePassword = (inputId, buttonId) => {
    const input = $(inputId);
    const button = $(buttonId);
    const icon = button?.querySelector("i");

    if (!input || !button) return;

    const show = input.type === "password";
    input.type = show ? "text" : "password";

    if (icon) {
      icon.className = show ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    }
  };

  const bindEvents = () => {
    $("addUserButton").addEventListener("click", () => openModal());
    $("emptyAddUser").addEventListener("click", () => openModal());

    $("closeUserModal").addEventListener("click", closeModal);
    $("cancelUser").addEventListener("click", closeModal);

    // $("userModal").addEventListener("click", (event) => {
    //   if (event.target === $("userModal")) closeModal();
    // });

    $("closeUserView").addEventListener("click", closeViewModal);
    $("closeUserViewButton").addEventListener("click", closeViewModal);

    $("userViewModal").addEventListener("click", (event) => {
      if (event.target === $("userViewModal")) closeViewModal();
    });

    $("cancelDeleteUser").addEventListener("click", closeDeleteModal);
    $("confirmDeleteUser").addEventListener("click", confirmDelete);

    $("deleteUserModal").addEventListener("click", (event) => {
      if (event.target === $("deleteUserModal")) closeDeleteModal();
    });

    $("userForm").addEventListener("submit", saveUser);

    $("userSearch").addEventListener("input", applyFilters);
    $("roleFilter").addEventListener("change", applyFilters);
    $("statusFilter").addEventListener("change", applyFilters);

    $("resetFilters").addEventListener("click", () => {
      $("userSearch").value = "";
      $("roleFilter").value = "";
      $("statusFilter").value = "";
      applyFilters();
    });

    $("previousPage").addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderTable();
      }
    });

    $("nextPage").addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(state.filteredUsers.length / PAGE_SIZE),
      );

      if (state.page < totalPages) {
        state.page += 1;
        renderTable();
      }
    });

    $("usersTableBody").addEventListener("click", handleTableAction);

    $("userPassword").addEventListener("input", updatePasswordStrength);

    $("userPassword").addEventListener("input", () => {
      validatePassword(Boolean(state.editingId));
    });

    $("confirmUserPassword").addEventListener("input", () => {
      validatePassword(Boolean(state.editingId));
    });

    $("toggleUserPassword").addEventListener("click", () => {
      togglePassword("userPassword", "toggleUserPassword");
    });

    $("toggleConfirmUserPassword").addEventListener("click", () => {
      togglePassword("confirmUserPassword", "toggleConfirmUserPassword");
    });

    $("userMobile").addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 10);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (!$("deleteUserModal").hidden) closeDeleteModal();
      else if (!$("userViewModal").hidden) closeViewModal();
      else if (!$("userModal").hidden) closeModal();
    });
  };

  window.initManageUsersPage = async () => {
    bindEvents();
    await loadUsers();
  };
})();
