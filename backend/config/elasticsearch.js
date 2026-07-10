/**
 * config/elasticsearch.js — Khởi tạo Elasticsearch client dùng chung.
 *
 * Xuất ra:
 *   - `client`: instance @elastic/elasticsearch, trỏ tới ELASTICSEARCH_URL
 *     (mặc định localhost:9200). Auth basic chỉ được gắn khi CẢ username lẫn
 *     password đều có trong .env — môi trường dev không bật security vẫn chạy được.
 *   - `indexName`: tên index truyện (mặc định "stories") — mọi thao tác search/index
 *     trong searchService đều dùng biến này thay vì hardcode.
 */
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
