/* ========================================
   PRODUCTS PAGE
======================================== */

const ProductsPage = (() => {
  const state = {
    products: [],
    filteredProducts: [],
    categories: [],
    page: 1,
    pageSize: 30,
    editingId: null,
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

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const normalizeProduct = (product) => ({
    id: product.id,
    code: product.code ?? "",
    name: product.name ?? "",
    // category_id: product.category_id ? Number(product.category_id) : null,
    // category_name: product.category_name ?? "",
    category_id:
      product.category_id !== null &&
      product.category_id !== undefined &&
      product.category_id !== ""
        ? String(product.category_id)
        : "",
    category_name: String(
      product.category_name ?? product.category ?? "",
    ).trim(),

    size: product.size ?? "",
    unit: product.unit ?? "PCS",
    minimum_stock: Number(product.minimum_stock ?? 0),
    // selling_rate: Number(product.selling_rate ?? 0),
    gst_tax_rate: Number(product.gst_tax_rate ?? 0),
    is_active: Boolean(product.is_active),
  });

  const getToken = () => localStorage.getItem("accessToken");

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

  const showToast = (message, type = "success") => {
    const container = document.getElementById("toastContainer");
    if (!container) return;

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

    requestAnimationFrame(() => toast.classList.add("show"));

    const removeToast = () => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 250);
    };

    toast.querySelector(".toast-close").addEventListener("click", removeToast);
    setTimeout(removeToast, 3000);
  };

  const loadProducts = async () => {
    renderLoading();

    try {
      const payload = await apiRequest("/api/products");

      const rows = Array.isArray(payload)
        ? payload
        : payload?.products || payload?.data || [];

      state.products = rows.map(normalizeProduct);
      state.page = 1;

      applyFilters();
    } catch (error) {
      console.error("Failed to load products:", error);
      renderError(error.message);
    }
  };

  const renderLoading = () => {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="products-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Loading products...
          </div>
        </td>
      </tr>
    `;

    elements.empty.hidden = true;
  };

  const renderError = (message) => {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="products-loading">
            <i class="fa-solid fa-triangle-exclamation"></i>
            ${escapeHtml(message || "Unable to load products.")}
          </div>
        </td>
      </tr>
    `;

    elements.empty.hidden = true;
    updateSummary([]);
  };

  const populateCategoryFilter = () => {
    const currentValue = String(elements.categoryFilter.value || "");

    const categoryMap = new Map();

    // First use categories returned by /api/product-categories
    if (Array.isArray(state.categories)) {
      state.categories.forEach((category) => {
        if (!category?.id) return;

        categoryMap.set(String(category.id), {
          id: String(category.id),
          name: String(category.name ?? "").trim(),
        });
      });
    }

    state.products.forEach((product) => {
      if (!product.category_name) return;

      const categoryId = String(product.category_id || "");

      if (categoryId && !categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          id: categoryId,
          name: product.category_name,
        });
      }
    });

    const categories = [...categoryMap.values()]
      .filter((category) => category.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    elements.categoryFilter.innerHTML = `
    <option value="">All Categories</option>

    ${categories
      .map(
        (category) => `
          <option value="${escapeHtml(category.id)}">
            ${escapeHtml(category.name)}
          </option>
        `,
      )
      .join("")}
  `;

    if (categories.some((category) => String(category.id) === currentValue)) {
      elements.categoryFilter.value = currentValue;
    }
  };

  const applyFilters = () => {
    const search = elements.search.value.trim().toLowerCase();

    const selectedCategoryId = String(elements.categoryFilter.value || "");

    const selectedCategoryName =
      elements.categoryFilter.options[
        elements.categoryFilter.selectedIndex
      ]?.textContent
        ?.trim()
        .toLowerCase() || "";

    const status = elements.statusFilter.value;

    state.filteredProducts = state.products.filter((product) => {
      const productCategoryId = String(product.category_id || "");

      const productCategoryName = String(product.category_name || "")
        .trim()
        .toLowerCase();

      const matchesSearch =
        !search ||
        product.code.toLowerCase().includes(search) ||
        product.name.toLowerCase().includes(search) ||
        productCategoryName.includes(search) ||
        product.size.toLowerCase().includes(search);

      const matchesCategory =
        !selectedCategoryId ||
        productCategoryId === selectedCategoryId ||
        productCategoryName === selectedCategoryName;

      const matchesStatus =
        !status ||
        (status === "active" && product.is_active) ||
        (status === "inactive" && !product.is_active);

      return matchesSearch && matchesCategory && matchesStatus;
    });

    const totalPages = Math.max(
      1,
      Math.ceil(state.filteredProducts.length / state.pageSize),
    );

    state.page = Math.min(state.page, totalPages);

    renderProducts();

    updateSummary(state.products);
  };

  const renderProducts = () => {
    const total = state.filteredProducts.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));

    const start = (state.page - 1) * state.pageSize;
    const pageRows = state.filteredProducts.slice(
      start,
      start + state.pageSize,
    );

    elements.pageNumber.textContent = `${state.page}`;
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= totalPages;

    elements.count.textContent =
      total === 0
        ? "Showing 0 products"
        : `Showing ${start + 1}-${Math.min(start + pageRows.length, total)} of ${total} products`;

    if (pageRows.length === 0) {
      elements.tableBody.innerHTML = "";
      elements.empty.hidden = false;
      return;
    }

    elements.empty.hidden = true;
  
  // <span class="rate">
  // ${formatCurrency(product.selling_rate)}
  // </span>

    elements.tableBody.innerHTML = pageRows
      .map((product) => {
        const statusClass = product.is_active ? "active" : "inactive";
        const statusText = product.is_active ? "Active" : "Inactive";

        return `
          <tr>
            <td>
              <div class="product-name-cell">
                <div class="product-row-icon">
                  <i class="fa-solid fa-cube"></i>
                </div>

                <div>
                  <div class="product-name">
                    ${escapeHtml(product.name)}
                  </div>
                </div>
              </div>
            </td>

            <td>
              <span class="product-code">
                ${escapeHtml(product.code)}
              </span>
            </td>

            <td>
              <span class="category-badge">
                ${escapeHtml(product.category_name || "—")}
              </span>
            </td>

            <td>
              <span class="product-size">
                ${escapeHtml(product.size || "—")}
              </span>
            </td>

            <td>
              <span class="unit">
                ${escapeHtml(product.unit)}
              </span>
            </td>

            <td>
              ${product.minimum_stock.toLocaleString("en-IN", {
                maximumFractionDigits: 3,
              })}
            </td>

            <td>
              <span class="rate">
                ${Number(product.gst_tax_rate ?? 0).toLocaleString("en-IN", {
                  maximumFractionDigits: 2,
                })}%
              </span>
            </td>     

            <td>
              <span class="status-badge ${statusClass}">
                ${statusText}
              </span>
            </td>

            <td class="action-column">
              <div class="action-buttons">
                <button
                  class="table-action"
                  type="button"
                  data-action="edit"
                  data-id="${product.id}"
                  title="Edit product"
                  aria-label="Edit product"
                >
                  <i class="fa-solid fa-pen"></i>
                </button>

                <button
                  class="table-action danger"
                  type="button"
                  data-action="delete"
                  data-id="${product.id}"
                  title="Delete product"
                  aria-label="Delete product"
                >
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  };

  const updateSummary = (products) => {
    const total = products.length;
    const active = products.filter((product) => product.is_active).length;
    const inactive = total - active;

    const categories = new Set(
      products.map((product) => product.category_name).filter(Boolean),
    );

    elements.totalProducts.textContent = total.toLocaleString("en-IN");
    elements.activeProducts.textContent = active.toLocaleString("en-IN");
    elements.inactiveProducts.textContent = inactive.toLocaleString("en-IN");
    elements.productCategories.textContent =
      categories.size.toLocaleString("en-IN");
  };

  const resetForm = () => {
    elements.form.reset();
    elements.id.value = "";
    elements.minimumStock.value = "0";
    // elements.sellingRate.value = "0";
    elements.gstTaxRate.value = "0";
    elements.unit.value = "PCS";
    elements.status.value = "true";
    state.editingId = null;

    clearErrors();
  };

  const clearErrors = () => {
    document.querySelectorAll(".form-error").forEach((element) => {
      element.textContent = "";
    });
  };

  const setError = (field, message) => {
    const element = document.querySelector(`[data-error-for="${field}"]`);

    if (element) {
      element.textContent = message;
    }
  };

  const validateForm = () => {
    clearErrors();

    const code = elements.code.value.trim();
    const name = elements.name.value.trim();

    let valid = true;

    if (!code) {
      setError("productCode", "Product code is required.");
      valid = false;
    }

    if (!name) {
      setError("productName", "Product name is required.");
      valid = false;
    }

    return valid;
  };

  const openModal = (product = null) => {
    resetForm();

    if (product) {
      state.editingId = product.id;

      elements.modalTitle.textContent = "Edit Product";
      elements.modalDescription.textContent =
        "Update the product master record.";

      elements.id.value = product.id;
      elements.code.value = product.code;
      elements.name.value = product.name;
      elements.category.value = product.category_id
        ? String(product.category_id)
        : "";
      elements.size.value = product.size;
      elements.unit.value = product.unit;
      elements.minimumStock.value = product.minimum_stock;
      // elements.sellingRate.value = product.selling_rate;
      elements.gstTaxRate.value = String(product.gst_tax_rate ?? 0);
      elements.status.value = String(product.is_active);
      elements.saveProduct.querySelector("span").textContent = "Update Product";
    } else {
      elements.modalTitle.textContent = "Add Product";
      elements.modalDescription.textContent = "Create a product master record.";
      elements.saveProduct.querySelector("span").textContent = "Save Product";
    }

    elements.modal.hidden = false;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      elements.code.focus();
    });
  };

  const closeModal = () => {
    elements.modal.hidden = true;
    document.body.style.overflow = "";
    resetForm();
  };

  const openDeleteModal = (product) => {
    if (!product) return;

    state.deletingId = product.id;

    elements.deleteMessage.textContent = `"${product.name}" will be marked inactive. Existing purchase and production history will remain safe.`;

    elements.confirmDeleteButton.disabled = false;
    elements.confirmDeleteButton.innerHTML = `
    <i class="fa-solid fa-trash-can"></i>
    Deactivate
  `;

    elements.deleteModal.hidden = false;
    elements.deleteModal.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      elements.cancelDeleteButton.focus();
    });
  };

  const closeDeleteModal = () => {
    elements.deleteModal.hidden = true;
    elements.deleteModal.setAttribute("aria-hidden", "true");

    state.deletingId = null;

    // Restore page scrolling only if product/category modal isn't open
    if (elements.modal.hidden && elements.categoryModal.hidden) {
      document.body.style.overflow = "";
    }
  };

  const getFormPayload = () => ({
    code: elements.code.value.trim(),
    name: elements.name.value.trim(),
    category_id: Number(elements.category.value) || null,
    size: elements.size.value.trim() || null,
    unit: elements.unit.value,
    minimum_stock: Number(elements.minimumStock.value || 0),
    // selling_rate: Number(elements.sellingRate.value || 0),
    gst_tax_rate: Number(elements.gstTaxRate.value || 0),
    is_active: elements.status.value === "true",
  });

  const saveProduct = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const payload = getFormPayload();
    const isEditing = Boolean(state.editingId);

    elements.saveProduct.disabled = true;
    elements.saveProduct.querySelector("span").textContent = isEditing
      ? "Updating..."
      : "Saving...";

    try {
      const url = isEditing
        ? `/api/products/${state.editingId}`
        : "/api/products";

      const method = isEditing ? "PUT" : "POST";

      await apiRequest(url, {
        method,
        body: JSON.stringify(payload),
      });

      closeModal();
      await loadProducts();
      showToast(
        isEditing
          ? "Product updated successfully."
          : "Product Added successfully.",
      );
    } catch (error) {
      console.error("Failed to save product:", error);
      showToast(error.message || "Unable to save product.", "error");
    } finally {
      elements.saveProduct.disabled = false;
      elements.saveProduct.querySelector("span").textContent = isEditing
        ? "Update Product"
        : "Save Product";
    }
  };

  // const deleteProduct = async (id) => {
  //   const product = state.products.find(
  //     (item) => String(item.id) === String(id),
  //   );

  //   if (!product) {
  //     return;
  //   }

  //   const confirmed = window.confirm(
  //     `Delete "${product.name}"?\n\nIf this product is already referenced by production, sales or other transactions, the database may reject deletion.`,
  //   );

  //   if (!confirmed) {
  //     return;
  //   }

  //   try {
  //     await apiRequest(`/api/products/${id}`, {
  //       method: "DELETE",
  //     });

  //     await loadProducts();
  //     showToast("Product deleted successfully.");
  //   } catch (error) {
  //     console.error("Failed to delete product:", error);
  //     showToast(error.message || "Unable to delete product.", "error");
  //   }
  // };

  const deleteProduct = async (id) => {
    const product = state.products.find(
      (item) => String(item.id) === String(id),
    );

    if (!product) {
      showToast("Product not found.", "error");
      return;
    }

    openDeleteModal(product);
  };

  const confirmDeleteProduct = async () => {
    const id = state.deletingId;

    if (!id) {
      closeDeleteModal();
      return;
    }

    const product = state.products.find(
      (item) => String(item.id) === String(id),
    );

    if (!product) {
      closeDeleteModal();
      showToast("Product not found.", "error");
      return;
    }

    try {
      elements.confirmDeleteButton.disabled = true;

      elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Deactivating...
    `;

      await apiRequest(`/api/products/${id}`, {
        method: "DELETE",
      });

      closeDeleteModal();

      await loadProducts();

      showToast("Product deactivated successfully.");
    } catch (error) {
      console.error("Failed to deactivate product:", error);

      elements.confirmDeleteButton.disabled = false;

      elements.confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-trash-can"></i>
      Deactivate
    `;

      showToast(error.message || "Unable to deactivate product.", "error");
    }
  };
  const handleTableAction = (event) => {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    const id = button.dataset.id;
    const action = button.dataset.action;

    const product = state.products.find(
      (item) => String(item.id) === String(id),
    );

    if (action === "edit" && product) {
      openModal(product);
    }

    if (action === "delete" && product) {
      deleteProduct(id);
    }
  };

  const bindEvents = () => {
    elements.addButton.addEventListener("click", () => openModal());
    elements.emptyAdd.addEventListener("click", () => openModal());

    elements.closeModal.addEventListener("click", closeModal);
    elements.cancel.addEventListener("click", closeModal);

    // elements.modal.addEventListener("click", (event) => {
    //   if (event.target === elements.modal) {
    //     closeModal();
    //   }
    // });

    elements.form.addEventListener("submit", saveProduct);

    elements.search.addEventListener("input", () => {
      state.page = 1;
      applyFilters();
    });

    elements.categoryFilter.addEventListener("change", () => {
      state.page = 1;
      applyFilters();
    });

    elements.statusFilter.addEventListener("change", () => {
      state.page = 1;
      applyFilters();
    });

    elements.resetFilters.addEventListener("click", () => {
      elements.search.value = "";
      elements.categoryFilter.value = "";
      elements.statusFilter.value = "";
      state.page = 1;
      applyFilters();
    });

    elements.previousPage.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        renderProducts();
      }
    });

    elements.nextPage.addEventListener("click", () => {
      const totalPages = Math.max(
        1,
        Math.ceil(state.filteredProducts.length / state.pageSize),
      );

      if (state.page < totalPages) {
        state.page += 1;
        renderProducts();
      }
    });

    elements.tableBody.addEventListener("click", handleTableAction);

    elements.cancelDeleteButton.addEventListener("click", closeDeleteModal);

    elements.confirmDeleteButton.addEventListener(
      "click",
      confirmDeleteProduct,
    );

    elements.deleteModal.addEventListener("click", (event) => {
      if (event.target === elements.deleteModal) {
        closeDeleteModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.modal.hidden) {
        closeModal();
      }
    });
    elements.addCategoryButton.addEventListener("click", openCategoryModal);

    elements.closeCategoryModal.addEventListener("click", closeCategoryModal);

    elements.cancelCategory.addEventListener("click", closeCategoryModal);

    elements.categoryForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      await saveCategory();
    });

    elements.categoryModal.addEventListener("click", (event) => {
      if (event.target === elements.categoryModal) {
        closeCategoryModal();
      }
    });
  };

  const loadCategories = async (selectedCategory = "") => {
    try {
      const payload = await apiRequest("/api/product-categories");

      const categories = Array.isArray(payload)
        ? payload
        : payload?.categories || [];

      const currentValue = selectedCategory || elements.category.value || "";

      state.categories = categories;

      elements.category.innerHTML = `
      <option value="">
        Select Category
      </option>

      ${categories
        .map(
          (category) => `
            <option
              value="${category.id}"
            >
              ${escapeHtml(category.name)}
            </option>
          `,
        )
        .join("")}
    `;

      /*
       * Keep selected category.
       */

      if (
        categories.some(
          (category) => String(category.id) === String(currentValue),
        )
      ) {
        elements.category.value = String(currentValue);
      }

      populateCategoryFilter();
    } catch (error) {
      console.error("Failed to load categories:", error);
      state.categories = [];

      elements.category.innerHTML = `
      <option value="">
        Select Category
      </option>
    `;

      populateCategoryFilter();
    }
  };

  const openCategoryModal = () => {
    elements.categoryModal.hidden = false;

    elements.newCategoryName.value = "";
    elements.categoryError.textContent = "";

    requestAnimationFrame(() => {
      elements.newCategoryName.focus();
    });
  };

  const closeCategoryModal = () => {
    elements.categoryModal.hidden = true;

    elements.newCategoryName.value = "";
    elements.categoryError.textContent = "";
  };

  const saveCategory = async () => {
    const name = elements.newCategoryName.value.trim();

    elements.categoryError.textContent = "";

    if (!name) {
      elements.categoryError.textContent = "Category name is required.";

      elements.newCategoryName.focus();

      return;
    }

    try {
      elements.saveCategory.disabled = true;

      elements.saveCategory.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      Saving...
    `;

      const payload = await apiRequest("/api/product-categories", {
        method: "POST",

        body: JSON.stringify({
          name,
        }),
      });

      const category = payload?.category;

      if (!category) {
        throw new Error("Invalid category response.");
      }

      await loadCategories(category.id);

      elements.category.value = category.id;

      closeCategoryModal();
      showToast("Category Created sucessfully.");
    } catch (error) {
      console.error("Failed to create category:", error);
      elements.categoryError.textContent =
        error.message || "Failed to create category.";
    } finally {
      elements.saveCategory.disabled = false;

      elements.saveCategory.innerHTML = `
      <i class="fa-solid fa-check"></i>
      Save Category
    `;
    }
  };
  const cacheElements = () => {
    elements.addButton = qs("#addProductButton");
    elements.emptyAdd = qs("#emptyAddProduct");

    elements.totalProducts = qs("#totalProducts");
    elements.activeProducts = qs("#activeProducts");
    elements.inactiveProducts = qs("#inactiveProducts");
    elements.productCategories = qs("#productCategories");

    elements.search = qs("#productSearch");
    elements.categoryFilter = qs("#categoryFilter");
    elements.statusFilter = qs("#statusFilter");
    elements.resetFilters = qs("#resetFilters");

    elements.tableBody = qs("#productsTableBody");
    elements.empty = qs("#productsEmpty");
    elements.count = qs("#productsCount");

    elements.previousPage = qs("#previousPage");
    elements.nextPage = qs("#nextPage");
    elements.pageNumber = qs("#pageNumber");

    elements.modal = qs("#productModal");
    elements.closeModal = qs("#closeProductModal");
    elements.cancel = qs("#cancelProduct");

    elements.form = qs("#productForm");
    elements.id = qs("#productId");

    elements.code = qs("#productCode");
    elements.name = qs("#productName");
    elements.category = qs("#productCategory");
    elements.size = qs("#productSize");
    elements.unit = qs("#productUnit");
    elements.minimumStock = qs("#minimumStock");
    // elements.sellingRate = qs("#sellingRate");
    elements.gstTaxRate = qs("#gstTaxRate");
    elements.status = qs("#productStatus");

    elements.modalTitle = qs("#productModalTitle");
    elements.modalDescription = qs("#productModalDescription");
    elements.saveProduct = qs("#saveProduct");

    elements.addCategoryButton = qs("#addCategoryButton");

    elements.categoryModal = qs("#categoryModal");
    elements.closeCategoryModal = qs("#closeCategoryModal");
    elements.cancelCategory = qs("#cancelCategory");
    elements.categoryForm = qs("#categoryForm");
    elements.newCategoryName = qs("#newCategoryName");
    elements.categoryError = qs("#categoryError");
    elements.saveCategory = qs("#saveCategory");

    elements.deleteModal = qs("#deleteModal");
    elements.deleteMessage = qs("#deleteMessage");
    elements.cancelDeleteButton = qs("#cancelDeleteButton");
    elements.confirmDeleteButton = qs("#confirmDeleteButton");
  };

  const init = async () => {
    cacheElements();
    bindEvents();
    await loadCategories();

    await loadProducts();
  };

  return { init };
})();

const initProductsPage = () => ProductsPage.init();
