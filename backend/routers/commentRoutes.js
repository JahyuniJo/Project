const express = require("express");
const pool = require("../config/db");
const auth = require("../middleware/authMiddleware");
async function sendNotification(io, targetEmail, message) {
    // Lưu DB
    await pool.query(
        `INSERT INTO notifications (user_email, message, is_read, created_at)
         VALUES ($1, $2, false, NOW())`,
        [targetEmail, message]
    );

    // Emit realtime
    io.to(targetEmail).emit("newNotification", {
        message,
        time: Date.now()
    });
}

module.exports = function (io, userSockets) {

    const router = express.Router();

    // ================================
    // GET COMMENTS
    // ================================
    router.get("/", auth, async (req, res) => {
        const { story_id } = req.query;

        if (!story_id) return res.status(400).json({ message: "Thiếu story_id" });

        try {
            const result = await pool.query(`
                SELECT c.*, u.username, u.avatar_url
                FROM comments c
                JOIN "users" u ON u.id = c.user_id
                WHERE c.story_id = $1
                ORDER BY c.created_at DESC
            `, [story_id]);

            const rows = result.rows;

            const map = {};
            rows.forEach(c => {
                map[c.id] = { ...c, replies: [] };
            });

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

            res.json({
                currentUserId: req.user?.userId || null,
                comments: tree
            });

        } catch (err) {
            console.error("SQL ERROR /api/comments:", err);
            res.status(500).json({ message: "Lỗi server" });
        }
    });

    // ================================
    // ADD COMMENT
    // ================================
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

    // ================================
    // UPDATE COMMENT
    // ================================
    router.put("/", auth, async (req, res) => {
        const { comment_id, content } = req.body;
        if (!comment_id || !content) {
            return res.status(400).json({ message: "Thiếu dữ liệu" });
        }
        try {
            const result = await pool.query(`
                UPDATE comments
                SET content = $1, updated_at = NOW()
                WHERE id = $2 AND user_id = $3
                RETURNING id
            `, [content, comment_id, req.user.userId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ message: "Comment không tồn tại hoặc không có quyền sửa" });
            }
            res.json({ message: "Cập nhật comment thành công" });

        } catch (err) {
            console.error("SQL ERROR /api/comments PUT:", err);
            res.status(500).json({ message: "Lỗi server" });
        }
    });

    // ================================
    // DELETE COMMENT
    // ================================
    router.delete("/", auth, async (req, res) => {
        const { comment_id } = req.body;
        if (!comment_id) {
            return res.status(400).json({ message: "Thiếu comment_id" });
        }
        try {
            const result = await pool.query(`
                DELETE FROM comments
                WHERE id = $1 AND user_id = $2
                RETURNING id
            `, [comment_id, req.user.userId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ message: "Comment không tồn tại hoặc không có quyền xoá" });
            }
            res.json({ message: "Xoá comment thành công" });

        } catch (err) {
            console.error("SQL ERROR /api/comments DELETE:", err);
            res.status(500).json({ message: "Lỗi server" });
        }
    });

    // ================================
    // REPLY COMMENT + EMIT NOTIFY
    // ================================
    router.post("/reply", auth, async (req, res) => {
        const { parent_id, content } = req.body;

        if (!parent_id || !content) {
            return res.status(400).json({ message: "Thiếu dữ liệu" });
        }

        try {
            // Lấy thông tin comment cha
            const parent = await pool.query(
                `SELECT story_id, user_id FROM comments WHERE id = $1`,
                [parent_id]
            );

            if (parent.rows.length === 0) {
                return res.status(404).json({ message: "Comment cha không tồn tại" });
            }

            const story_id = parent.rows[0].story_id;
            const parentUserId = parent.rows[0].user_id;

            // Insert reply
            const result = await pool.query(`
                INSERT INTO comments (story_id, user_id, parent_id, content)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [story_id, req.user.userId, parent_id, content]);

            const replyId = result.rows[0].id;

            // Emit notify cho chủ comment cha
            //----------------------------------------
            // Lấy email người nhận
            //----------------------------------------
            const ownerQuery = await pool.query(
                `SELECT email FROM users WHERE id = $1`,
                [parentUserId]
            );
            const ownerEmail = ownerQuery.rows[0]?.email;

            if (ownerEmail && ownerEmail !== req.user.email) {
                const message = `${req.user.username} đã trả lời bình luận của bạn`;
                await sendNotification(io, ownerEmail, message);
            }


            res.json({
                message: "Reply thành công",
                reply: {
                    id: replyId,
                    parent_id,
                    content
                }
            });

        } catch (err) {
            console.error("SQL ERROR /api/comments/reply:", err);
            res.status(500).json({ message: "Lỗi server" });
        }
    });

    // ================================
    // LIKE COMMENT + EMIT NOTIFY
    // ================================
    router.post("/like", auth, async (req, res) => {
        const { comment_id } = req.body;

        if (!comment_id) {
            return res.status(400).json({ message: "Thiếu comment_id" });
        }

        try {
            const commentData = await pool.query(
                `SELECT user_id FROM comments WHERE id = $1`,
                [comment_id]
            );

            if (commentData.rows.length === 0) {
                return res.status(404).json({ message: "Comment không tồn tại" });
            }

            const commentOwner = commentData.rows[0].user_id;

            const exists = await pool.query(
                `SELECT id FROM comment_likes WHERE user_id = $1 AND comment_id = $2`,
                [req.user.userId, comment_id]
            );

            let liked;
            if (exists.rows.length > 0) {
                // Bỏ like
                await pool.query(
                    `DELETE FROM comment_likes WHERE user_id = $1 AND comment_id = $2`,
                    [req.user.userId, comment_id]
                );

                await pool.query(
                    `UPDATE comments SET likes = likes - 1 WHERE id = $1`,
                    [comment_id]
                );

                liked = false;

            } else {
                // Like
                await pool.query(
                    `INSERT INTO comment_likes (user_id, comment_id) VALUES ($1, $2)`,
                    [req.user.userId, comment_id]
                );

                await pool.query(
                    `UPDATE comments SET likes = likes + 1 WHERE id = $1`,
                    [comment_id]
                );

                liked = true;

                // Gửi thông báo cho chủ comment
                if (commentOwner !== req.user.userId) {
                    if (liked && commentOwner !== req.user.userId) {

                        const ownerQuery = await pool.query(
                            `SELECT email FROM users WHERE id = $1`,
                            [commentOwner]
                        );
                        const ownerEmail = ownerQuery.rows[0]?.email;

                        if (ownerEmail) {
                            const message = `${req.user.username} đã thích bình luận của bạn`;
                            await sendNotification(io, ownerEmail, message);
                        }
                    }

                }
            }

            res.json({
                message: liked ? "Like thành công" : "Bỏ like thành công",
                liked
            });

        } catch (err) {
            console.error("ERROR /api/comments/like:", err);
            res.status(500).json({ message: "Lỗi server" });
        }
    });

    return router;
};
