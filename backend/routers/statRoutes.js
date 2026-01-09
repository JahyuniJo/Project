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


// GET /api/stat/popular-week
router.get("/popular-week", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
          s.id,
          s.title,
          s.author,
          s.cover_url,
          COUNT(usv.id) AS view_count
      FROM user_story_views usv
      JOIN stories s ON s.id = usv.story_id
      WHERE usv.viewed_at >= NOW() - INTERVAL '7 days'
      GROUP BY s.id
      ORDER BY view_count DESC
      LIMIT 6
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ popular-week error:", err);
    res.status(500).json({ message: "Lỗi lấy truyện hot tuần" });
  }
});

module.exports = router;
