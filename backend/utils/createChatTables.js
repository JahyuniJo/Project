/**
 * Migration script (chạy 1 lần: `node backend/utils/createChatTables.js`) —
 * tạo bảng `chat_messages` lưu lịch sử chatbot + composite index
 * (user_id, story_id, created_at DESC) phục vụ query "N tin gần nhất của user
 * trong 1 truyện". Idempotent nhờ IF NOT EXISTS — chạy lại không gây lỗi.
 *
 * Lưu ý: story_id NOT NULL ở đây là schema ban đầu; migration
 * `migrateChatNullableStory.js` sau này đã nới thành nullable cho library mode.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const pool = require("../config/pool");

async function createChatTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        story_id   INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        role       VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
        content    TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_user_story
        ON chat_messages(user_id, story_id, created_at DESC);
    `);
    console.log("[createChatTables] Bảng chat_messages và index đã sẵn sàng.");
  } finally {
    client.release();
    await pool.end();
  }
}

createChatTables().catch((err) => {
  console.error("[createChatTables]", err);
  process.exit(1);
});
