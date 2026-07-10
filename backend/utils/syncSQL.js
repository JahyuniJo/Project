/**
 * Script CLI `npm run es:sync` — đồng bộ toàn bộ bảng `stories` từ PostgreSQL
 * sang Elasticsearch (full re-index, kèm sinh embedding nếu có OPENAI_KEY).
 * Chạy sau khi crawl thủ công hoặc khi index bị lệch dữ liệu. Lỗi → exit code 1.
 */
const { syncStoriesFromSql } = require("../services/searchService");

syncStoriesFromSql()
  .then(({ indexed, withEmbedding = 0, errors }) => {
    const embeddingNote = withEmbedding > 0 ? ` (${withEmbedding}/${indexed} có embedding)` : " (không có embedding — kiểm tra OPENAI_KEY)";
    const suffix = errors ? " — có lỗi bulk" : "";
    console.log(`Synced ${indexed} stories to Elasticsearch${embeddingNote}${suffix}.`);
  })
  .catch((error) => {
    console.error("Failed to sync stories to Elasticsearch:", error.message);
    process.exitCode = 1;
  });
