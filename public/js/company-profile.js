(() => {
  "use strict";

  const API_BASE = "/api/company-profile";

  let profileId = null;
  let originalProfile = null;

  const form = document.getElementById("companyProfileForm");

  // =========================================================
  // FORM ELEMENTS
  // =========================================================

  const fields = {
    company_name: document.getElementById("companyName"),
    tagline: document.getElementById("tagline"),
    address: document.getElementById("companyAddress"),
    gstin: document.getElementById("gstin"),
    phone: document.getElementById("phone"),
    email: document.getElementById("email"),
    website: document.getElementById("website"),
    authorized_signatory_name: document.getElementById(
      "authorizedSignatoryName",
    ),
  };

  // File inputs
  const logoInput = document.getElementById("logoFile");
  const stampInput = document.getElementById("stampFile");

  // Upload buttons
  const chooseLogo = document.getElementById("chooseLogo");
  const chooseStamp = document.getElementById("chooseStamp");

  // Image preview containers
  const logoPreview = document.getElementById("logoPreview");
  const stampPreview = document.getElementById("stampPreview");

  // Preview images
  const logoPreviewImage = document.getElementById("logoPreviewImage");

  const stampPreviewImage = document.getElementById("stampPreviewImage");

  // Remove buttons
  const removeLogoBtn = document.getElementById("removeLogo");

  const removeStampBtn = document.getElementById("removeStamp");

  const resetBtn = document.getElementById("resetProfile");

  let removeLogo = false;
  let removeStamp = false;

  // =========================================================
  // AUTH
  // =========================================================

  const getToken = () => {
    return localStorage.getItem("accessToken");
  };

  const getHeaders = () => {
    const token = getToken();

    return token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {};
  };

  // =========================================================
  // API REQUEST
  // =========================================================

  const apiRequest = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,

      headers: {
        ...getHeaders(),
        ...(options.headers || {}),
      },
    });

    // Unauthorized
    if (response.status === 401) {
      localStorage.removeItem("accessToken");

      window.location.href = "/login";

      return;
    }

    let data = null;

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw new Error(
        typeof data === "object"
          ? data.message || data.error || "Request failed"
          : data || "Request failed",
      );
    }

    return data;
  };

  // =========================================================
  // TOAST
  // =========================================================

  const showToast = (message, type = "success") => {
  const container = document.getElementById("toastContainer");

  if (!container) {
    console.warn("[Company Profile] Toast container not found:", message);
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
    <i class="fa-solid ${
      icons[type] || icons.success
    } toast-icon"></i>

    <span class="toast-message">
      ${String(message ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;")}
    </span>

    <button
      type="button"
      class="toast-close"
      aria-label="Close"
    >
      <i class="fa-solid fa-xmark"></i>
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
    ?.addEventListener("click", removeToast);

  setTimeout(removeToast, 3000);
};

  // =========================================================
  // HELPERS
  // =========================================================

  const setValue = (element, value) => {
    if (element) {
      element.value = value ?? "";
    }
  };

  const getValue = (element) => {
    return element ? element.value.trim() : "";
  };

  const normalizeProfile = (data) => {
    if (!data) {
      return null;
    }

    return {
      id: data.id ?? null,

      company_name: data.company_name ?? "",

      tagline: data.tagline ?? "",

      address: data.address ?? "",

      gstin: data.gstin ?? "",

      phone: data.phone ?? "",

      email: data.email ?? "",

      website: data.website ?? "",

      authorized_signatory_name: data.authorized_signatory_name ?? "",

      logo_url: data.logo_url ?? data.logo ?? "",

      stamp_url: data.stamp_url ?? data.stamp ?? "",
    };
  };

  // =========================================================
  // FORM DATA
  // =========================================================

  const getFormData = () => {
    const formData = new FormData();

    formData.append("company_name", getValue(fields.company_name));

    formData.append("tagline", getValue(fields.tagline));

    formData.append("address", getValue(fields.address));

    formData.append("gstin", getValue(fields.gstin).toUpperCase());

    formData.append("phone", getValue(fields.phone));

    formData.append("email", getValue(fields.email));

    formData.append("website", getValue(fields.website));

    formData.append(
      "authorized_signatory_name",
      getValue(fields.authorized_signatory_name),
    );

    // Logo
    if (logoInput?.files?.length) {
      formData.append("logo", logoInput.files[0]);
    }

    // Stamp
    if (stampInput?.files?.length) {
      formData.append("stamp", stampInput.files[0]);
    }

    formData.append("remove_logo", removeLogo ? "true" : "false");

    formData.append("remove_stamp", removeStamp ? "true" : "false");

    // Preserve existing logo
    if (originalProfile?.logo_url) {
      formData.append("existing_logo_url", originalProfile.logo_url);
    }

    // Preserve existing stamp
    if (originalProfile?.stamp_url) {
      formData.append("existing_stamp_url", originalProfile.stamp_url);
    }

    return formData;
  };

  // =========================================================
  // VALIDATION
  // =========================================================

  const validateForm = () => {
    let valid = true;

    document.querySelectorAll(".field-error").forEach((el) => el.remove());

    document
      .querySelectorAll(".input-error")
      .forEach((el) => el.classList.remove("input-error"));

    const addError = (element, message) => {
      if (!element) {
        return;
      }

      valid = false;

      element.classList.add("input-error");

      const error = document.createElement("small");

      error.className = "field-error";

      error.textContent = message;

      element.parentElement.appendChild(error);
    };

    // Company name
    const companyName = getValue(fields.company_name);

    if (!companyName) {
      addError(fields.company_name, "Company name is required");
    }

    // GSTIN
    const gstin = getValue(fields.gstin);

    if (gstin && !/^[A-Z0-9]{15}$/i.test(gstin)) {
      addError(fields.gstin, "Enter a valid 15-character GSTIN");
    }

    // Email
    const email = getValue(fields.email);

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addError(fields.email, "Enter a valid email address");
    }

    // Website
    const website = getValue(fields.website);

    if (website) {
      try {
        new URL(website.startsWith("http") ? website : `https://${website}`);
      } catch {
        addError(fields.website, "Enter a valid website URL");
      }
    }

    // Phone
    const phone = getValue(fields.phone);

    if (
      phone &&
      !/^(?:\+91[\s-]?)?[6-9]\d{9}$/.test(phone.replace(/\s+/g, ""))
    ) {
      addError(fields.phone, "Enter a valid Indian mobile number");
    }

    return valid;
  };

  // =========================================================
  // DOCUMENT PREVIEW
  // =========================================================

  const updateDocumentPreview = () => {
    const companyName = getValue(fields.company_name);

    const tagline = getValue(fields.tagline);

    const address = getValue(fields.address);

    const phone = getValue(fields.phone);

    const email = getValue(fields.email);

    const gstin = getValue(fields.gstin);

    const previewCompanyName = document.getElementById("previewCompanyName");

    const previewTagline = document.getElementById("previewTagline");

    const previewAddress = document.getElementById("previewAddress");

    const previewPhone = document.getElementById("previewPhone");

    const previewEmail = document.getElementById("previewEmail");

    const previewGstin = document.getElementById("previewGstin");

    if (previewCompanyName) {
      previewCompanyName.textContent = companyName || "Company Name";
    }

    if (previewTagline) {
      previewTagline.textContent = tagline || "Company Tagline";
    }

    if (previewAddress) {
      previewAddress.textContent = address || "Company Address";
    }

    if (previewPhone) {
      previewPhone.textContent = phone || "Phone";
    }

    if (previewEmail) {
      previewEmail.textContent = email || "Email";
    }

    if (previewGstin) {
      previewGstin.textContent = gstin || "GSTIN";
    }

    // Update document logo
    const documentLogo = document.getElementById("documentLogo");

    if (
      documentLogo &&
      originalProfile?.logo_url &&
      !logoInput?.files?.length
    ) {
      documentLogo.innerHTML = `
                <img
                    src="${originalProfile.logo_url}"
                    alt="Company Logo"
                >
            `;
    }
  };

  // =========================================================
  // IMAGE VALIDATION
  // =========================================================

  const validateImage = (file) => {
    if (!file) {
      return false;
    }

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file", "error");

      return false;
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      showToast("Image size must be less than 5 MB", "error");

      return false;
    }

    return true;
  };

  // =========================================================
  // IMAGE PREVIEW
  // =========================================================

  const previewImage = (file, imageElement, wrapperElement) => {
    if (!file || !validateImage(file)) {
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      if (imageElement) {
        imageElement.src = event.target.result;
      }

      if (wrapperElement) {
        wrapperElement.classList.add("has-image");
      }
    };

    reader.readAsDataURL(file);
  };

  const clearLogoPreview = () => {
    if (logoInput) {
      logoInput.value = "";
    }

    if (logoPreviewImage) {
      logoPreviewImage.src = "";
    }

    if (logoPreview) {
      logoPreview.classList.remove("has-image");
    }
  };

  const clearStampPreview = () => {
    if (stampInput) {
      stampInput.value = "";
    }

    if (stampPreviewImage) {
      stampPreviewImage.src = "";
    }

    if (stampPreview) {
      stampPreview.classList.remove("has-image");
    }
  };

  // =========================================================
  // EXISTING IMAGE
  // =========================================================

  const setExistingImage = (url, imageElement, wrapperElement) => {
    if (!url) {
      if (wrapperElement) {
        wrapperElement.classList.remove("has-image");
      }

      return;
    }

    if (imageElement) {
      imageElement.src = url;
    }

    if (wrapperElement) {
      wrapperElement.classList.add("has-image");
    }
  };

  // =========================================================
  // LOAD PROFILE
  // =========================================================

  const loadProfile = async () => {
    try {
      const response = await apiRequest(API_BASE);

      const data = response?.data ?? response?.profile ?? response;

      const profile = normalizeProfile(data);

      originalProfile = profile;

      if (!profile) {
        profileId = null;

        updateDocumentPreview();

        return;
      }

      profileId = profile.id;

      setValue(fields.company_name, profile.company_name);

      setValue(fields.tagline, profile.tagline);

      setValue(fields.address, profile.address);

      setValue(fields.gstin, profile.gstin);

      setValue(fields.phone, profile.phone);

      setValue(fields.email, profile.email);

      setValue(fields.website, profile.website);

      setValue(
        fields.authorized_signatory_name,
        profile.authorized_signatory_name,
      );

      removeLogo = false;
      removeStamp = false;

      setExistingImage(profile.logo_url, logoPreviewImage, logoPreview);

      setExistingImage(profile.stamp_url, stampPreviewImage, stampPreview);

      // Show existing logo in document preview
      const documentLogo = document.getElementById("documentLogo");

      if (documentLogo && profile.logo_url) {
        documentLogo.innerHTML = `
                    <img
                        src="${profile.logo_url}"
                        alt="Company Logo"
                    >
                `;
      }

      updateDocumentPreview();
    } catch (error) {
      console.error("Failed to load company profile:", error);

      showToast(error.message || "Failed to load company profile", "error");
    }
  };

  // =========================================================
  // SAVE PROFILE
  // =========================================================

  const saveProfile = async () => {
    if (!validateForm()) {
      showToast("Please correct the highlighted fields", "error");

      return;
    }

    const formData = getFormData();

    try {
      setLoading(true);

      // company_settings contains one company profile.
      // Therefore always use PUT /api/company-profile
      const response = await apiRequest(API_BASE, {
        method: "PUT",
        body: formData,
      });

      const data = response?.data ?? response?.profile ?? response;

      const profile = normalizeProfile(data);

      if (profile) {
        profileId = profile.id ?? profileId;

        originalProfile = profile;

        if (profile.logo_url) {
          setExistingImage(profile.logo_url, logoPreviewImage, logoPreview);
        }

        if (profile.stamp_url) {
          setExistingImage(profile.stamp_url, stampPreviewImage, stampPreview);
        }

        // Update document logo
        const documentLogo = document.getElementById("documentLogo");

        if (documentLogo && profile.logo_url) {
          documentLogo.innerHTML = `
                        <img
                            src="${profile.logo_url}"
                            alt="Company Logo"
                        >
                    `;
        }
      }

      removeLogo = false;
      removeStamp = false;

      // Clear selected file inputs after successful save
      if (logoInput) {
        logoInput.value = "";
      }

      if (stampInput) {
        stampInput.value = "";
      }

      showToast("Company profile saved successfully", "success");
    } catch (error) {
      console.error("Failed to save company profile:", error);

      showToast(error.message || "Failed to save company profile", "error");
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // RESET
  // =========================================================

  const resetProfile = () => {
    if (!originalProfile) {
      form?.reset();

      removeLogo = false;
      removeStamp = false;

      clearLogoPreview();
      clearStampPreview();

      updateDocumentPreview();

      return;
    }

    setValue(fields.company_name, originalProfile.company_name);

    setValue(fields.tagline, originalProfile.tagline);

    setValue(fields.address, originalProfile.address);

    setValue(fields.gstin, originalProfile.gstin);

    setValue(fields.phone, originalProfile.phone);

    setValue(fields.email, originalProfile.email);

    setValue(fields.website, originalProfile.website);

    setValue(
      fields.authorized_signatory_name,
      originalProfile.authorized_signatory_name,
    );

    if (logoInput) {
      logoInput.value = "";
    }

    if (stampInput) {
      stampInput.value = "";
    }

    removeLogo = false;
    removeStamp = false;

    setExistingImage(originalProfile.logo_url, logoPreviewImage, logoPreview);

    setExistingImage(
      originalProfile.stamp_url,
      stampPreviewImage,
      stampPreview,
    );

    const documentLogo = document.getElementById("documentLogo");

    if (documentLogo && originalProfile.logo_url) {
      documentLogo.innerHTML = `
                <img
                    src="${originalProfile.logo_url}"
                    alt="Company Logo"
                >
            `;
    }

    document.querySelectorAll(".field-error").forEach((el) => el.remove());

    document
      .querySelectorAll(".input-error")
      .forEach((el) => el.classList.remove("input-error"));

    updateDocumentPreview();

    showToast("Changes have been reset", "info");
  };

  // =========================================================
  // LOADING STATE
  // =========================================================

  const setLoading = (loading) => {
    const saveBtn = document.getElementById("saveProfile");

    const saveBtnTop = document.getElementById("saveProfileTop");

    if (loading) {
      if (saveBtn) {
        saveBtn.disabled = true;

        saveBtn.dataset.originalText = saveBtn.innerHTML;

        saveBtn.innerHTML = `
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>Saving...</span>
                `;
      }

      if (saveBtnTop) {
        saveBtnTop.disabled = true;

        saveBtnTop.dataset.originalText = saveBtnTop.innerHTML;

        saveBtnTop.innerHTML = `
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>Saving...</span>
                `;
      }
    } else {
      if (saveBtn) {
        saveBtn.disabled = false;

        if (saveBtn.dataset.originalText) {
          saveBtn.innerHTML = saveBtn.dataset.originalText;
        }
      }

      if (saveBtnTop) {
        saveBtnTop.disabled = false;

        if (saveBtnTop.dataset.originalText) {
          saveBtnTop.innerHTML = saveBtnTop.dataset.originalText;
        }
      }
    }
  };

  // =========================================================
  // EVENT LISTENERS
  // =========================================================

  Object.values(fields).forEach((field) => {
    if (!field) {
      return;
    }

    field.addEventListener("input", () => {
      updateDocumentPreview();
    });

    field.addEventListener("change", () => {
      updateDocumentPreview();
    });
  });

  // =========================================================
  // GSTIN UPPERCASE
  // =========================================================

  if (fields.gstin) {
    fields.gstin.addEventListener("input", () => {
      fields.gstin.value = fields.gstin.value.toUpperCase();
    });
  }

  // =========================================================
  // LOGO FILE PICKER
  // =========================================================

  if (chooseLogo && logoInput) {
    chooseLogo.addEventListener("click", () => {
      logoInput.click();
    });
  }

  // =========================================================
  // STAMP FILE PICKER
  // =========================================================

  if (chooseStamp && stampInput) {
    chooseStamp.addEventListener("click", () => {
      stampInput.click();
    });
  }

  // =========================================================
  // LOGO CHANGE
  // =========================================================

  if (logoInput) {
    logoInput.addEventListener("change", () => {
      const file = logoInput.files?.[0];

      if (!file) {
        return;
      }

      if (!validateImage(file)) {
        logoInput.value = "";

        return;
      }

      removeLogo = false;

      previewImage(file, logoPreviewImage, logoPreview);

      // Update document preview immediately
      const reader = new FileReader();

      reader.onload = (event) => {
        const documentLogo = document.getElementById("documentLogo");

        if (documentLogo) {
          documentLogo.innerHTML = `
                            <img
                                src="${event.target.result}"
                                alt="Company Logo"
                            >
                        `;
        }
      };

      reader.readAsDataURL(file);
    });
  }

  // =========================================================
  // STAMP CHANGE
  // =========================================================

  if (stampInput) {
    stampInput.addEventListener("change", () => {
      const file = stampInput.files?.[0];

      if (!file) {
        return;
      }

      if (!validateImage(file)) {
        stampInput.value = "";

        return;
      }

      removeStamp = false;

      previewImage(file, stampPreviewImage, stampPreview);
    });
  }

  // =========================================================
  // REMOVE LOGO
  // =========================================================

  if (removeLogoBtn) {
    removeLogoBtn.addEventListener("click", () => {
      removeLogo = true;

      clearLogoPreview();

      const documentLogo = document.getElementById("documentLogo");

      if (documentLogo) {
        documentLogo.innerHTML = `
                        <i class="fa-solid fa-building"></i>
                    `;
      }

      showToast("Company logo will be removed after saving", "info");
    });
  }

  // =========================================================
  // REMOVE STAMP
  // =========================================================

  if (removeStampBtn) {
    removeStampBtn.addEventListener("click", () => {
      removeStamp = true;

      clearStampPreview();

      showToast("Stamp & signature will be removed after saving", "info");
    });
  }

  // =========================================================
  // FORM SUBMIT
  // =========================================================

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      saveProfile();
    });
  }

  // =========================================================
  // TOP SAVE BUTTON
  // =========================================================

  const saveProfileTop = document.getElementById("saveProfileTop");

  if (saveProfileTop) {
    saveProfileTop.addEventListener("click", () => {
      saveProfile();
    });
  }

  // =========================================================
  // RESET BUTTON
  // =========================================================

  if (resetBtn) {
    resetBtn.addEventListener("click", resetProfile);
  }

  // =========================================================
  // INITIALIZE
  // =========================================================

  const initCompanyProfilePage = async () => {
    updateDocumentPreview();

    await loadProfile();
  };

  // Expose for HTML
  window.initCompanyProfilePage = initCompanyProfilePage;

  // Since this script is loaded at the bottom of HTML,
  // DOM is normally already available.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCompanyProfilePage, {
      once: true,
    });
  } else {
    initCompanyProfilePage();
  }
})();
