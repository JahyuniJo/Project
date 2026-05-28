const path = require("path");
const { Client } = require("@elastic/elasticsearch");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const node = process.env.ELASTICSEARCH_URL || "http://localhost:9200";
const indexName = process.env.ELASTICSEARCH_STORIES_INDEX || "stories";
const username = process.env.ELASTICSEARCH_USERNAME;
const password = process.env.ELASTICSEARCH_PASSWORD;

const config = {
  node,
  ...(username && password ? { auth: { username, password } } : {}),
};

const client = new Client(config);

module.exports = {
  client,
  indexName,
};
