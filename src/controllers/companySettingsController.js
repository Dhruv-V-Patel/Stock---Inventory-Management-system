const fs = require("fs");
const path = require("path");
const companySettingsService = require("../services/companySettingsService");

const deleteCompanyProfileFile = async (fileUrl) => {
  if (!fileUrl) return;

  const normalizedUrl = String(fileUrl).replace(/\\/g, "/");
  const prefix = "/uploads/company-profile/";

  // Only delete files from company-profile folder
  if (!normalizedUrl.startsWith(prefix)) {
    return;
  }

  const filename = normalizedUrl.slice(prefix.length);

  // Prevent path traversal
  if (
    !filename ||
    filename !== path.basename(filename) ||
    filename.includes("..")
  ) {
    return;
  }

  const filePath = path.join(
    process.cwd(),
    "public",
    "uploads",
    "company-profile",
    filename
  );

  try {
    await fs.promises.unlink(filePath);
    console.log("Company profile file deleted:", filename);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(
        "[Company Settings] File deletion failed:",
        error
      );
    }
  }
};

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

    const current = await companySettingsService.getCompanySettings();

    let oldLogoUrl  = current?.logo_url || null;
    let oldStampUrl = current?.stamp_url || null;

    let logoUrl = oldLogoUrl;
    let stampUrl = oldStampUrl;

    // New logo
    if (logoFile) {
      logoUrl = `/uploads/company-profile/${logoFile.filename}`;
    }

    // New stamp + signature
    if (stampFile) {
      stampUrl = `/uploads/company-profile/${stampFile.filename}`;
    }

    if (String(body.remove_logo).toLowerCase() === "true") {
      logoUrl = null;
    }

    // Remove stamp if requested
    if (String(body.remove_stamp).toLowerCase() === "true") {
      stampUrl = null;
    }

    // Remove logo
// if (String(body.remove_logo).toLowerCase() === "true") {
//   if (logoUrl) {
//     const logoPath = path.join(
//       process.cwd(),
//       "public",
//       logoUrl.replace(/^\/+/, ""),
//     );

//     try {
//       if (fs.existsSync(logoPath)) {
//         fs.unlinkSync(logoPath);
//       }
//     } catch (error) {
//       console.error("[Company Settings] Failed to delete logo file:", error);
//     }
//   }

//   logoUrl = null;
// }

// // Remove stamp
// if (String(body.remove_stamp).toLowerCase() === "true") {
//   if (stampUrl) {
//     const stampPath = path.join(
//       process.cwd(),
//       "public",
//       stampUrl.replace(/^\/+/, ""),
//     );

//     try {
//       if (fs.existsSync(stampPath)) {
//         fs.unlinkSync(stampPath);
//       }
//     } catch (error) {
//       console.error("[Company Settings] Failed to delete stamp file:", error);
//     }
//   }

//   stampUrl = null;
// }

    const payload = {
      company_name: body.company_name,
      tagline: body.tagline,
      address: body.address,
      gstin: body.gstin,
      pan_no: body.pan_no,
      phone: body.phone,
      email: body.email,
      website: body.website,
      logo_url: logoUrl,
      stamp_url: stampUrl,
      authorized_signatory_name: body.authorized_signatory_name,
      bank_name: body.bank_name,
      bank_account_number: body.bank_account_number,
      bank_ifsc: body.bank_ifsc,
      bank_branch: body.bank_branch,
    };

    const data = await companySettingsService.saveCompanySettings(payload);

     if (oldLogoUrl && oldLogoUrl !== logoUrl) {
      await deleteCompanyProfileFile(oldLogoUrl);
    }

    if (oldStampUrl && oldStampUrl !== stampUrl) {
      await deleteCompanyProfileFile(oldStampUrl);
    }

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
