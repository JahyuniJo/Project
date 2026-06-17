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
