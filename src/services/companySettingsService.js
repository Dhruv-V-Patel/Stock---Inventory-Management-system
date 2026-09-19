const pool = require("../config/db");

/* =========================================================
   GET COMPANY SETTINGS
========================================================= */

const getCompanySettings = async () => {
  const result = await pool.query(`
    SELECT
      id,
      company_name,
      tagline,
      address,
      gstin,
      phone,
      email,
      website,
      logo_url,
      stamp_url,
      authorized_signatory_name,
      created_at,
      updated_at
    FROM company_settings
    ORDER BY id ASC
    LIMIT 1
  `);

  return result.rows[0] || null;
};

/* =========================================================
   SAVE COMPANY SETTINGS
   Single company profile: UPDATE existing row, otherwise INSERT
========================================================= */

const saveCompanySettings = async (payload) => {
  const {
    company_name,
    tagline,
    address,
    gstin,
    phone,
    email,
    website,
    logo_url,
    stamp_url,
    authorized_signatory_name,
  } = payload;

  if (!company_name || !company_name.trim()) {
    throw new Error("Company name is required.");
  }

  const values = [
    company_name.trim(),
    tagline?.trim() || null,
    address?.trim() || null,
    gstin?.trim().toUpperCase() || null,
    phone?.trim() || null,
    email?.trim() || null,
    website?.trim() || null,
    logo_url || null,
    stamp_url || null,
    authorized_signatory_name?.trim() || null,
  ];

  // Check whether the single company profile already exists.
  const existing = await pool.query(`
    SELECT id
    FROM company_settings
    ORDER BY id ASC
    LIMIT 1
  `);

  let result;

  if (existing.rows.length > 0) {
    result = await pool.query(
      `
      UPDATE company_settings
      SET
        company_name = $1,
        tagline = $2,
        address = $3,
        gstin = $4,
        phone = $5,
        email = $6,
        website = $7,
        logo_url = $8,
        stamp_url = $9,
        authorized_signatory_name = $10,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *
      `,
      [...values, existing.rows[0].id],
    );
  } else {
    result = await pool.query(
      `
      INSERT INTO company_settings (
        company_name,
        tagline,
        address,
        gstin,
        phone,
        email,
        website,
        logo_url,
        stamp_url,
        authorized_signatory_name
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10
      )
      RETURNING *
      `,
      values,
    );
  }

  return result.rows[0];
};

module.exports = {
  getCompanySettings,
  saveCompanySettings,
};
