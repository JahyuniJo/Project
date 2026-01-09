const express = require("express");
const pool = require("../config/db.js");
const router = express.Router();
const { syncStories, getStories } = require("../controllers/storyController");
const client = require("../config/elasticsearch");
const { removeVietnameseTones } = require('../utils/normalizeText');
const authMiddleware = require("../middleware/authMiddleware");
router.get("/search", getStories);
router.post("/sync", syncStories);
// GET /api/stories/by-genre?genre=Truyện%20hài
router.get("/by-genre", async (req, res) => {
  try {
    const { genre } = req.query;

    if (!genre) {
      return res.status(400).json({ message: "Thiếu genre" });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM stories
      WHERE $1 = ANY(genres)
      ORDER BY created_at DESC
      `,
      [genre]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ by-genre error:", err);
    res.status(500).json({ message: "Lỗi lọc thể loại" });
  }
});

// API lấy danh sách truyện có phân trang
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim();

    let total = 0, totalPages = 1, stories = [];
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


// Lấy truyện hiển thị 
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE stories SET view_count = view_count + 1 WHERE id = $1", [id]);
    const result = await pool.query("SELECT * FROM stories WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy truyện" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Lỗi lấy truyện:", err);
    res.status(500).json({ error: err.message });
  }
});


// Sửa thông tin truyện
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
    await client.index({
  index: "stories",
  id: id.toString(),
  document: { id, title, author, cover_url, status, url }
});
await client.indices.refresh({ index: "stories" });

    res.json({ message: "Đã cập nhật truyện" });
  } catch (err) {
    console.error("Lỗi cập nhật:", err);
    res.status(500).json({ error: err.message });
  }
});


//  Xóa truyện
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 🔹 Xóa khỏi PostgreSQL
    const result = await pool.query("DELETE FROM stories WHERE id = $1 RETURNING *;", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Không tìm thấy truyện để xóa" });
    }

    // 🔹 Xóa khỏi Elasticsearch (nếu có)
    try {
      await client.delete({
        index: "stories",
        id: id.toString()
      });
    } catch (err) {
      if (err.meta?.statusCode === 404) {
        console.warn(`⚠️ Truyện ID ${id} không tồn tại trong Elasticsearch`);
      } else {
        console.error("❌ Lỗi xóa Elasticsearch:", err);
      }
    }

    res.json({ message: "Đã xóa truyện thành công" });
  } catch (err) {
    console.error("❌ Lỗi xóa truyện:", err);
    res.status(500).json({ error: "Lỗi server khi xóa truyện" });
  }
});

// ghi log đọc truyện 
router.post("/:id/view", authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const storyId = req.params.id;

  await pool.query(
    "INSERT INTO user_story_views (user_id, story_id) VALUES ($1, $2)",
    [userId, storyId]
  );

  await pool.query(
    "UPDATE stories SET view_count = view_count + 1 WHERE id = $1",
    [storyId]
  );

  res.json({ success: true });
});



module.exports = router;
