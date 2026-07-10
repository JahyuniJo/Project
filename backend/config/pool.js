/**
 * config/pool.js — Connection pool PostgreSQL (pg) dùng chung toàn app.
 *
 * Đây là module DUY NHẤT để chạy SQL query trực tiếp trong routes/services
 * (`pool.query(...)`); còn `config/db.js` (Sequelize) chỉ dành cho định nghĩa model ORM.
 *
 * Cấu hình đọc từ `.env` ở thư mục gốc dự án:
 *   - max 20 connection (override qua DB_POOL_MAX) — giới hạn theo khả năng DB server.
 *   - connectionTimeoutMillis 5s: chờ mượn connection tối đa 5s rồi báo lỗi thay vì treo.
 *   - idleTimeoutMillis 30s: connection rảnh quá 30s sẽ bị đóng trả tài nguyên.
 */
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
