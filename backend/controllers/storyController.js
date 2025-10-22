const { exec } = require("child_process");
const pool = require("../config/db"); // hoặc client PostgreSQL của bạn

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

// 🔹 API tìm kiếm + phân trang
const getStories = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT * FROM stories
      WHERE LOWER(title) LIKE LOWER($1)
      ORDER BY id DESC
      LIMIT $2 OFFSET $3
    `;
    const values = [`%${search}%`, limit, offset];

    const result = await pool.query(query, values);
    const total = await pool.query(`SELECT COUNT(*) FROM stories WHERE LOWER(title) LIKE LOWER($1)`, [`%${search}%`]);

    res.json({
      data: result.rows,
      total: Number(total.rows[0].count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error('❌ Lỗi search:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { syncStories, getStories };
