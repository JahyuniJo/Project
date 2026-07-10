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
// GET /api/stories/search — autocomplete (storyController.getStories)
router.get("/search", getStories);
// POST /api/stories/sync — crawl toàn bộ + sync ES (storyController.syncStories)
router.post("/sync", authMiddleware, syncStories);

/**
 * GET /api/stories/genres — Danh sách tất cả thể loại distinct trong hệ thống
 * (unnest mảng genres), sắp theo alphabet — dùng đổ dropdown lọc thể loại.
 */
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

/**
 * GET /api/stories/top-rated — Truyện xếp theo rating trung bình giảm dần
 * (đồng hạng thì so view_count), phân trang — dùng cho tab "Đánh giá cao".
 */
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

/**
 * GET /api/stories/newest — Truyện mới thêm gần nhất (created_at DESC), phân trang.
 */
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

/**
 * GET /api/stories/by-genre?genre=X — Lọc truyện chứa đúng 1 thể loại
 * (`$1 = ANY(genres)`), mới nhất trước, phân trang. COUNT + data chạy song song.
 */
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

/**
 * GET /api/stories — Endpoint danh sách/tìm kiếm chính của trang Đọc truyện.
 *
 * Nhận đủ bộ filter: search (hoặc q), status, genres (chuỗi "a,b,c" → mảng),
 * sort (newest/views/rating/az) và length (short/medium/long) — giá trị lạ bị
 * đưa về mặc định thay vì báo lỗi. Toàn bộ logic chọn engine (Elasticsearch
 * hay SQL) ủy quyền cho searchStoriesWithSqlFallback (searchService).
 */
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

/**
 * GET /api/stories/status-counts — Đếm truyện theo trạng thái
 * (ongoing/completed/stopped + total) cho các tab lọc trên UI.
 * Status lạ ngoài 3 giá trị chuẩn chỉ được cộng vào total.
 */
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

/**
 * GET /api/stories/crawl-all-chapters/stream — Đồng bộ danh sách chương của
 * TOÀN BỘ truyện, stream tiến độ realtime bằng Server-Sent Events (Admin only).
 *
 * Vì crawl hàng trăm truyện mất nhiều phút, response giữ mở và đẩy từng event:
 *   { type: "start", total } → { type: "progress" }/{ type: "item", status: ok|failed|error }
 *   cho mỗi truyện → { type: "done", success, failed } khi xong.
 * Chương được upsert (ON CONFLICT DO UPDATE) nên chạy lại an toàn; nghỉ 400ms
 * giữa các truyện để không dội request làm nguồn chặn IP.
 */
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

/**
 * GET /api/stories/:id/chapters — Danh sách chương của 1 truyện (public),
 * sắp theo chapter_num tăng dần — đổ vào dropdown chọn chương ở trang đọc.
 */
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

/**
 * GET /api/stories/:id/recap?chapter=N — Tóm tắt nội dung các chương ĐÃ ĐỌC (1 → N).
 * Ủy quyền cho getReadingRecap (chapterSummaryService): gộp các bản tóm tắt vision
 * đã cache trong `chapter_summaries`, có cache in-memory 10 phút. Truyện chưa được
 * tóm tắt chương nào trong khoảng đó → 404.
 */
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

/**
 * POST /api/stories/:id/crawl-chapters — Crawl danh sách chương cho MỘT truyện
 * (Admin only) — bản đơn lẻ của crawl-all-chapters/stream, trả JSON thường.
 * Lấy URL nguồn từ DB → crawlChapterList() → upsert từng chương
 * (ON CONFLICT (story_id, chapter_num) DO UPDATE — crawl lại để cập nhật title/url).
 */
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

/**
 * GET /api/stories/:id — Chi tiết 1 truyện (public), đồng thời tăng view_count.
 * Gộp tăng view + lấy dữ liệu vào 1 câu UPDATE ... RETURNING * thay vì 2 query.
 * Route param động nên phải khai báo SAU các route path tĩnh (/search, /genres...).
 */
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

/**
 * PUT /api/stories/:id — Admin sửa thông tin truyện.
 * genres nhận cả mảng lẫn chuỗi "a, b, c"; status được chuẩn hóa qua
 * normalizeStoryStatus. Sau khi UPDATE thành công phải indexStory() để
 * Elasticsearch khớp với DB (quy tắc sync sau mọi CREATE/UPDATE/DELETE).
 */
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

/**
 * DELETE /api/stories/:id — Admin xóa truyện. Chương/ảnh/comment/rating liên quan
 * tự dọn nhờ FK ON DELETE CASCADE; document trên Elasticsearch xóa qua deleteStory().
 */
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

/**
 * POST /api/stories/:id/view — Ghi 1 dòng lịch sử xem của user (bảng
 * user_story_views). Dữ liệu này nuôi tính năng gợi ý truyện, thống kê
 * popular-week và recap tiến độ đọc. Khác với view_count (đếm ẩn danh ở GET /:id).
 */
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

/**
 * Chuẩn hóa trạng thái truyện tự do (tiếng Việt có dấu, tiếng Anh, viết hoa thường...)
 * về 1 trong 3 giá trị chuẩn của DB: "ongoing" | "completed" | "stopped".
 * So khớp trên bản đã bỏ dấu ("Hoàn thành" → "hoan thanh" → completed);
 * không nhận diện được → mặc định "ongoing".
 * @param {string|undefined} status - Giá trị thô từ form admin hoặc crawler.
 * @returns {string} Trạng thái chuẩn.
 */
function normalizeStoryStatus(status) {
  const raw = removeVietnameseTones(String(status || "").trim()).toLowerCase();
  if (!raw) return "ongoing";
  if (["ongoing", "completed", "stopped"].includes(raw)) return raw;
  if (raw.includes("hoan") || raw.includes("complete")) return "completed";
  if (raw.includes("tam ngung") || raw.includes("ngung") || raw === "dropped") return "stopped";
  return "ongoing";
}

module.exports = router;
