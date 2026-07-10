/**
 * Script CLI `npm run es:create-index` — tạo index `stories` trên Elasticsearch
 * với mapping chuẩn (qua ensureStoriesIndex). Chạy 1 lần khi setup môi trường;
 * index đã tồn tại thì chỉ báo lại, không tạo đè. Lỗi → exit code 1.
 */
const { ensureStoriesIndex } = require("../services/searchService");

ensureStoriesIndex()
  .then(({ created, indexName }) => {
    if (created) {
      console.log(`Created Elasticsearch index: ${indexName}`);
    } else {
      console.log(`Elasticsearch index already exists: ${indexName}`);
    }
  })
  .catch((error) => {
    console.error("Failed to create Elasticsearch index:", error.message ?? error.meta?.body ?? error);
    process.exitCode = 1;
  });
