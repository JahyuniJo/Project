const express = require("express");
const pool = require("../config/db.js");
const router = express.Router();
const { syncStories, getStories } = require("../controllers/storyController");

// API lấy danh sách truyện có phân trang
router.get("/", async (req, res) => {
  try {
    // Lấy page & limit từ query (nếu không có thì mặc định)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12; // mỗi trang 12 truyện
    const offset = (page - 1) * limit;

    // Lấy tổng số truyện
    const totalRes = await pool.query("SELECT COUNT(*) FROM stories;");
    const total = parseInt(totalRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    // Lấy dữ liệu truyện cho trang hiện tại
    const result = await pool.query(
      "SELECT * FROM stories ORDER BY id ASC LIMIT $1 OFFSET $2;",
      [limit, offset]
    );

    res.json({
      page,
      totalPages,
      total,
      stories: result.rows,
    });
  } catch (error) {
    console.error("Lỗi truy vấn:", error);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
});

router.get('/search', async (req, res) => {
  const q = `%${req.query.q || ''}%`;
  try {
    const result = await pool.query(
      'SELECT * FROM stories WHERE title ILIKE $1 ORDER BY updated_at DESC',
      [q]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
      'Tạm ngưng': 'paused',
      'Ngưng': 'paused'
    };

    status = statusMap[status] || 'ongoing'; // Mặc định ongoing
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
