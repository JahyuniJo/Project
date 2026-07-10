const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");

const VALID_RATINGS = [1, 2, 3, 4, 5];

/**
 * GET /api/rating?story_id=N — Điểm đánh giá trung bình + tổng lượt đánh giá
 * của 1 truyện (public, không cần đăng nhập).
 * AVG được COALESCE về 0 khi chưa ai đánh giá và làm tròn 1 chữ số thập phân.
 */
router.get("/", async (req, res) => {
  const story_id = parseInt(req.query.story_id);
  if (!story_id || story_id <= 0) {
    return res.status(400).json({ message: "Vui lòng cung cấp story_id hợp lệ" });
  }

  try {
    const result = await pool.query(
      `SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*) AS total
       FROM ratings WHERE story_id = $1`,
      [story_id]
    );

    res.json({
      avg: Number(Number(result.rows[0].avg_rating).toFixed(1)),
      total: Number(result.rows[0].total),
    });
  } catch (err) {
    console.error("[ratingRoutes] get:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

/**
 * POST /api/rating — User đánh giá truyện (1-5 sao), cần đăng nhập.
 *
 * Upsert bằng ON CONFLICT trên UNIQUE(story_id, user_id): mỗi user chỉ có
 * 1 rating/truyện — đánh giá lại sẽ GHI ĐÈ điểm cũ thay vì tạo dòng mới.
 * Validate: story_id > 0, rating phải là số nguyên thuộc {1..5}.
 */
router.post("/", authMiddleware, async (req, res) => {
  const story_id = parseInt(req.body.story_id);
  const rating = parseInt(req.body.rating);

  if (!story_id || story_id <= 0) {
    return res.status(400).json({ message: "Vui lòng cung cấp story_id hợp lệ" });
  }
  if (!VALID_RATINGS.includes(rating)) {
    return res.status(400).json({ message: "Điểm đánh giá phải từ 1 đến 5" });
  }

  try {
    await pool.query(
      `INSERT INTO ratings (story_id, user_id, rating)
       VALUES ($1, $2, $3)
       ON CONFLICT (story_id, user_id) DO UPDATE SET rating = EXCLUDED.rating`,
      [story_id, req.user.userId, rating]
    );

    res.json({ message: "Đánh giá thành công" });
  } catch (err) {
    console.error("[ratingRoutes] post:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = router;
