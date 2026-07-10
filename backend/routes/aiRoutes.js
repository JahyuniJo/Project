const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const { callAI } = require("../services/aiService");
const { aggregateIntroSummary } = require("../services/chapterSummaryService");
const { indexStory } = require("../services/searchService");

// Ngăn nhiều request đồng thời gọi AI cho cùng 1 story
const _pendingSummarize = new Set();

/**
 * POST /api/ai/summarize { story_id } — Tóm tắt giới thiệu truyện bằng AI, có cache.
 *
 * Thứ tự ưu tiên nguồn tóm tắt:
 *   1. `stories.ai_summary` đã có trong DB → trả ngay, KHÔNG gọi AI (cache vĩnh viễn).
 *   2. `aggregateIntroSummary()` — gộp tóm tắt vài chương đầu từ `chapter_summaries`
 *      (dữ liệu vision đọc ảnh thật) → chính xác hơn description crawl được.
 *   3. Fallback: gọi callAI() tóm tắt từ `description` với prompt chống spoil;
 *      truyện không có cả description → 400.
 *
 * Kết quả được lưu lại vào `ai_summary` + re-index lên Elasticsearch (best-effort).
 * Set `_pendingSummarize` chống race: 2 request F5 đồng thời cho cùng truyện —
 * request sau nhận 429 thay vì đốt trùng token AI (add đồng bộ TRƯỚC mọi await).
 */
router.post("/summarize", async (req, res) => {
  const { story_id } = req.body;

  const id = parseInt(story_id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "Vui lòng cung cấp story_id hợp lệ" });
  }

  // Đăng ký pending NGAY (đồng bộ) trước mọi await — nếu add sau await thì hai request F5 đồng thời
  // đều vượt qua check, cùng SELECT và cùng gọi AI, đốt trùng token.
  if (_pendingSummarize.has(id)) {
    return res.status(429).json({ message: "Đang xử lý tóm tắt, vui lòng thử lại sau" });
  }
  _pendingSummarize.add(id);

  try {
    const result = await pool.query(
      "SELECT id, title, author, description, genres, ai_summary FROM stories WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy truyện" });
    }

    const story = result.rows[0];

    if (story.ai_summary) {
      return res.json({ summary: story.ai_summary });
    }

    // Ưu tiên tóm tắt từ nội dung ảnh chapter thật (vision) — chính xác hơn description crawl được
    let summary = await aggregateIntroSummary(id);

    if (!summary) {
      if (!story.description) {
        return res.status(400).json({ message: "Truyện chưa có mô tả để tóm tắt" });
      }

      const prompt = `
Bạn hãy tóm tắt truyện dựa trên thông tin dưới đây.

Tên truyện: ${story.title}
Tác giả: ${story.author || "Không rõ"}

Nội dung:
${story.description}

YÊU CẦU BẮT BUỘC:
- Viết bằng tiếng Việt
- Độ dài 3–5 câu
- Văn phong trung tính, dễ đọc
- KHÔNG tiết lộ các tình tiết quan trọng
- KHÔNG spoil cao trào hoặc kết thúc
- Chỉ sử dụng thông tin đã cung cấp
`;

      summary = await callAI(prompt);
    }

    const updated = await pool.query(
      "UPDATE stories SET ai_summary = $1 WHERE id = $2 RETURNING *",
      [summary, id]
    );

    // Cập nhật ES để hybrid search có ai_summary mới nhất
    indexStory(updated.rows[0]).catch(() => {});

    res.json({ summary });
  } catch (err) {
    console.error("[aiRoutes] summarize:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  } finally {
    _pendingSummarize.delete(id);
  }
});

module.exports = router;
