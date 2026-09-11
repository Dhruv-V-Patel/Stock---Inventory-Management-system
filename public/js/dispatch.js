(() => {
  "use strict";

  const API_BASE = "/api/dispatches";
  const PAGE_SIZE = 20;

  const state = {
    dispatches: [],
    filteredDispatches: [],
    sales: [],
    page: 1,
    editingId: null,
    deletingId: null,
  };

  const $ = (id) => document.getElementById(id);

  const getToken = () => localStorage.getItem("accessToken");

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const formatNumber = (value) =>
    Number(value ?? 0).toLocaleString("en-IN", {
      maximumFractionDigits: 3,
    });

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString("en-IN");
  };

  const today = () => {
    const date = new Date();

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  };

  const apiRequest = async (url, options = {}) => {
    const token = getToken();

    const response = await fetch(url, {
      ...options,
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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || "Request failed.");
    }

    return data;
  };

  const showToast = (message, type = "success") => {
    const container = $("toastContainer");

    if (!container) {
      window.alert(message);
      return;
    }

    const icons = {
      success: "fa-circle-check",
      error: "fa-circle-exclamation",
      warning: "fa-triangle-exclamation",
      info: "fa-circle-info",
    };

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;

    toast.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.success} toast-icon"></i>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button type="button" class="toast-close" aria-label="Close">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    const remove = () => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 250);
    };

    toast.querySelector(".toast-close").addEventListener("click", remove);

    setTimeout(remove, 3000);
  };

  const clearErrors = () => {
    document.querySelectorAll("[data-error-for]").forEach((element) => {
      element.textContent = "";
    });

    $("itemsError").textContent = "";
  };

  const setError = (field, message) => {
    const element = document.querySelector(`[data-error-for="${field}"]`);

    if (element) {
      element.textContent = message;
    }
  };

  const updateSummary = async () => {
    try {
      const result = await apiRequest(`${API_BASE}/summary`);

      const summary = result.data || result;

      $("totalDispatches").textContent = Number(
        summary.total_dispatches || 0,
      ).toLocaleString("en-IN");

      $("todayDispatches").textContent = Number(
        summary.today_dispatches || 0,
      ).toLocaleString("en-IN");

      $("totalDispatchQty").textContent = formatNumber(
        summary.total_items || summary.total_quantity || 0,
      );
    } catch (error) {
      console.error("[Dispatch] summary:", error);
    }
  };

  const normalizeDispatch = (row) => ({
    ...row,
    id: Number(row.id),
    sale_id: row.sale_id ? Number(row.sale_id) : null,
    customer_id: row.customer_id ? Number(row.customer_id) : null,
    item_count: Number(row.item_count || 0),
    total_quantity: Number(row.total_quantity || 0),
  });

  const loadDispatches = async () => {
    $("dispatchTableBody").innerHTML = `
      <tr>
        <td colspan="9">
          <div class="dispatch-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading dispatches...
          </div>
        </td>
      </tr>
    `;

    try {
      const search = $("dispatchSearch").value.trim();

      const url = search
        ? `${API_BASE}?search=${encodeURIComponent(search)}`
        : API_BASE;

      const result = await apiRequest(url);

      const rows = Array.isArray(result)
        ? result
        : result.data || result.dispatches || [];

      state.dispatches = rows.map(normalizeDispatch);

      applyFilters();
    } catch (error) {
      console.error("[Dispatch] load:", error);

      $("dispatchTableBody").innerHTML = `
        <tr>
          <td colspan="9">
            <div class="dispatch-loading dispatch-error">
              <i class="fa-solid fa-triangle-exclamation"></i>
              ${escapeHtml(error.message)}
            </div>
          </td>
        </tr>
      `;

      $("dispatchEmpty").hidden = true;
      $("dispatchCount").textContent = "Showing 0 dispatches";

      showToast(error.message, "error");
    }
  };

  const vehicleNo = document.getElementById("vehicleNo");

  vehicleNo?.addEventListener("input", (event) => {
    const input = event.target;

    let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (value.length > 2) {
      value = `${value.slice(0, 2)}-${value.slice(2)}`;
    }

    if (value.length > 5) {
      value = `${value.slice(0, 5)}-${value.slice(5)}`;
    }

    if (value.length > 8) {
      value = `${value.slice(0, 8)}-${value.slice(8)}`;
    }

    input.value = value.slice(0, 13);
  });

  const applyFilters = () => {
    const search = $("dispatchSearch").value.trim().toLowerCase();

    state.filteredDispatches = state.dispatches.filter((dispatch) => {
      if (!search) return true;

      const haystack = [
        dispatch.dispatch_no,
        dispatch.sale_no,
        dispatch.customer_name,
        dispatch.customer_mobile,
        dispatch.vehicle_no,
        dispatch.driver_name,
        dispatch.challan_no,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });

    state.page = 1;

    renderTable();
  };

  const renderTable = () => {
    const rows = state.filteredDispatches;

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

    if (state.page > totalPages) {
      state.page = totalPages;
    }

    const start = (state.page - 1) * PAGE_SIZE;

    const pageRows = rows.slice(start, start + PAGE_SIZE);

    $("pageNumber").textContent = String(state.page);

    $("previousPage").disabled = state.page <= 1;

    $("nextPage").disabled = state.page >= totalPages;

    $("dispatchCount").textContent =
      rows.length === 0
        ? "Showing 0 dispatches"
        : `Showing ${start + 1}-${Math.min(
          start + pageRows.length,
          rows.length,
        )} of ${rows.length} dispatches`;

    $("dispatchEmpty").hidden = pageRows.length !== 0;

    if (!pageRows.length) {
      $("dispatchTableBody").innerHTML = "";
      return;
    }

    $("dispatchTableBody").innerHTML = pageRows
      .map(
        (dispatch) => `
            <tr>
              <td>
                <span class="dispatch-number">
                  ${escapeHtml(dispatch.dispatch_no)}
                </span>
              </td>

              <td>
                ${escapeHtml(dispatch.sale_no || "—")}
              </td>

              <td>
                <div class="dispatch-customer">
                  <strong>
                    ${escapeHtml(dispatch.customer_name || "—")}
                  </strong>

                  ${dispatch.customer_mobile
            ? `
                        <small>
                          ${escapeHtml(dispatch.customer_mobile)}
                        </small>
                      `
            : ""
          }
                </div>
              </td>

              <td>
                ${escapeHtml(formatDate(dispatch.dispatch_date))}
              </td>

              <td>
                ${formatNumber(dispatch.item_count)}
              </td>

              <td>
                <span class="dispatch-amount">
                  ${formatNumber(dispatch.total_quantity)}
                </span>
              </td>

              <td>
                ${escapeHtml(dispatch.vehicle_no || "—")}
              </td>

              <td>
                ${escapeHtml(dispatch.challan_no || "—")}
              </td>

              <td class="action-column">
                <div class="dispatch-actions">

                  <button
                    class="table-action"
                    type="button"
                    data-action="view"
                    data-id="${dispatch.id}"
                    title="View Dispatch"
                    aria-label="View Dispatch">
                    <i class="fa-solid fa-eye"></i>
                  </button>

                  <button
                    class="table-action"
                    type="button"
                    data-action="edit"
                    data-id="${dispatch.id}"
                    title="Edit Dispatch"
                    aria-label="Edit Dispatch">
                    <i class="fa-solid fa-pen"></i>
                  </button>

                  <button
                    class="table-action danger"
                    type="button"
                    data-action="delete"
                    data-id="${dispatch.id}"
                    title="Delete Dispatch"
                    aria-label="Delete Dispatch">
                    <i class="fa-solid fa-trash"></i>
                  </button>

                </div>
              </td>
            </tr>
          `,
      )
      .join("");
  };

  const loadOptions = async () => {
    const result = await apiRequest(`${API_BASE}/options`);

    const data = result.data || result;

    state.sales = Array.isArray(data.sales) ? data.sales : [];

    $("saleId").innerHTML = `
      <option value="">Select Sales Invoice</option>

      ${state.sales
        .map(
          (sale) => `
            <option value="${sale.id}">
              ${escapeHtml(sale.sale_no)}
              ${sale.customer_name ? ` — ${escapeHtml(sale.customer_name)}` : ""
            }
            </option>
          `,
        )
        .join("")}
    `;
  };

  const loadSaleItems = async (saleId, excludeDispatchId = null) => {
    if (!saleId) {
      $("customerName").value = "";
      $("vehicleNo").value = "";
      $("driverName").value = "";
      $("driverMobile").value = "";

      $("dispatchItemsBody").innerHTML = `
        <tr>
          <td colspan="6" class="items-empty">
            Select a sales invoice to load items.
          </td>
        </tr>
      `;

      return null;
    }

    const query = excludeDispatchId
      ? `?excludeDispatchId=${encodeURIComponent(excludeDispatchId)}`
      : "";

    const result = await apiRequest(`${API_BASE}/sale/${saleId}${query}`);

    const sale = result.data || result;

    $("customerName").value = sale.customer_name || "";
    $("vehicleNo").value = sale.vehicle_no || "";
    $("driverName").value = sale.driver_name || "";
    $("driverMobile").value = sale.driver_mobile || "";

    const items = Array.isArray(sale.items) ? sale.items : [];

    if (!items.length) {
      $("dispatchItemsBody").innerHTML = `
        <tr>
          <td colspan="6" class="items-empty">
            No items found for this sale.
          </td>
        </tr>
      `;

      return sale;
    }

    $("dispatchItemsBody").innerHTML = items
      .map(
        (item) => `
            <tr
              data-product-id="${Number(item.product_id)}"
              data-pending="${Number(item.pending_quantity || 0)}">

              <td>
                <strong>
                  ${escapeHtml(item.product_name || "—")}
                </strong>

                ${item.product_code
            ? `
                      <small>
                        ${escapeHtml(item.product_code)}
                      </small>
                    `
            : ""
          }
              </td>

              <td>
                ${formatNumber(item.ordered_quantity)}
              </td>

              <td>
                ${formatNumber(item.dispatched_quantity)}
              </td>

              <td>
                ${formatNumber(item.pending_quantity)}
              </td>

              <td>
                <input
                  type="number"
                  class="dispatch-qty"
                  min="0"
                  max="${Number(item.pending_quantity || 0)}"
                  step="0.001"
                  value="${Number(item.pending_quantity || 0) > 0
            ? Number(item.pending_quantity)
            : 0
          }"
                  ${Number(item.pending_quantity || 0) <= 0 ? "disabled" : ""}>
              </td>

              <td>
                ${escapeHtml(item.unit || "PCS")}
              </td>
            </tr>
          `,
      )
      .join("");

    bindQuantityValidation();

    return sale;
  };

  const bindQuantityValidation = () => {
    document.querySelectorAll(".dispatch-qty").forEach((input) => {
      input.addEventListener("input", () => {
        const max = Number(input.max || 0);
        const value = Number(input.value || 0);

        input.classList.toggle("over-limit", value > max || value < 0);
      });
    });
  };

  const getItems = () =>
    [...document.querySelectorAll("#dispatchItemsBody tr[data-product-id]")]
      .map((row) => {
        const input = row.querySelector(".dispatch-qty");

        const quantity = Number(input?.value || 0);

        if (quantity <= 0) {
          return null;
        }

        return {
          product_id: Number(row.dataset.productId),
          quantity,
          unit: row.children[5]?.textContent.trim() || "PCS",
        };
      })
      .filter(Boolean);

  const validateItems = () => {
    const rows = [
      ...document.querySelectorAll("#dispatchItemsBody tr[data-product-id]"),
    ];

    if (!rows.length) {
      $("itemsError").textContent = "Select a sales invoice with items.";
      return false;
    }

    for (const row of rows) {
      const input = row.querySelector(".dispatch-qty");

      if (!input || input.disabled) {
        continue;
      }

      const value = Number(input.value || 0);
      const max = Number(input.max || 0);

      if (value < 0 || value > max) {
        $("itemsError").textContent =
          "Dispatch quantity cannot exceed pending quantity.";
        input.classList.add("over-limit");
        input.focus();
        return false;
      }

      input.classList.remove("over-limit");
    }

    if (!getItems().length) {
      $("itemsError").textContent =
        "Enter dispatch quantity for at least one item.";
      return false;
    }

    $("itemsError").textContent = "";

    return true;
  };

  const resetForm = () => {
    state.editingId = null;

    $("dispatchForm").reset();
    $("dispatchId").value = "";
    $("dispatchDate").value = today();

    $("customerName").value = "";

    $("dispatchItemsBody").innerHTML = `
      <tr>
        <td colspan="6" class="items-empty">
          Select a sales invoice to load items.
        </td>
      </tr>
    `;

    $("dispatchModalTitle").textContent = "Create Dispatch";

    $("dispatchModalDescription").textContent =
      "Create a delivery record for a sales invoice.";

    $("saveDispatch").innerHTML =
      `<i class="fa-solid fa-check"></i><span>Save Dispatch</span>`;

    clearErrors();

    $("saleId").disabled = false;
  };

  const openModal = async (dispatch = null) => {
    resetForm();

    await loadOptions();

    if (dispatch) {
      state.editingId = dispatch.id;

      $("dispatchId").value = dispatch.id;

      $("dispatchModalTitle").textContent = "Edit Dispatch";

      $("dispatchModalDescription").textContent =
        "Update dispatch and delivery details.";

      $("saveDispatch").innerHTML =
        `<i class="fa-solid fa-check"></i><span>Update Dispatch</span>`;

      $("dispatchDate").value = String(dispatch.dispatch_date || "").slice(
        0,
        10,
      );

      $("vehicleNo").value = dispatch.vehicle_no || "";

      $("driverName").value = dispatch.driver_name || "";

      $("driverMobile").value = dispatch.driver_mobile || "";

      $("challanNo").value = dispatch.challan_no || "";

      $("remarks").value = dispatch.remarks || "";

      $("saleId").value = String(dispatch.sale_id || "");

      $("saleId").disabled = true;

      await loadSaleItems(dispatch.sale_id, dispatch.id);

      const itemMap = new Map(
        (dispatch.items || []).map((item) => [
          Number(item.product_id),
          Number(item.quantity || 0),
        ]),
      );

      document
        .querySelectorAll("#dispatchItemsBody tr[data-product-id]")
        .forEach((row) => {
          const input = row.querySelector(".dispatch-qty");

          const productId = Number(row.dataset.productId);

          input.value = itemMap.get(productId) || 0;
        });
    }

    $("dispatchModal").hidden = false;

    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      $("saleId").focus();
    });
  };

  const closeModal = () => {
    $("dispatchModal").hidden = true;

    document.body.style.overflow = "";

    resetForm();
  };

  const openViewModal = async (id) => {
    try {
      const result = await apiRequest(`${API_BASE}/${id}`);

      const dispatch = result.data || result;

      $("viewDispatchNo").textContent = dispatch.dispatch_no || "Dispatch";

      $("viewSaleNo").textContent = dispatch.sale_no || "—";

      $("viewCustomerName").textContent = dispatch.customer_name || "—";

      $("viewDispatchDate").textContent = formatDate(dispatch.dispatch_date);

      $("viewVehicleNo").textContent = dispatch.vehicle_no || "—";

      $("viewDriverName").textContent = dispatch.driver_name || "—";

      $("viewDriverMobile").textContent = dispatch.driver_mobile || "—";

      $("viewChallanNo").textContent = dispatch.challan_no || "—";

      $("viewDispatchRemarks").textContent = dispatch.remarks || "—";

      const items = Array.isArray(dispatch.items) ? dispatch.items : [];

      $("viewDispatchItemsBody").innerHTML = items.length
        ? items
          .map(
            (item) => `
                  <tr>
                    <td>
                      <strong>
                        ${escapeHtml(item.product_name || "—")}
                      </strong>
                    </td>

                    <td>
                      ${escapeHtml(item.product_code || "—")}
                    </td>

                    <td>
                      ${formatNumber(item.quantity)}
                    </td>

                    <td>
                      ${escapeHtml(item.unit || "PCS")}
                    </td>
                  </tr>
                `,
          )
          .join("")
        : `
              <tr>
                <td
                  colspan="4"
                  class="items-empty">
                  No items found.
                </td>
              </tr>
            `;

      $("dispatchViewModal").hidden = false;

      document.body.style.overflow = "hidden";
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const closeViewModal = () => {
    $("dispatchViewModal").hidden = true;
    document.body.style.overflow = "";
  };

  // const openDelete = async (id) => {
  //   const dispatch =
  //     state.dispatches.find(
  //       (item) =>
  //         Number(item.id) === Number(id)
  //     );

  //   if (!dispatch) return;

  //   const confirmed = window.confirm(
  //     `Delete ${dispatch.dispatch_no}?\n\n` +
  //     "This only deletes the dispatch record. Finished stock will NOT be changed."
  //   );

  //   if (!confirmed) return;

  //   try {
  //     await apiRequest(
  //       `${API_BASE}/${id}`,
  //       {
  //         method: "DELETE",
  //       }
  //     );

  //     showToast(
  //       `${dispatch.dispatch_no} deleted successfully.`
  //     );

  //     await Promise.all([
  //       loadDispatches(),
  //       updateSummary(),
  //     ]);
  //   } catch (error) {
  //     showToast(error.message, "error");
  //   }
  // };

  const openDeleteModal = (id) => {
    const dispatch = state.dispatches.find(
      (item) => Number(item.id) === Number(id),
    );

    if (!dispatch) {
      showToast("Dispatch not found.", "error");
      return;
    }

    state.deletingId = Number(id);

    $("deleteMessage").textContent =
      `Delete ${dispatch.dispatch_no}? This will only delete the dispatch record. Finished stock will NOT be changed.`;

    $("confirmDeleteButton").disabled = false;

    $("confirmDeleteButton").innerHTML = `
    <i class="fa-solid fa-trash-can"></i>
    Delete
  `;

    $("deleteModal").hidden = false;
    $("deleteModal").setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      $("cancelDeleteButton")?.focus();
    });
  };

  const closeDeleteModal = () => {
    $("deleteModal").hidden = true;
    $("deleteModal").setAttribute("aria-hidden", "true");

    state.deletingId = null;

    document.body.style.overflow = "";
  };

  const confirmDeleteDispatch = async () => {
    const id = state.deletingId;

    if (!id) {
      closeDeleteModal();
      return;
    }

    const dispatch = state.dispatches.find(
      (item) => Number(item.id) === Number(id),
    );

    if (!dispatch) {
      closeDeleteModal();
      showToast("Dispatch not found.", "error");
      return;
    }

    try {
      $("confirmDeleteButton").disabled = true;

      $("confirmDeleteButton").innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Deleting...
    `;

      await apiRequest(`${API_BASE}/${id}`, {
        method: "DELETE",
      });

      closeDeleteModal();

      showToast(`${dispatch.dispatch_no} deleted successfully.`);

      await Promise.all([loadDispatches(), updateSummary()]);
    } catch (error) {
      console.error("[Dispatch] delete:", error);

      $("confirmDeleteButton").disabled = false;

      $("confirmDeleteButton").innerHTML = `
      <i class="fa-solid fa-trash-can"></i>
      Delete
    `;

      showToast(error.message || "Unable to delete dispatch.", "error");
    }
  };
  const saveDispatch = async (event) => {
    event.preventDefault();

    clearErrors();

    const saleId = Number($("saleId").value || 0);

    if (!saleId) {
      setError("saleId", "Sales invoice is required.");
      $("saleId").focus();
      return;
    }

    if (!$("dispatchDate").value) {
      setError("dispatchDate", "Dispatch date is required.");
      $("dispatchDate").focus();
      return;
    }

    if (!validateItems()) {
      return;
    }

    const selectedSale = await apiRequest(
      `${API_BASE}/sale/${saleId}${state.editingId
        ? `?excludeDispatchId=${encodeURIComponent(state.editingId)}`
        : ""
      }`,
    );

    const sale = selectedSale.data || selectedSale;

    const payload = {
      sale_id: saleId,
      customer_id: Number(sale.customer_id),
      dispatch_date: $("dispatchDate").value,
      vehicle_no: $("vehicleNo").value.trim() || null,
      driver_name: $("driverName").value.trim() || null,
      driver_mobile: $("driverMobile").value.trim() || null,
      challan_no: $("challanNo").value.trim() || null,
      remarks: $("remarks").value.trim() || null,
      items: getItems(),
    };

    const isEditing = Boolean(state.editingId);

    const button = $("saveDispatch");

    const originalHtml = button.innerHTML;

    button.disabled = true;

    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>${isEditing ? "Updating..." : "Saving..."
      }</span>`;

    try {
      await apiRequest(
        isEditing ? `${API_BASE}/${state.editingId}` : API_BASE,
        {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );

      closeModal();

      await Promise.all([loadDispatches(), updateSummary()]);

      showToast(
        isEditing
          ? "Dispatch updated successfully."
          : "Dispatch created successfully.",
      );
    } catch (error) {
      console.error("[Dispatch] save:", error);

      showToast(error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  };

  const handleTableAction = (event) => {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const id = button.dataset.id;

    const dispatch = state.dispatches.find(
      (item) => Number(item.id) === Number(id),
    );

    if (!dispatch) return;

    if (button.dataset.action === "view") {
      openViewModal(id);
    }

    if (button.dataset.action === "edit") {
      openModal(dispatch).catch((error) => {
        showToast(error.message, "error");
      });
    }

    if (button.dataset.action === "delete") {
      openDeleteModal(id);
      return;
    }
  };

  const bindEvents = () => {
    $("addDispatchButton").addEventListener("click", () => {
      openModal().catch((error) => {
        showToast(error.message, "error");
      });
    });

    $("emptyAddDispatch").addEventListener("click", () => {
      openModal().catch((error) => {
        showToast(error.message, "error");
      });
    });

    $("closeDispatchModal").addEventListener("click", closeModal);

    $("cancelDispatch").addEventListener("click", closeModal);

    $("closeDispatchView").addEventListener("click", closeViewModal);

    $("closeDispatchViewButton").addEventListener("click", closeViewModal);

    // $("dispatchModal").addEventListener("click", (event) => {
    //   if (event.target === $("dispatchModal")) {
    //     closeModal();
    //   }
    // });

    $("dispatchViewModal").addEventListener("click", (event) => {
      if (event.target === $("dispatchViewModal")) {
        closeViewModal();
      }
    });

    $("dispatchForm").addEventListener("submit", (event) => {
      saveDispatch(event).catch((error) => {
        showToast(error.message, "error");
      });
    });

    $("saleId").addEventListener("change", async (event) => {
      clearErrors();

      try {
        await loadSaleItems(event.target.value);
      } catch (error) {
        showToast(error.message, "error");
      }
    });

    $("dispatchSearch").addEventListener("input", () => {
      clearTimeout(window.__dispatchSearchTimer);

      window.__dispatchSearchTimer = setTimeout(() => {
        loadDispatches();
      }, 300);
    });

    $("resetFilters").addEventListener("click", () => {
      $("dispatchSearch").value = "";
      loadDispatches();
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
        Math.ceil(state.filteredDispatches.length / PAGE_SIZE),
      );

      if (state.page < totalPages) {
        state.page += 1;
        renderTable();
      }
    });

    $("dispatchTableBody").addEventListener("click", handleTableAction);

    $("cancelDeleteButton").addEventListener("click", closeDeleteModal);

    $("confirmDeleteButton").addEventListener("click", confirmDeleteDispatch);

    $("deleteModal").addEventListener("click", (event) => {
      if (event.target === $("deleteModal")) {
        closeDeleteModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (!$("deleteModal").hidden) {
        closeDeleteModal();
        return;
      }

      if (!$("dispatchModal").hidden) {
        closeModal();
      }

      if (!$("dispatchViewModal").hidden) {
        closeViewModal();
      }
    });
  };

  window.initDispatchPage = async () => {
    bindEvents();

    try {
      await Promise.all([loadDispatches(), updateSummary()]);
    } catch (error) {
      console.error("[Dispatch] init:", error);
    }
  };
})();
