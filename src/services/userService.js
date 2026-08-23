const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const { createAuditLog } = require("./auditLogService");

const ROLES = ["admin", "member"];

const normalizeUser = (row) => ({
  id: Number(row.id),
  name: row.name,
  email: row.email,
  mobile: row.mobile,
  role: row.role,
  is_active: Boolean(row.is_active),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const assertId = (value) => {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid user id.");
    error.statusCode = 400;
    throw error;
  }

  return id;
};

const validateRole = (role) => {
  const normalized = String(role || "").trim().toLowerCase();

  if (!ROLES.includes(normalized)) {
    const error = new Error("Role must be admin or member.");
    error.statusCode = 400;
    throw error;
  }

  return normalized;
};

const validateUserPayload = ({ name, email, mobile, role, password }, {
  passwordRequired = false,
} = {}) => {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedMobile = mobile ? String(mobile).trim() : null;
  const normalizedRole = validateRole(role);

  if (!normalizedName) {
    const error = new Error("Name is required.");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedName.length > 150) {
    const error = new Error("Name cannot exceed 150 characters.");
    error.statusCode = 400;
    throw error;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const error = new Error("A valid email address is required.");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedMobile && !/^[0-9+\-\s()]{7,15}$/.test(normalizedMobile)) {
    const error = new Error("Invalid mobile number.");
    error.statusCode = 400;
    throw error;
  }

  if (passwordRequired && String(password || "").length < 6) {
    const error = new Error("Password must be at least 6 characters.");
    error.statusCode = 400;
    throw error;
  }

  if (password && String(password).length < 6) {
    const error = new Error("Password must be at least 6 characters.");
    error.statusCode = 400;
    throw error;
  }

  return {
    name: normalizedName,
    email: normalizedEmail,
    mobile: normalizedMobile,
    role: normalizedRole,
  };
};

const listUsers = async () => {
  const [usersResult, statsResult] = await Promise.all([
    pool.query(`
      SELECT
        id,
        name,
        email,
        mobile,
        role,
        is_active,
        created_at,
        updated_at
      FROM users
      ORDER BY created_at DESC, id DESC
    `),
    pool.query(`
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE role = 'admin')::int AS total_admins,
        COUNT(*) FILTER (WHERE role = 'member')::int AS total_members,
        COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_users
      FROM users
    `),
  ]);

  const stats = statsResult.rows[0] || {};

  return {
    users: usersResult.rows.map(normalizeUser),
    stats: {
      totalUsers: Number(stats.total_users || 0),
      totalAdmins: Number(stats.total_admins || 0),
      totalMembers: Number(stats.total_members || 0),
      activeUsers: Number(stats.active_users || 0),
    },
  };
};

const getUserById = async (id) => {
  const userId = assertId(id);

  const { rows } = await pool.query(`
    SELECT
      id,
      name,
      email,
      mobile,
      role,
      is_active,
      created_at,
      updated_at
    FROM users
    WHERE id = $1
  `, [userId]);

  return rows[0] ? normalizeUser(rows[0]) : null;
};

const createUser = async (payload, auditContext = {}) => {
  const validated = validateUserPayload(payload, {
    passwordRequired: true,
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
      [validated.email],
    );

    if (existing.rowCount) {
      const error = new Error("A user with this email already exists.");
      error.statusCode = 409;
      throw error;
    }

    if (validated.mobile) {
      const mobileExisting = await client.query(
        `SELECT id FROM users WHERE mobile = $1`,
        [validated.mobile],
      );

      if (mobileExisting.rowCount) {
        const error = new Error("A user with this mobile number already exists.");
        error.statusCode = 409;
        throw error;
      }
    }

    const passwordHash = await bcrypt.hash(String(payload.password), 12);

    const { rows } = await client.query(`
      INSERT INTO users (
        name,
        email,
        mobile,
        password_hash,
        role,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        name,
        email,
        mobile,
        role,
        is_active,
        created_at,
        updated_at
    `, [
      validated.name,
      validated.email,
      validated.mobile,
      passwordHash,
      validated.role,
      payload.is_active !== false,
    ]);

    const newUser = rows[0];

    // Default permissions:
    // member -> view only
    // admin  -> all permissions
    
    // Default permissions from role_permissions
    await client.query(
      `
        INSERT INTO user_permissions (
          user_id,
          permission_id
        )
        SELECT
          $1,
          rp.permission_id
        FROM role_permissions rp
        INNER JOIN roles r
          ON r.id = rp.role_id
        WHERE
          r.name = $2
          AND r.is_active = TRUE
        ON CONFLICT (user_id, permission_id)
        DO NOTHING
      `,
      [
        newUser.id,
        validated.role,
      ],
    );

      await createAuditLog({
    userId: auditContext.userId || null,
    module: "USERS",
    action: "CREATE",
    recordId: newUser.id,
    oldData: null,
    newData: newUser,
    ipAddress: auditContext.ipAddress || null,
  });

    await client.query("COMMIT");

    return normalizeUser(newUser);
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      const duplicate = new Error("Email or mobile already exists.");
      duplicate.statusCode = 409;
      throw duplicate;
    }

    throw error;
  } finally {
    client.release();
  }
};

const updateUser = async (id, payload, {currentUserId, ipAddress}) => {
  const userId = assertId(id);
  const validated = validateUserPayload(payload);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query(
      `SELECT  id, name, email, mobile, role, is_active, created_at, updated_at FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );

    if (!existingResult.rowCount) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    const oldUser = existingResult.rows[0];

    if (validated.email) {
      const duplicate = await client.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2`,
        [validated.email, userId],
      );

      if (duplicate.rowCount) {
        const error = new Error("A user with this email already exists.");
        error.statusCode = 409;
        throw error;
      }
    }

    if (validated.mobile) {
      const duplicate = await client.query(
        `SELECT id FROM users WHERE mobile = $1 AND id <> $2`,
        [validated.mobile, userId],
      );

      if (duplicate.rowCount) {
        const error = new Error("A user with this mobile number already exists.");
        error.statusCode = 409;
        throw error;
      }
    }

    const oldRole = existingResult.rows[0].role;

    // Prevent the currently logged-in admin from accidentally removing
    // their own admin access.
    if (
      Number(currentUserId) === userId &&
      oldRole === "admin" &&
      validated.role !== "admin"
    ) {
      const error = new Error("You cannot remove your own admin role.");
      error.statusCode = 400;
      throw error;
    }

    const password = String(payload.password || "");

    let result;

    if (password) {
      const passwordHash = await bcrypt.hash(password, 12);

      result = await client.query(`
        UPDATE users
        SET
          name = $1,
          email = $2,
          mobile = $3,
          password_hash = $4,
          role = $5,
          is_active = $6,
          updated_at = NOW()
        WHERE id = $7
        RETURNING
          id,
          name,
          email,
          mobile,
          role,
          is_active,
          created_at,
          updated_at
      `, [
        validated.name,
        validated.email,
        validated.mobile,
        passwordHash,
        validated.role,
        payload.is_active !== false,
        userId,
      ]);
    } else {
      result = await client.query(`
        UPDATE users
        SET
          name = $1,
          email = $2,
          mobile = $3,
          role = $4,
          is_active = $5,
          updated_at = NOW()
        WHERE id = $6
        RETURNING
          id,
          name,
          email,
          mobile,
          role,
          is_active,
          created_at,
          updated_at
      `, [
        validated.name,
        validated.email,
        validated.mobile,
        validated.role,
        payload.is_active !== false,
        userId,
      ]);
    }

    const newUser = normalizeUser(result.rows[0]);

    await createAuditLog({
      userId: currentUserId || null,
      module: "USERS",
      action: "UPDATE",
      recordId: newUser.id,
      oldData: oldUser,
      newData: newUser,
      ipAddress: ipAddress || null,
    });

    await client.query("COMMIT");

    return normalizeUser(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      const duplicate = new Error("Email or mobile already exists.");
      duplicate.statusCode = 409;
      throw duplicate;
    }

    throw error;
  } finally {
    client.release();
  }
};

const deleteUser = async (id, {currentUserId, ipAddress}) => {
  const userId = assertId(id);

  if (Number(currentUserId) === userId) {
    const error = new Error("You cannot delete your own account.");
    error.statusCode = 400;
    throw error;
  }

  const { rows } = await pool.query(
    `SELECT  id, name, email, mobile, role, is_active, created_at, updated_at FROM users WHERE id = $1`,
    [userId],
  );

  if (!rows.length) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  if (rows[0].role === "admin") {
    const error = new Error("Admin users cannot be deleted.");
    error.statusCode = 409;
    throw error;
  }

  const oldUser = normalizeUser(rows[0]);

  const result = await pool.query(
    `DELETE FROM users WHERE id = $1 RETURNING id`,
    [userId],
  );

    await createAuditLog({
      userId: currentUserId || null,
      module: "USERS",
      action: "DELETE",
      recordId: oldUser.id,
      oldData: oldUser,
      ipAddress: ipAddress || null,
    });

  return Number(result.rows[0].id);
};

module.exports = {
  ROLES,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
