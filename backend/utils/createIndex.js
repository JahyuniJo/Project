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
