const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
  }
  next();
}

// Thống kê tổng quan (admin)
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [userCount, storyCount, totalViews] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM users"),
      pool.query("SELECT COUNT(*) AS total FROM stories"),
      pool.query("SELECT COALESCE(SUM(view_count), 0) AS total FROM stories"),
    ]);

    res.json({
      totalUsers: parseInt(userCount.rows[0].total),
      totalStories: parseInt(storyCount.rows[0].total),
      totalViews: parseInt(totalViews.rows[0].total),
    });
  } catch (err) {
    console.error("[statRoutes] overview:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Truyện hot trong tuần (công khai)
router.get("/popular-week", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.title, s.author, s.cover_url, COUNT(usv.id) AS view_count
      FROM user_story_views usv
      JOIN stories s ON s.id = usv.story_id
      WHERE usv.viewed_at >= NOW() - INTERVAL '7 days'
      GROUP BY s.id
      ORDER BY view_count DESC
      LIMIT 6
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("[statRoutes] popular-week:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = router;
