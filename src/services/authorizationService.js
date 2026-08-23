const pool = require("../config/db");

const assertUserId = (value) => {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Invalid user id.");
    error.statusCode = 400;
    throw error;
  }

  return id;
};

const normalizeUser = (row) => ({
  id: Number(row.id),
  name: row.name,
  email: row.email,
  mobile: row.mobile,
  role: row.role,
  is_active: Boolean(row.is_active),
});

const normalizePermission = (row) => ({
  id: Number(row.id),
  module: row.module,
  action: row.action,
  name: row.name,
  description: row.description,
});

const getAuthorizationUsers = async () => {
  const { rows } = await pool.query(`
    SELECT
      id,
      name,
      email,
      mobile,
      role,
      is_active
    FROM users
    ORDER BY
      CASE
        WHEN is_active = TRUE THEN 0
        ELSE 1
      END,
      name ASC,
      id ASC
  `);

  return rows.map(normalizeUser);
};

const getAuthorizationUser = async (userId) => {
  const id = assertUserId(userId);

  const { rows } = await pool.query(
    `
      SELECT
        id,
        name,
        email,
        mobile,
        role,
        is_active
      FROM users
      WHERE id = $1
    `,
    [id],
  );

  if (!rows.length) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return normalizeUser(rows[0]);
};

const getAllPermissions = async () => {
  const { rows } = await pool.query(`
    SELECT
      id,
      module,
      action,
      name,
      description
    FROM permissions
    ORDER BY
      module ASC,
      CASE action
        WHEN 'view' THEN 1
        WHEN 'edit' THEN 2
        WHEN 'delete' THEN 3
        WHEN 'export' THEN 4
        WHEN 'print' THEN 5
        ELSE 99
      END,
      id ASC
  `);

  return rows.map(normalizePermission);
};

const getUserPermissionIds = async (userId) => {
  const id = assertUserId(userId);

  const { rows } = await pool.query(
    `
      SELECT
        up.permission_id
      FROM user_permissions up
      INNER JOIN permissions p
        ON p.id = up.permission_id
      WHERE up.user_id = $1
      ORDER BY up.permission_id
    `,
    [id],
  );

  return rows.map((row) => Number(row.permission_id));
};

const getUserAuthorization = async (userId) => {
  const id = assertUserId(userId);

  const [user, permissions] = await Promise.all([
    getAuthorizationUser(id),
    getAllPermissions(),
  ]);

  let selectedPermissionIds = await getUserPermissionIds(id);

  if (String(user.role).toLowerCase() === "admin") {
    selectedPermissionIds = permissions.map((permission) => permission.id);
  }

  return {
    user,
    permissions,
    selectedPermissionIds,
  };
};

const validatePermissionIds = async (client, permissionIds) => {
  if (!Array.isArray(permissionIds)) {
    const error = new Error("permissionIds must be an array.");

    error.statusCode = 400;

    throw error;
  }

  const normalizedIds = [
    ...new Set(
      permissionIds.map(Number).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (normalizedIds.length !== permissionIds.length) {
    const error = new Error("One or more permission IDs are invalid.");

    error.statusCode = 400;

    throw error;
  }

  if (!normalizedIds.length) {
    return [];
  }

  const result = await client.query(
    `
      SELECT id
      FROM permissions
      WHERE id = ANY($1::bigint[])
    `,
    [normalizedIds],
  );

  const validIds = result.rows.map((row) => Number(row.id));

  const validIdSet = new Set(validIds);

  const invalidIds = normalizedIds.filter((id) => !validIdSet.has(id));

  if (invalidIds.length) {
    const error = new Error(
      `Invalid permission ID(s): ${invalidIds.join(", ")}`,
    );

    error.statusCode = 400;

    throw error;
  }

  return normalizedIds;
};

const saveUserPermissions = async (userId, permissionIds) => {
  const id = assertUserId(userId);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `
        SELECT
          id,
          name,
          role,
          is_active
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [id],
    );

    if (!userResult.rowCount) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    const validPermissionIds = await validatePermissionIds(
      client,
      permissionIds,
    );

    await client.query(
      `
        DELETE FROM user_permissions
        WHERE user_id = $1
      `,
      [id],
    );

    /*
     * Insert the new permission set.
     */
    if (validPermissionIds.length) {
      await client.query(
        `
          INSERT INTO user_permissions (
            user_id,
            permission_id
          )
          SELECT
            $1,
            permission_id
          FROM UNNEST($2::bigint[]) AS permission_id
          ON CONFLICT (user_id, permission_id)
          DO NOTHING
        `,
        [id, validPermissionIds],
      );
    }

    await client.query("COMMIT");

    return {
      userId: id,
      permissionIds: validPermissionIds,
      permissionCount: validPermissionIds.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getAuthorizationUsers,
  getAuthorizationUser,
  getAllPermissions,
  getUserPermissionIds,
  getUserAuthorization,
  saveUserPermissions,
};
