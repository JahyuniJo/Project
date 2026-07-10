const { execFile } = require("child_process");
const path = require("path");
const { suggestStories, syncStoriesFromSql } = require("../services/searchService");

/**
 * POST /api/stories/sync — Kích hoạt crawl toàn bộ truyện rồi đồng bộ sang Elasticsearch.
 *
 * Luồng xử lý:
 *   1. Chạy script `crawlers/crawlALL.js` trong một tiến trình Node con (execFile) —
 *      cách ly khỏi tiến trình server để crawler crash không kéo sập app,
 *      timeout 5 phút để tránh treo vô hạn.
 *   2. Crawl xong → gọi `syncStoriesFromSql()` đẩy dữ liệu PostgreSQL lên Elasticsearch.
 *
 * Response:
 *   - 200: crawl + sync đều thành công, trả về kết quả sync ES.
 *   - 207 (Multi-Status): crawl thành công nhưng sync ES thất bại — dữ liệu đã vào
 *     PostgreSQL, chỉ chỉ mục tìm kiếm là chưa cập nhật.
 *   - 500: crawl thất bại (lỗi tiến trình con hoặc quá timeout).
 */
const syncStories = (req, res) => {
  const crawlerPath = path.join(__dirname, "../crawlers/crawlALL.js");

  execFile(process.execPath, [crawlerPath], { timeout: 5 * 60 * 1000 }, async (error, stdout, stderr) => {
    if (error) {
      console.error("[storyController] crawl error:", error.message);
      return res.status(500).json({ message: "Crawl thất bại, vui lòng thử lại" });
    }

    if (stderr) console.error("[storyController] crawler stderr:", stderr);

    try {
      const syncResult = await syncStoriesFromSql();
      res.json({ message: "Đồng bộ truyện thành công", data: { elasticsearch: syncResult } });
    } catch (syncError) {
      console.error("[storyController] sync elasticsearch:", syncError);
      res.status(207).json({
        message: "Crawl thành công nhưng đồng bộ Elasticsearch thất bại",
        data: null,
      });
    }
  });
};

/**
 * GET /api/stories/search?q=... — Autocomplete gợi ý truyện khi người dùng gõ ô tìm kiếm.
 *
 * - Query rỗng/chỉ khoảng trắng → trả về mảng rỗng ngay, không chạm DB.
 * - Ủy quyền cho `suggestStories()` (searchService): ưu tiên Elasticsearch
 *   (match_phrase_prefix + bool_prefix), tự fallback sang SQL ILIKE khi ES down.
 *
 * Response: 200 với mảng truyện gợi ý `[{ id, title, author, genres, cover_url }]`.
 */
const getStories = async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.json([]);

  try {
    const suggestions = await suggestStories(q);
    res.json(suggestions);
  } catch (err) {
    console.error("[storyController] suggest:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
};

module.exports = { syncStories, getStories };
