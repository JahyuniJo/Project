const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * GET /api/recommend — Gợi ý 6 truyện cho user đang đăng nhập, dựa trên lịch sử đọc.
 *
 * Cách tính:
 *   1. Lấy thể loại từ 10 lượt xem gần nhất của user → tập genre yêu thích.
 *   2. Chấm điểm mọi truyện CHƯA đọc bằng công thức trong SQL:
 *      - Có lịch sử đọc: số genre trùng (chặn trần 4) × 0.35
 *        + view_count chuẩn hóa (trần 3000) × 0.2 + rating trung bình/5 × 0.15.
 *      - User mới chưa đọc gì: rơi về công thức phổ biến chung
 *        view_count × 0.6 + rating × 0.4 (cold-start fallback).
 *   3. Trả 6 truyện điểm cao nhất, kèm avg_rating để hiển thị.
 *
 * Toàn bộ scoring làm trong 1 câu SQL (INTERSECT unnest genres) — không kéo
 * cả bảng stories về Node để tính.
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const genresRes = await pool.query(
      `SELECT s.genres FROM user_story_views v
       JOIN stories s ON v.story_id = s.id
       WHERE v.user_id = $1 LIMIT 10`,
      [userId]
    );

    const favGenres = [...new Set(genresRes.rows.flatMap((r) => r.genres))];

    const readRes = await pool.query(
      "SELECT story_id FROM user_story_views WHERE user_id = $1",
      [userId]
    );
    const readIds = readRes.rows.map((r) => r.story_id);

    const { rows } = await pool.query(
      `SELECT
        s.*,
        COALESCE(r.avg, 0)::float AS avg_rating,
        (
          CASE
            WHEN array_length($1::text[], 1) IS NULL THEN
              LEAST(s.view_count, 3000) / 3000.0 * 0.6 +
              COALESCE(r.avg, 0) / 5.0 * 0.4
            ELSE
              LEAST((
                SELECT COUNT(*) FROM (
                  SELECT unnest(s.genres) INTERSECT SELECT unnest($1::text[])
                ) g
              ), 4) * 0.35 +
              LEAST(s.view_count, 3000) / 3000.0 * 0.2 +
              COALESCE(r.avg, 0) / 5.0 * 0.15
          END
        ) AS score
      FROM stories s
      LEFT JOIN (
        SELECT story_id, AVG(rating) AS avg FROM ratings GROUP BY story_id
      ) r ON s.id = r.story_id
      WHERE ($2::int[] IS NULL OR s.id <> ALL($2::int[]))
      ORDER BY score DESC
      LIMIT 6`,
      [favGenres, readIds.length ? readIds : null]
    );

    res.json(rows);
  } catch (err) {
    console.error("[recommendRoutes] recommend:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = router;
