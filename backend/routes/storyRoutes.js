const express = require("express");
const pool = require("../config/pool");
const { syncStories, getStories } = require("../controllers/storyController");
const authMiddleware = require("../middleware/authMiddleware");
const { removeVietnameseTones } = require("../utils/normalizeText");
const { searchStoriesWithSqlFallback, indexStory, deleteStory } = require("../services/searchService");

const router = express.Router();

router.get("/search", getStories);
router.post("/sync", authMiddleware, syncStories);

router.get("/genres", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT DISTINCT UNNEST(genres) AS genre FROM stories WHERE genres IS NOT NULL ORDER BY genre"
    );
    res.json(result.rows.map(r => r.genre).filter(Boolean));
  } catch (err) {
    console.error("[storyRoutes] genres:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.get("/top-rated", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const offset = (page - 1) * limit;
  try {
    const totalRes = await pool.query("SELECT COUNT(*) FROM stories");
    const total = Number(totalRes.rows[0].count);
    const result = await pool.query(
      `SELECT s.*, COALESCE(AVG(r.rating), 0) AS avg_rating
       FROM stories s
       LEFT JOIN ratings r ON r.story_id = s.id
       GROUP BY s.id
       ORDER BY avg_rating DESC, s.view_count DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ page, total, totalPages: Math.ceil(total / limit), stories: result.rows });
  } catch (err) {
    console.error("[storyRoutes] top-rated:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.get("/newest", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const offset = (page - 1) * limit;
  try {
    const totalRes = await pool.query("SELECT COUNT(*) FROM stories");
    const total = Number(totalRes.rows[0].count);
    const result = await pool.query(
      "SELECT * FROM stories ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    res.json({ page, total, totalPages: Math.ceil(total / limit), stories: result.rows });
  } catch (err) {
    console.error("[storyRoutes] newest:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.get("/by-genre", async (req, res) => {
  const { genre } = req.query;
  if (!genre) {
    return res.status(400).json({ message: "Thiếu thể loại" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM stories WHERE $1 = ANY(genres) ORDER BY created_at DESC",
      [genre]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[storyRoutes] by-genre:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.get("/", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const search = req.query.search?.trim();

  try {
    const result = await searchStoriesWithSqlFallback({ search, page, limit });
    res.json(result);
  } catch (err) {
    console.error("[storyRoutes] list:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "ID truyện không hợp lệ" });
  }

  try {
    await pool.query("UPDATE stories SET view_count = view_count + 1 WHERE id = $1", [id]);
    const result = await pool.query("SELECT * FROM stories WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy truyện" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[storyRoutes] get by id:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "ID truyện không hợp lệ" });
  }

  const { title, author, cover_url, url } = req.body;
  if (!title || !url) {
    return res.status(400).json({ message: "Tiêu đề và URL không được để trống" });
  }

  const status = normalizeStoryStatus(req.body.status);

  try {
    const result = await pool.query(
      "UPDATE stories SET title=$1, author=$2, cover_url=$3, status=$4, url=$5 WHERE id=$6 RETURNING *",
      [title, author, cover_url, status, url, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Không tìm thấy truyện" });
    }

    await indexStory(result.rows[0]);
    res.json({ message: "Cập nhật truyện thành công" });
  } catch (err) {
    console.error("[storyRoutes] update:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "ID truyện không hợp lệ" });
  }

  try {
    const result = await pool.query("DELETE FROM stories WHERE id = $1 RETURNING id", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Không tìm thấy truyện" });
    }

    await deleteStory(id);
    res.json({ message: "Xóa truyện thành công" });
  } catch (err) {
    console.error("[storyRoutes] delete:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.post("/:id/view", authMiddleware, async (req, res) => {
  const storyId = parseInt(req.params.id);
  if (!storyId || storyId <= 0) {
    return res.status(400).json({ message: "ID truyện không hợp lệ" });
  }

  try {
    await pool.query(
      "INSERT INTO user_story_views (user_id, story_id) VALUES ($1, $2)",
      [req.user.userId, storyId]
    );
    await pool.query(
      "UPDATE stories SET view_count = view_count + 1 WHERE id = $1",
      [storyId]
    );
    res.json({ message: "Ghi nhận lượt xem thành công" });
  } catch (err) {
    console.error("[storyRoutes] view:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

function normalizeStoryStatus(status) {
  const raw = removeVietnameseTones(String(status || "").trim()).toLowerCase();
  if (!raw) return "ongoing";
  if (["ongoing", "completed", "stopped", "dropped"].includes(raw)) return raw;
  if (raw.includes("hoan") || raw.includes("complete")) return "completed";
  if (raw.includes("tam ngung") || raw.includes("ngung")) return "stopped";
  return "ongoing";
}

module.exports = router;
