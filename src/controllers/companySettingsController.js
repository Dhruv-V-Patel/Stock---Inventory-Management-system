const fs = require("fs");
const path = require("path");
const companySettingsService = require("../services/companySettingsService");


/* =========================================================
   GET COMPANY SETTINGS
========================================================= */

const getCompanySettings = async (req, res) => {
  try {
    const data = await companySettingsService.getCompanySettings();

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("[Company Settings GET Error]", error);

    res.status(500).json({
      success: false,
      message: error.message || "Failed to load company settings.",
    });
  }
};

/* =========================================================
   SAVE COMPANY SETTINGS
========================================================= */

const saveCompanySettings = async (req, res) => {
  try {
    const body = req.body || {};
    const files = req.files || {};

    const logoFile = files.logo?.[0] || null;
    const stampFile = files.stamp?.[0] || null;

    // Get current DB profile so existing images are preserved
    // even if the browser does not send existing_*_url.
    const current = await companySettingsService.getCompanySettings();

    let logoUrl = current?.logo_url || null;
    let stampUrl = current?.stamp_url || null;

    // New logo
    if (logoFile) {
      logoUrl = `/images/company-profile/${logoFile.filename}`;
    }

    // New stamp + signature
    if (stampFile) {
      stampUrl = `/images/company-profile/${stampFile.filename}`;
    }

    // // Remove logo
    // if (String(body.remove_logo).toLowerCase() === "true") {
    //   logoUrl = null;
    // }

    // // Remove stamp
    // if (String(body.remove_stamp).toLowerCase() === "true") {
    //   stampUrl = null;
    // }

    // Remove logo
if (String(body.remove_logo).toLowerCase() === "true") {
  if (logoUrl) {
    const logoPath = path.join(
      process.cwd(),
      "public",
      logoUrl.replace(/^\/+/, ""),
    );

    try {
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    } catch (error) {
      console.error("[Company Settings] Failed to delete logo file:", error);
    }
  }

  logoUrl = null;
}

// Remove stamp
if (String(body.remove_stamp).toLowerCase() === "true") {
  if (stampUrl) {
    const stampPath = path.join(
      process.cwd(),
      "public",
      stampUrl.replace(/^\/+/, ""),
    );

    try {
      if (fs.existsSync(stampPath)) {
        fs.unlinkSync(stampPath);
      }
    } catch (error) {
      console.error("[Company Settings] Failed to delete stamp file:", error);
    }
  }

  stampUrl = null;
}

    const payload = {
      company_name: body.company_name,
      tagline: body.tagline,
      address: body.address,
      gstin: body.gstin,
      phone: body.phone,
      email: body.email,
      website: body.website,
      logo_url: logoUrl,
      stamp_url: stampUrl,
      authorized_signatory_name: body.authorized_signatory_name,
    };

    const data = await companySettingsService.saveCompanySettings(payload);

    res.json({
      success: true,
      message: "Company profile saved successfully.",
      data,
    });
  } catch (error) {
    console.error("[Company Settings SAVE Error]", error);

    res.status(400).json({
      success: false,
      message: error.message || "Failed to save company settings.",
    });
  }
};

module.exports = {
  getCompanySettings,
  saveCompanySettings,
};
