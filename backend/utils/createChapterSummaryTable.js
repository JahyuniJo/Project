const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const pool = require("../config/pool");

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS chapter_summaries (
        chapter_id  INTEGER PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
        story_id    INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        chapter_num FLOAT NOT NULL,
        summary     TEXT NOT NULL,
        model       VARCHAR(100),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("✅ Bảng chapter_summaries OK");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chapter_summaries_story_chapter
        ON chapter_summaries(story_id, chapter_num)
    `);
    console.log("✅ Index idx_chapter_summaries_story_chapter OK");
  } finally {
    client.release();
  }
}

run()
  .then(() => { console.log("🎉 Migration hoàn tất"); process.exit(0); })
  .catch((err) => { console.error("[createChapterSummaryTable]", err); process.exit(1); });
