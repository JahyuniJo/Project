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
