// backend/config/db.js
const path = require('path');
const { Sequelize } = require('sequelize');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const sequelize = new Sequelize(
  process.env.DB_NAME,       // tên database
  process.env.DB_USER,       // user
  process.env.DB_PASS,   // password
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'postgres',
    logging: false,
  }
);

sequelize.authenticate()
  .then(() => console.log('✅ Đã kết nối với PostgreSQL'))
  .catch(err => console.error('❌ Kết nối không thành công với PostgreSQL', err));

module.exports = sequelize;
