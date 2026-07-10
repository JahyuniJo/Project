/**
 * config/db.js — Kết nối Sequelize ORM tới PostgreSQL.
 *
 * CHỈ dùng cho các model ORM (vd: models/Story.js) — KHÔNG dùng để query trực tiếp;
 * mọi SQL thuần phải đi qua `config/pool.js`. `logging: false` để tắt log SQL của
 * Sequelize khỏi console. Khi module load sẽ `authenticate()` một lần để báo sớm
 * nếu cấu hình DB sai.
 */
const path = require("path");
const { Sequelize } = require("sequelize");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST || "localhost",
    dialect: "postgres",
    logging: false,
  }
);

sequelize
  .authenticate()
  .then(() => console.log("✅ Đã kết nối PostgreSQL"))
  .catch((err) => console.error("[db] Kết nối PostgreSQL thất bại:", err));

module.exports = sequelize;
