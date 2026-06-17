const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: Number(process.env.DB_PORT) || 5432,
  max: Number(process.env.DB_POOL_MAX) || 20,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

// Ngăn crash process khi idle client gặp lỗi bất ngờ (DB restart, network drop)
pool.on("error", (err) => {
  console.error("[pool] Lỗi idle client:", err.message);
});

module.exports = pool;
