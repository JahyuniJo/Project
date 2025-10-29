const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// 📋 Lấy danh sách người dùng (có phân trang & tìm kiếm)
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search.trim()}%` : "%%";

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM "users" WHERE username ILIKE $1 OR email ILIKE $1`,
      [search]
    );
    const total = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    const result = await pool.query(
      `SELECT id, username, email, role FROM "users"
       WHERE username ILIKE $1 OR email ILIKE $1
       ORDER BY id ASC LIMIT $2 OFFSET $3`,
      [search, limit, offset]
    );

    res.json({ page, totalPages, total, users: result.rows });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách người dùng:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ➕ Thêm người dùng
router.post("/", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    await pool.query(
      `INSERT INTO "users" (username, email, password, role)
       VALUES ($1, $2, $3, $4)`,
      [username, email, password, role || "user"]
    );
    res.json({ message: "Đã thêm người dùng mới" });
  } catch (err) {
    console.error("❌ Lỗi thêm người dùng:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ✏️ Sửa người dùng
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role } = req.body;
    await pool.query(
      `UPDATE "users" SET username=$1, email=$2, role=$3 WHERE id=$4`,
      [username, email, role, id]
    );
    res.json({ message: "Cập nhật thành công" });
  } catch (err) {
    console.error("❌ Lỗi cập nhật người dùng:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ❌ Xóa người dùng
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM "users" WHERE id = $1`, [id]);
    res.json({ message: "Đã xóa người dùng" });
  } catch (err) {
    console.error("❌ Lỗi xóa người dùng:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

module.exports = router;
