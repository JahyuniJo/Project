const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const authMiddleware = require("../middleware/authMiddleware");


// --- Lấy tất cả danh sách yêu thích ---
router.get("/", authMiddleware, async (req, res) => {
  try {
    const  userId  = req.user.userId;
    const result = await pool.query(
      "SELECT id, name FROM favorite_lists WHERE iduser = $1 ORDER BY id DESC",
      [userId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("❌ Lỗi GET /favlists:", err);
    return res.status(500).json({ message: "Lỗi server khi tải danh sách" });
  }
});

// --- Tạo danh sách mới ---
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    let { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Tên danh sách không hợp lệ" });
    }
    name = name.trim();

    // Kiểm tra trùng tên (phân biệt không phân biệt hoa/thường)
    const exists = await pool.query(
      "SELECT * FROM favorite_lists WHERE iduser = $1 AND LOWER(name) = LOWER($2)",
      [userId, name]
    );
    if (exists.rows.length > 0) {
      return res.status(400).json({ message: "Tên danh sách đã tồn tại!" });
    }

    const result = await pool.query(
      "INSERT INTO favorite_lists (iduser, name) VALUES ($1, $2) RETURNING id, name",
      [userId, name]
    );
    return res.status(201).json({
      message: "Tạo danh sách thành công!",
      list: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Lỗi POST /favlists:", err);
    return res.status(500).json({ message: "Lỗi server khi tạo danh sách" });
  }
});

// --- Xóa danh sách ---
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM favorite_lists WHERE id = $1 AND iduser = $2 RETURNING id",
      [id, userId]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ message: "Không tìm thấy danh sách hoặc bạn không có quyền xóa" });

    return res.json({ message: "Đã xóa danh sách" });
  } catch (err) {
    console.error("❌ Lỗi DELETE /favlists:", err);
    return res.status(500).json({ message: "Lỗi server khi xóa danh sách" });
  }
});


// Lấy danh sách truyện trong 1 list truyện
router.get("/:id/stories", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const listId = req.params.id;

    // Kiểm tra quyền sở hữu danh sách
    const check = await pool.query(
      "SELECT id FROM favorite_lists WHERE id = $1 AND iduser = $2",
      [listId, userId]
    );
    if (check.rows.length === 0)
      return res.status(403).json({ message: "Không có quyền truy cập danh sách này" });

    const result = await pool.query(
      `SELECT s.id, s.title, s.author, s.cover_url, s.genres, s.status
       FROM favorite_stories fs
       JOIN stories s ON fs.story_id = s.id
       WHERE fs.list_id = $1
       ORDER BY fs.added_at DESC`,
      [listId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("❌ Lỗi GET /favlists/:id/stories:", err);
    return res.status(500).json({ message: "Lỗi server khi tải danh sách truyện" });
  }
});

// thêm 1 truyện vào list
router.post("/:id/stories", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const listId = req.params.id;
    const { storyId } = req.body;

    if (!storyId) return res.status(400).json({ message: "Thiếu storyId" });

    // Kiểm tra danh sách có thuộc user không
    const check = await pool.query(
      "SELECT id FROM favorite_lists WHERE id = $1 AND iduser = $2",
      [listId, userId]
    );
    if (check.rows.length === 0)
      return res.status(403).json({ message: "Không có quyền thêm vào danh sách này" });

    // Kiểm tra trùng
    const exists = await pool.query(
      "SELECT * FROM favorite_stories WHERE list_id = $1 AND story_id = $2",
      [listId, storyId]
    );
    if (exists.rows.length > 0)
      return res.status(400).json({ message: "Truyện này đã có trong danh sách!" });

    await pool.query(
      "INSERT INTO favorite_stories (list_id, story_id) VALUES ($1, $2)",
      [listId, storyId]
    );

    return res.status(201).json({ message: "Đã thêm truyện vào danh sách!" });
  } catch (err) {
    console.error("❌ Lỗi POST /favlists/:id/stories:", err);
    return res.status(500).json({ message: "Lỗi server khi thêm truyện" });
  }
});



// xóa 1 truyện khỏi list
router.delete("/:listId/stories/:storyId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { listId, storyId } = req.params;

    // Kiểm tra quyền sở hữu
    const check = await pool.query(
      "SELECT id FROM favorite_lists WHERE id = $1 AND iduser = $2",
      [listId, userId]
    );
    if (check.rows.length === 0)
      return res.status(403).json({ message: "Không có quyền sửa danh sách này" });

    const result = await pool.query(
      "DELETE FROM favorite_stories WHERE list_id = $1 AND story_id = $2",
      [listId, storyId]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ message: "Truyện không tồn tại trong danh sách" });

    return res.json({ message: "Đã xóa truyện khỏi danh sách" });
  } catch (err) {
    console.error("❌ Lỗi DELETE /favlists/:listId/stories/:storyId:", err);
    return res.status(500).json({ message: "Lỗi server khi xóa truyện" });
  }
});
module.exports = router;
