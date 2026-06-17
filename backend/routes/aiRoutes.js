const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const { callAI } = require("../services/aiService");
const { indexStory } = require("../services/searchService");

// Ngăn nhiều request đồng thời gọi AI cho cùng 1 story
const _pendingSummarize = new Set();

router.post("/summarize", async (req, res) => {
  const { story_id } = req.body;

  const id = parseInt(story_id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "Vui lòng cung cấp story_id hợp lệ" });
  }

  if (_pendingSummarize.has(id)) {
    return res.status(429).json({ message: "Đang xử lý tóm tắt, vui lòng thử lại sau" });
  }

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

    if (!story.description) {
      return res.status(400).json({ message: "Truyện chưa có mô tả để tóm tắt" });
    }

    _pendingSummarize.add(id);
    try {
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

      const summary = await callAI(prompt);

      const updated = await pool.query(
        "UPDATE stories SET ai_summary = $1 WHERE id = $2 RETURNING *",
        [summary, id]
      );

      // Cập nhật ES để hybrid search có ai_summary mới nhất
      indexStory(updated.rows[0]).catch(() => {});

      res.json({ summary });
    } finally {
      _pendingSummarize.delete(id);
    }
  } catch (err) {
    console.error("[aiRoutes] summarize:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = router;
