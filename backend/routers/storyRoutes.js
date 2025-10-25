const express = require("express");
const pool = require("../config/db.js");
const router = express.Router();
const { syncStories, getStories } = require("../controllers/storyController");
const client = require("../config/elasticsearch");
const { removeVietnameseTones } = require('../utils/normalizeText');


// API lấy danh sách truyện có phân trang
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim();

    let total = 0, totalPages = 1, stories = [];

    // ========================
    // 🔍 Có từ khóa search
    // ========================
    if (search) {
      const normalizedSearch = removeVietnameseTones(search);

      // 1️⃣ Ưu tiên khớp chính xác theo cụm từ (match_phrase)
      let result = await client.search({
        index: "stories",
        from: offset,
        size: limit,
        query: {
          match_phrase: {
            title: {
              query: search,
              slop: 1
            }
          }
        }
      });

      // 2️⃣ Nếu không có kết quả → fallback sang multi_match gần đúng
      if (result.hits.total.value === 0) {
        result = await client.search({
          index: "stories",
          from: offset,
          size: limit,
          query: {
            multi_match: {
              query: normalizedSearch,
              fields: ["title^3", "author^2", "genres", "description"],
              fuzziness: "AUTO",
              type: "best_fields"
            }
          }
        });
      }

      total = result.hits.total.value;
      totalPages = Math.ceil(total / limit);
      stories = result.hits.hits.map(hit => hit._source);

    } else {
      // ========================
      // ⚙️ Không có search → trả từ DB
      // ========================
      const totalRes = await pool.query("SELECT COUNT(*) FROM stories;");
      total = parseInt(totalRes.rows[0].count);
      totalPages = Math.ceil(total / limit);

      const result = await pool.query(
        "SELECT * FROM stories ORDER BY id ASC LIMIT $1 OFFSET $2;",
        [limit, offset]
      );
      stories = result.rows;
    }

    // 📦 Trả kết quả
    res.json({
      page,
      totalPages,
      total,
      stories
    });

  } catch (error) {
    console.error("❌ Lỗi truy vấn hoặc Elasticsearch:", error);
    res.status(500).json({ error: "Lỗi server" });
  }
});



// ✏️ Sửa thông tin truyện
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let { title, author, cover_url, status, url } = req.body;
    const statusMap = {
      'Đang cập nhật': 'ongoing',
      'Đang ra': 'ongoing',
      'Hoàn thành': 'completed',
      'Tạm Ngưng': 'stopped',
      'Ngưng': 'stopped'
    };

    status = statusMap[status.trim()] || 'ongoing'; // Mặc định ongoing
     await pool.query(
      `
      UPDATE stories
      SET title = $1, author = $2, cover_url = $3, status = $4, url = $5
      WHERE id = $6
      `,
      [title, author, cover_url, status, url, id]
    );

    res.json({ message: "Đã cập nhật truyện" });
  } catch (err) {
    console.error("Lỗi cập nhật:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🗑️ Xóa truyện
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM stories WHERE id=$1', [req.params.id]);
    res.json({ message: 'Đã xóa truyện' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Đồng bộ dữ liệu (chạy crawlALL)
router.post("/sync", syncStories);

// Tìm kiếm và phân trang
router.get("/search", getStories);

module.exports = router;
