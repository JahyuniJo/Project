const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const pool = require("../config/pool");

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS chapters (
        id          SERIAL PRIMARY KEY,
        story_id    INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        chapter_num FLOAT NOT NULL,
        title       TEXT,
        source_url  TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(story_id, chapter_num)
      )
    `);
    console.log("✅ Bảng chapters OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS chapter_contents (
        chapter_id  INTEGER PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
        images      JSONB NOT NULL,
        crawled_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("✅ Bảng chapter_contents OK");
  } finally {
    client.release();
  }
}

run()
  .then(() => { console.log("🎉 Migration hoàn tất"); process.exit(0); })
  .catch((err) => { console.error("[createChapterTables]", err); process.exit(1); });
