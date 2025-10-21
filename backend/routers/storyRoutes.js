const express = require("express");
const pool = require("../config/db.js");
const router = express.Router();

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

module.exports = router;
