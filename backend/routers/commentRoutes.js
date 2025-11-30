const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const auth = require("../middleware/authMiddleware");

router.get("/", async (req, res) => {
    const { story_id } = req.query;

    if (!story_id) return res.status(400).json({ message: "Thiếu story_id" });

    try {
        const result = await pool.query(`
            SELECT c.*, u.username
            FROM comments c
            JOIN "users" u ON u.id = c.user_id
            WHERE c.story_id = $1
            ORDER BY c.created_at ASC
        `, [story_id]);

        const rows = result.rows;

        // Tạo map comment_id → comment object
        const map = {};
        rows.forEach(c => {
            map[c.id] = { ...c, replies: [] };
        });

        // Xây cây comments
        const tree = [];
        rows.forEach(c => {
            if (c.parent_id) {
                if (map[c.parent_id]) {
                    map[c.parent_id].replies.push(map[c.id]);
                }
            } else {
                tree.push(map[c.id]);
            }
        });

        res.json(tree);

    } catch (err) {
        console.error("SQL ERROR /api/comments:", err);
        res.status(500).json({ message: "Lỗi server" });
    }
});



router.post("/", auth, async (req, res) => {
    const { story_id, content } = req.body;

    if (!content) return res.status(400).json({ message: "Nội dung trống" });

    try {
        await pool.query(`
            INSERT INTO comments (story_id, user_id, content)
            VALUES ($1, $2, $3)
        `, [story_id, req.user.userId, content]);

        res.json({ message: "Comment thành công" });

    } catch (err) {
        console.error("SQL ERROR /api/comments POST:", err);
        res.status(500).json({ message: "Lỗi server" });
    }
});

router.post("/reply", auth, async (req, res) => {
    const { parent_id, content } = req.body;

    if (!parent_id || !content) {
        return res.status(400).json({ message: "Thiếu dữ liệu" });
    }

    try {
        // Lấy comment cha
        const parent = await pool.query(
            `SELECT story_id, user_id, content FROM comments WHERE id = $1`,
            [parent_id]
        );

        if (parent.rows.length === 0) {
            return res.status(404).json({ message: "Comment cha không tồn tại" });
        }

        const story_id = parent.rows[0].story_id;

        // Lấy username của người comment cha
        const user = await pool.query(
            `SELECT username FROM users WHERE id = $1`,
            [parent.rows[0].user_id]
        );

        const parentUsername = user.rows[0].username;

        // Insert reply
        const result = await pool.query(`
            INSERT INTO comments (story_id, user_id, parent_id, content)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [story_id, req.user.userId, parent_id, content]);

        res.json({ 
            message: "Reply thành công",
            reply: {
                id: result.rows[0].id,
                parent_id,
                parentUsername,
                content
            }
        });

    } catch (err) {
        console.error("SQL ERROR /api/comments/reply:", err);
        res.status(500).json({ message: "Lỗi server" });
    }
});



router.post("/like", auth, async (req, res) => {
  const { comment_id } = req.body;

  if (!comment_id) {
    return res.status(400).json({ message: "Thiếu comment_id" });
  }

  try {
    // Check comment tồn tại
    const check = await pool.query(
      "SELECT id FROM comments WHERE id = $1",
      [comment_id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Comment không tồn tại" });
    }

    // Kiểm tra user đã like chưa
    const exists = await pool.query(
      "SELECT id FROM comment_likes WHERE user_id = $1 AND comment_id = $2",
      [req.user.userId, comment_id]
    );

    if (exists.rows.length > 0) {
      // Nếu đã like → bỏ like
      await pool.query(
        "DELETE FROM comment_likes WHERE user_id = $1 AND comment_id = $2",
        [req.user.userId, comment_id]
      );
      await pool.query(
        "UPDATE comments SET likes = likes - 1 WHERE id = $1",
        [comment_id]
      );
      return res.json({ message: "Bỏ like thành công" });
    } else {
      // Nếu chưa like → thêm like
      await pool.query(
        "INSERT INTO comment_likes (user_id, comment_id) VALUES ($1, $2)",
        [req.user.userId, comment_id]
      );
      await pool.query(
        "UPDATE comments SET likes = likes + 1 WHERE id = $1",
        [comment_id]
      );
      return res.json({ message: "Like thành công" });
    }
  } catch (err) {
    console.error("ERROR /api/comments/like:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});



module.exports = router;
