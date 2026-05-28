const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");

// Lấy tất cả danh sách yêu thích kèm số lượng truyện
router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT fl.id, fl.name, COUNT(fs.id)::int AS story_count
       FROM favorite_lists fl
       LEFT JOIN favorite_stories fs ON fs.list_id = fl.id
       WHERE fl.iduser = $1
       GROUP BY fl.id
       ORDER BY fl.id DESC`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[interaction] list:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Tạo danh sách mới
router.post("/", authMiddleware, async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

  if (!name) {
    return res.status(400).json({ message: "Tên danh sách không được để trống" });
  }

  try {
    const exists = await pool.query(
      "SELECT id FROM favorite_lists WHERE iduser = $1 AND LOWER(name) = LOWER($2)",
      [req.user.userId, name]
    );
    if (exists.rows.length > 0) {
      return res.status(400).json({ message: "Tên danh sách đã tồn tại" });
    }

    const result = await pool.query(
      "INSERT INTO favorite_lists (iduser, name) VALUES ($1, $2) RETURNING id, name",
      [req.user.userId, name]
    );

    res.status(201).json({ message: "Tạo danh sách thành công", list: result.rows[0] });
  } catch (err) {
    console.error("[interaction] create:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Đổi tên danh sách
router.put("/:id", authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

  if (!id || id <= 0) {
    return res.status(400).json({ message: "ID danh sách không hợp lệ" });
  }
  if (!name) {
    return res.status(400).json({ message: "Tên danh sách không được để trống" });
  }

  try {
    const exists = await pool.query(
      "SELECT id FROM favorite_lists WHERE iduser = $1 AND LOWER(name) = LOWER($2) AND id != $3",
      [req.user.userId, name, id]
    );
    if (exists.rows.length > 0) {
      return res.status(400).json({ message: "Tên danh sách đã tồn tại" });
    }

    const result = await pool.query(
      "UPDATE favorite_lists SET name = $1 WHERE id = $2 AND iduser = $3 RETURNING id, name",
      [name, id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Không tìm thấy danh sách" });
    }

    res.json({ message: "Đổi tên thành công", list: result.rows[0] });
  } catch (err) {
    console.error("[interaction] rename:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Xóa danh sách
router.delete("/:id", authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "ID danh sách không hợp lệ" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM favorite_lists WHERE id = $1 AND iduser = $2 RETURNING id",
      [id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Không tìm thấy danh sách hoặc bạn không có quyền xóa" });
    }

    res.json({ message: "Xóa danh sách thành công" });
  } catch (err) {
    console.error("[interaction] delete list:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Lấy truyện trong danh sách
router.get("/:id/stories", authMiddleware, async (req, res) => {
  const listId = parseInt(req.params.id);
  if (!listId || listId <= 0) {
    return res.status(400).json({ message: "ID danh sách không hợp lệ" });
  }

  try {
    const check = await pool.query(
      "SELECT id FROM favorite_lists WHERE id = $1 AND iduser = $2",
      [listId, req.user.userId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập danh sách này" });
    }

    const result = await pool.query(
      `SELECT s.id, s.title, s.author, s.cover_url, s.genres, s.status
       FROM favorite_stories fs
       JOIN stories s ON fs.story_id = s.id
       WHERE fs.list_id = $1
       ORDER BY fs.added_at DESC`,
      [listId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("[interaction] list stories:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Thêm truyện vào danh sách
router.post("/:id/stories", authMiddleware, async (req, res) => {
  const listId = parseInt(req.params.id);
  const storyId = parseInt(req.body.storyId);

  if (!listId || listId <= 0) {
    return res.status(400).json({ message: "ID danh sách không hợp lệ" });
  }
  if (!storyId || storyId <= 0) {
    return res.status(400).json({ message: "ID truyện không hợp lệ" });
  }

  try {
    const check = await pool.query(
      "SELECT id FROM favorite_lists WHERE id = $1 AND iduser = $2",
      [listId, req.user.userId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ message: "Bạn không có quyền thêm vào danh sách này" });
    }

    const exists = await pool.query(
      "SELECT id FROM favorite_stories WHERE list_id = $1 AND story_id = $2",
      [listId, storyId]
    );
    if (exists.rows.length > 0) {
      return res.status(400).json({ message: "Truyện đã có trong danh sách" });
    }

    await pool.query(
      "INSERT INTO favorite_stories (list_id, story_id) VALUES ($1, $2)",
      [listId, storyId]
    );

    res.status(201).json({ message: "Đã thêm truyện vào danh sách" });
  } catch (err) {
    console.error("[interaction] add story:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Xóa truyện khỏi danh sách
router.delete("/:listId/stories/:storyId", authMiddleware, async (req, res) => {
  const listId = parseInt(req.params.listId);
  const storyId = parseInt(req.params.storyId);

  if (!listId || listId <= 0 || !storyId || storyId <= 0) {
    return res.status(400).json({ message: "ID không hợp lệ" });
  }

  try {
    const check = await pool.query(
      "SELECT id FROM favorite_lists WHERE id = $1 AND iduser = $2",
      [listId, req.user.userId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ message: "Bạn không có quyền sửa danh sách này" });
    }

    const result = await pool.query(
      "DELETE FROM favorite_stories WHERE list_id = $1 AND story_id = $2 RETURNING id",
      [listId, storyId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Truyện không tồn tại trong danh sách" });
    }

    res.json({ message: "Đã xóa truyện khỏi danh sách" });
  } catch (err) {
    console.error("[interaction] remove story:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = router;
