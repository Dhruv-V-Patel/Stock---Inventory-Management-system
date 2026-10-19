// const pool = require("../config/db");

// /* =========================================================
//    GET COMPANY SETTINGS
// ========================================================= */

// const getCompanySettings = async () => {
//   const result = await pool.query(`
//     SELECT
//       id,
//       company_name,
//       tagline,
//       address,
//       gstin,
//       phone,
//       email,
//       website,
//       logo_url,
//       stamp_url,
//       authorized_signatory_name,
//       created_at,
//       updated_at
//     FROM company_settings
//     ORDER BY id ASC
//     LIMIT 1
//   `);

//   return result.rows[0] || null;
// };

// /* =========================================================
//    SAVE COMPANY SETTINGS
//    Single company profile: UPDATE existing row, otherwise INSERT
// ========================================================= */

// const saveCompanySettings = async (payload) => {
//   const {
//     company_name,
//     tagline,
//     address,
//     gstin,
//     phone,
//     email,
//     website,
//     logo_url,
//     stamp_url,
//     authorized_signatory_name,
//   } = payload;

//   if (!company_name || !company_name.trim()) {
//     throw new Error("Company name is required.");
//   }

//   const values = [
//     company_name.trim(),
//     tagline?.trim() || null,
//     address?.trim() || null,
//     gstin?.trim().toUpperCase() || null,
//     phone?.trim() || null,
//     email?.trim() || null,
//     website?.trim() || null,
//     logo_url || null,
//     stamp_url || null,
//     authorized_signatory_name?.trim() || null,
//   ];

//   // Check whether the single company profile already exists.
//   const existing = await pool.query(`
//     SELECT id
//     FROM company_settings
//     ORDER BY id ASC
//     LIMIT 1
//   `);

//   let result;

//   if (existing.rows.length > 0) {
//     result = await pool.query(
//       `
//       UPDATE company_settings
//       SET
//         company_name = $1,
//         tagline = $2,
//         address = $3,
//         gstin = $4,
//         phone = $5,
//         email = $6,
//         website = $7,
//         logo_url = $8,
//         stamp_url = $9,
//         authorized_signatory_name = $10,
//         updated_at = NOW()
//       WHERE id = $11
//       RETURNING *
//       `,
//       [...values, existing.rows[0].id],
//     );
//   } else {
//     result = await pool.query(
//       `
//       INSERT INTO company_settings (
//         company_name,
//         tagline,
//         address,
//         gstin,
//         phone,
//         email,
//         website,
//         logo_url,
//         stamp_url,
//         authorized_signatory_name
//       )
//       VALUES (
//         $1, $2, $3, $4, $5,
//         $6, $7, $8, $9, $10
//       )
//       RETURNING *
//       `,
//       values,
//     );
//   }

//   return result.rows[0];
// };

// module.exports = {
//   getCompanySettings,
//   saveCompanySettings,
// };


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

    // Logo URL remains unchanged.
    logo_url ? encrypt(logo_url) : null,

    // Encrypt stamp URL before saving.
    stamp_url ? encrypt(stamp_url) : null,

    authorized_signatory_name?.trim() || null,
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
