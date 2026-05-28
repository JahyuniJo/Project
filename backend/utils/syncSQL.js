const { syncStoriesFromSql } = require("../services/searchService");

syncStoriesFromSql()
  .then(({ indexed, errors }) => {
    const suffix = errors ? " with bulk errors" : "";
    console.log(`Synced ${indexed} stories to Elasticsearch${suffix}.`);
  })
  .catch((error) => {
    console.error("Failed to sync stories to Elasticsearch:", error.message);
    process.exitCode = 1;
  });
