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
