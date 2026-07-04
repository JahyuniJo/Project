const express = require("express");
const pool = require("../config/pool");
const { syncStories, getStories } = require("../controllers/storyController");
const authMiddleware = require("../middleware/authMiddleware");
const optionalAuth = require("../middleware/optionalAuth");
const { removeVietnameseTones } = require("../utils/normalizeText");
const { searchStoriesWithSqlFallback, indexStory, deleteStory } = require("../services/searchService");
const { crawlChapterList } = require("../crawlers/crawlChapterList");
const { getReadingRecap } = require("../services/chapterSummaryService");

const router = express.Router();
// GET /api/stories cần để trên cùng vì các route khác chứa /:id sẽ bị trùng với /search
// --> Nên đặt api động vào cuối cùng, ví dụ /api/stories/:id/chapters, /api/stories/:id/recap, /api/stories/:id/crawl-chapters, /api/stories/:id/view
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

  const page   = parseInt(req.query.page, 10) || 1;
  const limit  = parseInt(req.query.limit, 10) || 12;
  const offset = (page - 1) * limit;

  try {
    const [totalRes, result] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM stories WHERE $1 = ANY(genres)", [genre]),
      pool.query(
        "SELECT * FROM stories WHERE $1 = ANY(genres) ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        [genre, limit, offset]
      ),
    ]);

    const total = Number(totalRes.rows[0].count);
    res.json({ page, total, totalPages: Math.ceil(total / limit), stories: result.rows });
  } catch (err) {
    console.error("[storyRoutes] by-genre:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.get("/", async (req, res) => {
  const page   = parseInt(req.query.page, 10) || 1;
  const limit  = parseInt(req.query.limit, 10) || 12;
  const search = (req.query.search || req.query.q)?.trim() || null;
  const status = req.query.status?.trim() || null;

  const VALID_SORTS   = ["newest", "views", "rating", "az"];
  const VALID_LENGTHS = ["short", "medium", "long"];
  const sort   = VALID_SORTS.includes(req.query.sort)   ? req.query.sort   : "newest";
  const length = VALID_LENGTHS.includes(req.query.length) ? req.query.length : null;

  const genresRaw = req.query.genres?.trim() || null;
  const genres = genresRaw
    ? genresRaw.split(",").map(s => s.trim()).filter(Boolean)
    : null;

  try {
    const result = await searchStoriesWithSqlFallback({ search, page, limit, status, genres, sort, length });
    res.json(result);
  } catch (err) {
    console.error("[storyRoutes] list:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// GET /api/stories/status-counts — đếm số truyện theo trạng thái
router.get("/status-counts", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT status, COUNT(*) AS count FROM stories GROUP BY status"
    );
    const counts = { ongoing: 0, completed: 0, stopped: 0, total: 0 };
    result.rows.forEach((r) => {
      const s = r.status;
      if (s in counts) counts[s] = Number(r.count);
      counts.total += Number(r.count);
    });
    res.json(counts);
  } catch (err) {
    console.error("[storyRoutes] status-counts:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// GET /api/stories/crawl-all-chapters/stream — SSE: đồng bộ chương toàn bộ truyện (admin)
router.get("/crawl-all-chapters/stream", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Không đủ quyền" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const { rows: stories } = await pool.query(
      "SELECT id, title, url FROM stories WHERE url IS NOT NULL AND url <> '' ORDER BY id"
    );

    send({ type: "start", total: stories.length });

    let success = 0, failed = 0;

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      send({ type: "progress", current: i + 1, total: stories.length, title: story.title });

      try {
        const chapters = await crawlChapterList(story.url);
        if (!chapters.length) {
          failed++;
          send({ type: "item", id: story.id, status: "failed", title: story.title, message: "0 chương" });
          continue;
        }

        const client = await pool.connect();
        try {
          for (const ch of chapters) {
            await client.query(
              `INSERT INTO chapters (story_id, chapter_num, title, source_url)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (story_id, chapter_num) DO UPDATE
               SET title = EXCLUDED.title, source_url = EXCLUDED.source_url`,
              [story.id, ch.chapter_num, ch.title, ch.source_url]
            );
          }
          success++;
          send({ type: "item", id: story.id, status: "ok", title: story.title, count: chapters.length });
        } finally {
          client.release();
        }

        // Nghỉ ngắn giữa các request để tránh overload nguồn
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        failed++;
        console.error(`[storyRoutes] crawl-all id=${story.id}:`, err.message);
        send({ type: "item", id: story.id, status: "error", title: story.title, message: err.message });
      }
    }

    send({ type: "done", total: stories.length, success, failed });
  } catch (err) {
    console.error("[storyRoutes] crawl-all-chapters/stream:", err);
    send({ type: "error", message: "Lỗi server" });
  } finally {
    res.end();
  }
});

// GET /api/stories/:id/chapters — danh sách chương (không cần auth)
router.get("/:id/chapters", async (req, res) => {
  const storyId = parseInt(req.params.id);
  if (!storyId || storyId <= 0) {
    return res.status(400).json({ message: "ID truyện không hợp lệ" });
  }
  try {
    const result = await pool.query(
      "SELECT id, chapter_num, title, created_at FROM chapters WHERE story_id = $1 ORDER BY chapter_num ASC",
      [storyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[storyRoutes] chapters:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// GET /api/stories/:id/recap?chapter=N — tóm tắt nội dung các chương ĐÃ ĐỌC (1 → N), dùng AI vision cache
router.get("/:id/recap", async (req, res) => {
  const storyId = parseInt(req.params.id);
  if (!storyId || storyId <= 0) {
    return res.status(400).json({ message: "ID truyện không hợp lệ" });
  }

  const chapter = parseFloat(req.query.chapter);
  if (!chapter || chapter <= 0) {
    return res.status(400).json({ message: "Vui lòng cung cấp chapter hợp lệ" });
  }

  try {
    const recap = await getReadingRecap(storyId, chapter);
    if (!recap) {
      return res.status(404).json({ message: "Chưa có dữ liệu tóm tắt cho các chương này" });
    }
    res.json({ data: { recap } });
  } catch (err) {
    console.error("[storyRoutes] recap:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// POST /api/stories/:id/crawl-chapters — crawl danh sách chương (admin)
router.post("/:id/crawl-chapters", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Không đủ quyền" });
  }
  const storyId = parseInt(req.params.id);
  if (!storyId || storyId <= 0) {
    return res.status(400).json({ message: "ID truyện không hợp lệ" });
  }
  try {
    const storyRow = await pool.query("SELECT url FROM stories WHERE id = $1", [storyId]);
    if (!storyRow.rows.length) return res.status(404).json({ message: "Không tìm thấy truyện" });
    const storyUrl = storyRow.rows[0].url;
    if (!storyUrl) return res.status(400).json({ message: "Truyện không có URL nguồn" });

    const chapters = await crawlChapterList(storyUrl);
    if (!chapters.length) return res.status(404).json({ message: "Không tìm thấy chương nào" });

    const client = await pool.connect();
    let inserted = 0;
    try {
      for (const ch of chapters) {
        await client.query(
          `INSERT INTO chapters (story_id, chapter_num, title, source_url)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (story_id, chapter_num) DO UPDATE
           SET title = EXCLUDED.title, source_url = EXCLUDED.source_url`,
          [storyId, ch.chapter_num, ch.title, ch.source_url]
        );
        inserted++;
      }
    } finally {
      client.release();
    }

    res.json({ message: `Đã đồng bộ ${inserted} chương`, total: inserted });
  } catch (err) {
    console.error("[storyRoutes] crawl-chapters:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.get("/:id", optionalAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "ID truyện không hợp lệ" });
  }

  try {
    const result = await pool.query(
      "UPDATE stories SET view_count = view_count + 1 WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Không tìm thấy truyện" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[storyRoutes] get by id:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Không đủ quyền" });
  }

  const id = parseInt(req.params.id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "ID truyện không hợp lệ" });
  }

  const { title, author, cover_url, url, description } = req.body;
  if (!title || !url) {
    return res.status(400).json({ message: "Tiêu đề và URL không được để trống" });
  }

  const status = normalizeStoryStatus(req.body.status);
  const genres = Array.isArray(req.body.genres)
    ? req.body.genres.filter(Boolean)
    : req.body.genres?.split(",").map((g) => g.trim()).filter(Boolean) || null;

  try {
    const result = await pool.query(
      "UPDATE stories SET title=$1, author=$2, cover_url=$3, status=$4, url=$5, description=$6, genres=$7 WHERE id=$8 RETURNING *",
      [title, author, cover_url, status, url, description || null, genres, id]
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
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Không đủ quyền" });
  }

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
    res.json({ message: "Ghi nhận lượt xem thành công" });
  } catch (err) {
    console.error("[storyRoutes] view:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

function normalizeStoryStatus(status) {
  const raw = removeVietnameseTones(String(status || "").trim()).toLowerCase();
  if (!raw) return "ongoing";
  if (["ongoing", "completed", "stopped"].includes(raw)) return raw;
  if (raw.includes("hoan") || raw.includes("complete")) return "completed";
  if (raw.includes("tam ngung") || raw.includes("ngung") || raw === "dropped") return "stopped";
  return "ongoing";
}

module.exports = router;
