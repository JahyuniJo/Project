const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { callAI } = require("../services/aiService");

router.post("/summarize", async (req, res) => {
  const { story_id } = req.body;
  // 1. Lấy truyện
  const result = await pool.query(
    "SELECT title, author, description, ai_summary FROM stories WHERE id = $1",
    [story_id]
  );
  const story = result.rows[0];
  // 3. Chuẩn bị prompt
  const prompt = `
Bạn hãy tóm tắt truyện dựa trên thông tin dưới đây.

Tên truyện: ${story.title}
Tác giả: ${story.author}

Nội dung:
${story.description}
YÊU CẦU BẮT BUỘC:
- Viết bằng tiếng Việt
- Độ dài 3–5 câu
- Văn phong trung tính, dễ đọc
- KHÔNG tiết lộ các tình tiết quan trọng
- KHÔNG spoil cao trào hoặc kết thúc
- KHÔNG hỏi ngược lại người dùng
- Chỉ sử dụng thông tin đã cung cấp
`;

  // 4. Gọi AI
  const summary = await callAI(prompt);

  // 5. Lưu DB
  await pool.query(
    "UPDATE stories SET ai_summary = $1 WHERE id = $2",
    [summary, story_id]
  );

  res.json({ summary });
});
module.exports = router;