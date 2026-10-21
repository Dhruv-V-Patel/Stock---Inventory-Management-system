const pool = require("../config/db");
const { encrypt, decrypt } = require("../utils/crypto.util");

/* =========================================================
   GET COMPANY SETTINGS
   Decrypt stamp_url before returning to frontend
========================================================= */

const getCompanySettings = async () => {
  const result = await pool.query(`
    SELECT
      id,
      company_name,
      tagline,
      address,
      gstin,
      pan_no,
      phone,
      email,
      website,
      logo_url,
      stamp_url,
      authorized_signatory_name,
      bank_name,
      bank_account_number,
      bank_ifsc,
      bank_branch,
      created_at,
      updated_at
    FROM company_settings
    ORDER BY id ASC
    LIMIT 1
  `);

  const settings = result.rows[0];

  if (!settings) {
    return null;
  }

  return {
    ...settings,
    logo_url : settings.logo_url ? decrypt(settings.logo_url) : null,
    stamp_url: settings.stamp_url
      ? decrypt(settings.stamp_url)
      : null,
  };
};

/* =========================================================
   SAVE COMPANY SETTINGS
   Encrypt stamp_url before saving to database
========================================================= */

const saveCompanySettings = async (payload) => {
  const {
    company_name,
    tagline,
    address,
    gstin,
    pan_no,
    phone,
    email,
    website,
    logo_url,
    stamp_url,
    authorized_signatory_name,
    bank_name,
    bank_account_number,
    bank_ifsc,
    bank_branch,
  } = payload;

  if (!company_name || !company_name.trim()) {
    throw new Error("Company name is required.");
  }

  const values = [
    company_name.trim(),
    tagline?.trim() || null,
    address?.trim() || null,
    gstin?.trim().toUpperCase() || null,
    pan_no?.trim().toUpperCase() || null,
    phone?.trim() || null,
    email?.trim() || null,
    website?.trim() || null,

    // Logo URL remains unchanged.
    logo_url ? encrypt(logo_url) : null,

    // Encrypt stamp URL before saving.
    stamp_url ? encrypt(stamp_url) : null,

    authorized_signatory_name?.trim() || null,
    bank_name?.trim() || null,
    bank_account_number?.trim() || null,
    bank_ifsc?.trim().toUpperCase() || null,
    bank_branch?.trim() || null,
  ];

  /* -----------------------------------------
     CHECK EXISTING COMPANY SETTINGS
  ----------------------------------------- */

  const existing = await pool.query(`
    SELECT id
    FROM company_settings
    ORDER BY id ASC
    LIMIT 1
  `);

  let result;

  /* -----------------------------------------
     UPDATE EXISTING RECORD
  ----------------------------------------- */

  if (existing.rows.length > 0) {
    result = await pool.query(
  `
    UPDATE company_settings
    SET
      company_name = $1,
      tagline = $2,
      address = $3,
      gstin = $4,
      pan_no = $5,
      phone = $6,
      email = $7,
      website = $8,
      logo_url = $9,
      stamp_url = $10,
      authorized_signatory_name = $11,
      bank_name = $12,
      bank_account_number = $13,
      bank_ifsc = $14,
      bank_branch = $15,
      updated_at = NOW()
    WHERE id = $16
    RETURNING *
  `,
  [...values, existing.rows[0].id],
);
  } else {
    /* -----------------------------------------
       INSERT NEW RECORD
    ----------------------------------------- */

    result = await pool.query(
      `
        INSERT INTO company_settings (
          company_name,
          tagline,
          address,
          gstin,
          pan_no
          phone,
          email,
          website,
          logo_url,
          stamp_url,
          authorized_signatory_name,
          bank_name,
          bank_account_number,
          bank_ifsc,
          bank_branch
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15
        )
        RETURNING *
      `,
      values,
    );
  }

  /* -----------------------------------------
     RETURN DECRYPTED DATA
  ----------------------------------------- */

  const settings = result.rows[0];

  return {
    ...settings,
    logo_url : settings.logo_url ? decrypt(settings.logo_url) : null,
    stamp_url: settings.stamp_url
      ? decrypt(settings.stamp_url)
      : null,
  };
};

/* =========================================================
   EXPORT SERVICES
========================================================= */

module.exports = {
  getCompanySettings,
  saveCompanySettings,
};
