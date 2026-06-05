const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/requireAdmin");

// Thống kê tổng quan (admin)
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [
      userCount, storyCount, totalViews,
      chapterCount, storiesWithChapters,
      commentCount, pendingReports,
      storyStatusBreakdown, weeklyViews,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM users"),
      pool.query("SELECT COUNT(*) AS total FROM stories"),
      pool.query("SELECT COALESCE(SUM(view_count), 0) AS total FROM stories"),
      pool.query("SELECT COUNT(*) AS total FROM chapters"),
      pool.query("SELECT COUNT(DISTINCT story_id) AS total FROM chapters"),
      pool.query("SELECT COUNT(*) AS total FROM comments"),
      pool.query("SELECT COUNT(*) AS total FROM reports WHERE status = 'pending'"),
      pool.query("SELECT status, COUNT(*) AS count FROM stories GROUP BY status ORDER BY count DESC"),
      pool.query(`
        SELECT TO_CHAR(DATE(viewed_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'DD/MM') AS day,
               COUNT(*) AS views
        FROM user_story_views
        WHERE viewed_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(viewed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
        ORDER BY DATE(viewed_at AT TIME ZONE 'Asia/Ho_Chi_Minh') ASC
      `),
    ]);

    res.json({
      totalUsers:          parseInt(userCount.rows[0].total),
      totalStories:        parseInt(storyCount.rows[0].total),
      totalViews:          parseInt(totalViews.rows[0].total),
      totalChapters:       parseInt(chapterCount.rows[0].total),
      storiesWithChapters: parseInt(storiesWithChapters.rows[0].total),
      totalComments:       parseInt(commentCount.rows[0].total),
      pendingReports:      parseInt(pendingReports.rows[0].total),
      storyStatusBreakdown: storyStatusBreakdown.rows,
      weeklyViews:          weeklyViews.rows,
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
