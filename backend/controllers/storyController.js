const { exec } = require("child_process");
const pool = require("../config/db"); // hoặc client PostgreSQL của bạn
const { Client } = require("@elastic/elasticsearch");
const esClient = new Client({ node: "http://localhost:9200" });
const { removeVietnameseTones } = require('../utils/normalizeText');

// 🔹 API đồng bộ dữ liệu bằng cách chạy file crawlALL.js
const syncStories = (req, res) => {
  exec("node middleware/crawlALL.js", (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Lỗi khi crawl: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
    if (stderr) console.error(`⚠️ stderr: ${stderr}`);
    console.log(stdout);
    res.json({ message: "✅ Đồng bộ truyện thành công!" });
  });
};



// 🔹 API tìm kiếm hiển thị fetchsuggest
const getStories = async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.json([]);

  try {
    const normalizedQ = removeVietnameseTones(q.toLowerCase());
    // Truy vấn gợi ý nhanh — chỉ cần top 5-10 kết quả
    const result = await esClient.search({
      index: "stories",
      size: 10,
      query: {
        bool: {
          should: [
            // Ưu tiên cụm chính xác
            {
              match_phrase_prefix: {
                title: {
                  query: q,
                  slop: 1
                }
              }
            },
            // Tìm gần đúng không dấu
            {
              multi_match: {
                query: normalizedQ,
                fields: ["title^3", "author^2", "genres"],
                fuzziness: "AUTO",
                type: "bool_prefix"
              }
            }
          ],
          minimum_should_match: 1
        }
      },
      _source: ["id", "title", "author", "cover_url"]
    });

    const suggestions = result.hits.hits.map(hit => ({
      id: hit._id,
      title: hit._source.title,
      author: hit._source.author,
      cover_url: hit._source.cover_url
    }));

    res.json(suggestions);
  } catch (error) {
    console.error("❌ Lỗi fetchSuggest Elasticsearch:", error);
    res.status(500).json({ error: "Lỗi khi tìm kiếm gợi ý" });
  }
};



module.exports = { syncStories, getStories };
