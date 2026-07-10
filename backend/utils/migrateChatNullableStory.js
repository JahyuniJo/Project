/**
 * Migration script (chạy 1 lần) — mở đường cho chatbot LIBRARY MODE:
 *   - Nới `chat_messages.story_id` thành nullable — tin nhắn không gắn với
 *     truyện nào (chat thư viện) lưu story_id = NULL.
 *   - Tạo partial index (user_id, created_at DESC) WHERE story_id IS NULL —
 *     tối ưu riêng cho query lịch sử library mode, nhỏ hơn nhiều so với
 *     index toàn bảng.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const pool = require("../config/pool");

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE chat_messages
        ALTER COLUMN story_id DROP NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_chat_messages_user_library
        ON chat_messages(user_id, created_at DESC)
        WHERE story_id IS NULL;
    `);
    console.log("[migrate] story_id nullable + index library mode: OK");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("[migrate]", err.message);
  process.exit(1);
});
