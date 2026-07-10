const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/requireAdmin");

/**
 * GET /api/stat — Thống kê tổng quan cho dashboard admin (Admin only).
 *
 * 11 query COUNT/SUM chạy song song bằng Promise.all: tổng user, truyện, lượt xem,
 * chương, truyện có chương, comment, báo lỗi pending, phân bố trạng thái truyện,
 * lượt xem 7 ngày theo ngày (múi giờ Asia/Ho_Chi_Minh để cột ngày khớp giờ VN),
 * tổng tin chat, và số truyện đã có ai_summary.
 */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [
      userCount, storyCount, totalViews,
      chapterCount, storiesWithChapters,
      commentCount, pendingReports,
      storyStatusBreakdown, weeklyViews,
      chatMessages, storiesWithSummary,
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
      pool.query("SELECT COUNT(*) AS total FROM chat_messages"),
      pool.query("SELECT COUNT(*) AS total FROM stories WHERE ai_summary IS NOT NULL AND ai_summary <> ''"),
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
      totalChatMessages:   parseInt(chatMessages.rows[0].total),
      storiesWithSummary:  parseInt(storiesWithSummary.rows[0].total),
    });
  } catch (err) {
    console.error("[statRoutes] overview:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

/**
 * GET /api/stat/popular-week — Top 6 truyện được xem nhiều nhất 7 ngày qua (public).
 * Đếm theo `user_story_views` (lượt xem có đăng nhập) — dùng cho khối
 * "Truyện hot tuần" ở trang chủ.
 */
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
