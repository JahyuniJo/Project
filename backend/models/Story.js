const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/**
 * models/Story.js — Sequelize model của bảng `stories`, dùng chủ yếu bởi crawler
 * (findOrCreate/upsert khi thu thập truyện). Chỉ khai báo các cột crawler cần ghi;
 * schema đầy đủ của bảng (genres, view_count, ai_summary...) nằm trong migration SQL.
 * Các route/service khác query bảng này trực tiếp qua config/pool.js, không qua model.
 */
const Story = sequelize.define('Story', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  author: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: 'stories',
  timestamps: true, // có cột createdAt, updatedAt
});

module.exports = Story;
