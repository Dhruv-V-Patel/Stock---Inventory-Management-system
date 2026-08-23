require("dotenv").config();

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const createDatabaseIfNotExists = async () => {
  if (!process.env.DB_NAME) {
    throw new Error("DB_NAME is required. Configure it in .env before running db:setup.");
  }

  const adminPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "postgres",
  });

  try {
    const { rows } = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [process.env.DB_NAME],
    );

    if (rows.length > 0) {
      console.log("✅ Database already exists.");
      return;
    }

    console.log(` Creating database "${process.env.DB_NAME}"...`);

    const databaseIdentifier = process.env.DB_NAME.replace(/"/g, '""');

    await adminPool.query(`CREATE DATABASE "${databaseIdentifier}"`);

    console.log("✅ Database created.");

  } finally {
    await adminPool.end();
  }
};

const initializeDatabase = async () => {
  await createDatabaseIfNotExists();

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    const schemaPath = path.resolve(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await pool.query(schema);
    console.log("Schema executed successfully, including the default administrator account.");
    console.log('---------------------------------------------');
    console.log('Default Login Username and Password');
    console.log('Username: admin@example.com');
    console.log('Password: admin123');
    console.log('---------------------------------------------');
    console.log("Change this password immediately after the first login.");

  } finally {
    await pool.end();
  }
};

initializeDatabase()
  .then(() => {
    console.log("Database setup completed.");
  })
  .catch((error) => {
    console.error("Database setup failed.");
    console.error(error);
    process.exitCode = 1;
  });