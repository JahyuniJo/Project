/**
 * Migration script (chạy 1 lần) — thêm cột `metadata` JSONB vào `chat_messages`:
 * lưu dữ liệu phụ của tin nhắn assistant, hiện dùng cho `{ story_ids: [...] }`
 * (các truyện chatbot đã gợi ý) để GET /api/chat/history render lại card truyện.
 * Idempotent nhờ ADD COLUMN IF NOT EXISTS.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: parseInt(process.env.DB_PORT) || 5432,
});

(async () => {
  try {
    await pool.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
    `);
    console.log("✅ Đã thêm cột metadata vào chat_messages");
  } catch (err) {
    console.error("❌ Lỗi:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
