const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const { callAI } = require("../services/aiService");

router.post("/summarize", async (req, res) => {
  const { story_id } = req.body;

  if (!story_id || isNaN(parseInt(story_id))) {
    return res.status(400).json({ message: "Vui lòng cung cấp story_id hợp lệ" });
  }

  try {
    const result = await pool.query(
      "SELECT title, author, description, ai_summary FROM stories WHERE id = $1",
      [story_id]
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

    await pool.query("UPDATE stories SET ai_summary = $1 WHERE id = $2", [summary, story_id]);

    res.json({ summary });
  } catch (err) {
    console.error("[aiRoutes] summarize:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = router;
