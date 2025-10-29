const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Kết nối PostgreSQL

// 📊 API thống kê
router.get('/', async (req, res) => {
  try {
    // Đếm tổng người dùng
    const userCount = await pool.query('SELECT COUNT(*) AS total_users FROM users');
    // Đếm tổng truyện
    const storyCount = await pool.query('SELECT COUNT(*) AS total_stories FROM stories');
    // Tổng lượt đọc
    const totalViews = await pool.query('SELECT COALESCE(SUM(view_count), 0) AS total_views FROM stories');

    res.json({
      totalUsers: parseInt(userCount.rows[0].total_users),
      totalStories: parseInt(storyCount.rows[0].total_stories),
      totalViews: parseInt(totalViews.rows[0].total_views)
    });
  } catch (err) {
    console.error('❌ Lỗi thống kê:', err);
    res.status(500).json({ error: 'Lỗi thống kê' });
  }
});

module.exports = router;
