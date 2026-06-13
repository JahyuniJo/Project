const express = require("express");
const pool = require("../config/pool");
const auth = require("../middleware/authMiddleware");
const optionalAuth = require("../middleware/optionalAuth");

const MAX_COMMENT_LENGTH = 2000;

function toPositiveInt(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeContent(content) {
    return typeof content === "string" ? content.trim() : "";
}

function validateContent(content) {
    if (!content) return "Nội dung không được để trống";
    if (content.length > MAX_COMMENT_LENGTH) {
        return `Nội dung tối đa ${MAX_COMMENT_LENGTH} ký tự`;
    }
    return null;
}

async function sendNotification(io, targetEmail, message, link = null) {
    await pool.query(
        `INSERT INTO notifications (user_email, message, link, is_read, created_at)
         VALUES ($1, $2, $3, false, NOW())`,
        [targetEmail, message, link]
    );

    io.to(targetEmail).emit("newNotification", {
        message,
        link,
        time: Date.now()
    });
}

function wouldCreateCycle(row, rowById) {
    const seen = new Set([row.id]);
    let parentId = row.parent_id;

    while (parentId) {
        if (seen.has(parentId)) return true;
        seen.add(parentId);

        const parent = rowById.get(parentId);
        if (!parent) return false;

        parentId = parent.parent_id;
    }

    return false;
}

function buildCommentTree(rows, currentUserId) {
    const rowById = new Map();
    const nodeById = new Map();

    rows.forEach((row) => {
        rowById.set(row.id, row);
        nodeById.set(row.id, {
            id: row.id,
            story_id: row.story_id,
            user_id: row.user_id,
            parent_id: row.parent_id,
            content: row.content,
            likes: Number(row.likes || 0),
            created_at: row.created_at,
            updated_at: row.updated_at,
            username: row.username,
            avatar_url: row.avatar_url,
            likedByMe: row.liked_by_me === true,
            canEdit: currentUserId === row.user_id,
            canDelete: currentUserId === row.user_id,
            canHide: !!currentUserId && currentUserId !== row.user_id,
            replyCount: 0,
            replies: []
        });
    });

    const roots = [];

    rows.forEach((row) => {
        const node = nodeById.get(row.id);
        const parent = nodeById.get(row.parent_id);

        if (!row.parent_id || !parent || row.parent_id === row.id || wouldCreateCycle(row, rowById)) {
            roots.push(node);
            return;
        }

        parent.replies.push(node);
    });

    function sortBranch(nodes, isRoot = false) {
        nodes.sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            return isRoot ? timeB - timeA || b.id - a.id : timeA - timeB || a.id - b.id;
        });

        nodes.forEach((node) => {
            node.replyCount = node.replies.length;
            sortBranch(node.replies, false);
        });
    }

    sortBranch(roots, true);
    return roots;
}

module.exports = function (io) {
    const router = express.Router();

    async function createComment(req, res) {
        const storyIdFromBody = toPositiveInt(req.body.story_id);
        const parentId = toPositiveInt(req.body.parent_id);
        const content = normalizeContent(req.body.content);
        const contentError = validateContent(content);

        if (contentError) {
            return res.status(400).json({ message: contentError });
        }

        const client = await pool.connect();
        let parentOwner = null;

        try {
            await client.query("BEGIN");

            let storyId = storyIdFromBody;

            if (parentId) {
                const parentResult = await client.query(
                    `SELECT c.id, c.story_id, c.user_id, u.email
                     FROM comments c
                     JOIN users u ON u.id = c.user_id
                     WHERE c.id = $1
                     FOR SHARE`,
                    [parentId]
                );

                if (parentResult.rows.length === 0) {
                    await client.query("ROLLBACK");
                    return res.status(404).json({ message: "Comment cha không tồn tại" });
                }

                const parent = parentResult.rows[0];
                if (storyId && storyId !== parent.story_id) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "Comment cha không thuộc truyện này" });
                }

                storyId = parent.story_id;
                parentOwner = parent;
            }

            if (!storyId) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Thiếu story_id" });
            }

            const result = await client.query(
                `INSERT INTO comments (story_id, user_id, parent_id, content)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, story_id, user_id, parent_id, content, likes, created_at, updated_at`,
                [storyId, req.user.userId, parentId, content]
            );

            await client.query("COMMIT");

            if (parentOwner && parentOwner.user_id !== req.user.userId && parentOwner.email) {
                try {
                    const username = req.user.username || "Ai đó";
                    const newCommentId = result.rows[0].id;
                    const link = `/read2.html?id=${storyId}#comment-${newCommentId}`;
                    await sendNotification(io, parentOwner.email, `${username} đã trả lời bình luận của bạn`, link);
                } catch (notifyErr) {
                    console.error("Notification error create comment:", notifyErr);
                }
            }

            return res.status(201).json({
                message: parentId ? "Reply thành công" : "Comment thành công",
                comment: result.rows[0]
            });
        } catch (err) {
            await client.query("ROLLBACK");
            console.error("SQL ERROR create comment:", err);
            return res.status(500).json({ message: "Lỗi server" });
        } finally {
            client.release();
        }
    }

    router.get("/", optionalAuth, async (req, res) => {
        const storyId = toPositiveInt(req.query.story_id);
        if (!storyId) {
            return res.status(400).json({ message: "Thiếu story_id" });
        }

        const currentUserId = req.user?.userId || null;

        try {
            const result = await pool.query(
                `SELECT
                    c.id,
                    c.story_id,
                    c.user_id,
                    c.parent_id,
                    c.content,
                    COALESCE(like_counts.total_likes, c.likes, 0)::int AS likes,
                    c.created_at,
                    c.updated_at,
                    u.username,
                    u.avatar_url,
                    (my_like.id IS NOT NULL) AS liked_by_me
                 FROM comments c
                 JOIN users u ON u.id = c.user_id
                 LEFT JOIN (
                    SELECT comment_id, COUNT(*)::int AS total_likes
                    FROM comment_likes
                    GROUP BY comment_id
                 ) like_counts ON like_counts.comment_id = c.id
                 LEFT JOIN comment_likes my_like
                    ON my_like.comment_id = c.id
                   AND my_like.user_id = $2
                 WHERE c.story_id = $1
                 ORDER BY c.created_at ASC, c.id ASC`,
                [storyId, currentUserId]
            );

            res.json({
                currentUserId,
                total: result.rows.length,
                comments: buildCommentTree(result.rows, currentUserId)
            });
        } catch (err) {
            console.error("SQL ERROR /api/comments:", err);
            res.status(500).json({ message: "Lỗi server" });
        }
    });

    router.post("/", auth, createComment);

    router.post("/reply", auth, (req, res) => {
        req.body.parent_id = req.body.parent_id || req.body.comment_id;
        return createComment(req, res);
    });

    router.put("/", auth, async (req, res) => {
        const commentId = toPositiveInt(req.body.comment_id);
        const content = normalizeContent(req.body.content);
        const contentError = validateContent(content);

        if (!commentId || contentError) {
            return res.status(400).json({ message: contentError || "Thiếu comment_id" });
        }

        try {
            const result = await pool.query(
                `UPDATE comments
                 SET content = $1, updated_at = NOW()
                 WHERE id = $2 AND user_id = $3
                 RETURNING id, content, updated_at`,
                [content, commentId, req.user.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ message: "Comment không tồn tại hoặc không có quyền sửa" });
            }

            res.json({
                message: "Cập nhật comment thành công",
                comment: result.rows[0]
            });
        } catch (err) {
            console.error("SQL ERROR /api/comments PUT:", err);
            res.status(500).json({ message: "Lỗi server" });
        }
    });

    router.delete("/", auth, async (req, res) => {
        const commentId = toPositiveInt(req.body.comment_id);
        if (!commentId) {
            return res.status(400).json({ message: "Thiếu comment_id" });
        }

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const owned = await client.query(
                `SELECT id FROM comments WHERE id = $1 AND user_id = $2 FOR UPDATE`,
                [commentId, req.user.userId]
            );

            if (owned.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ message: "Comment không tồn tại hoặc không có quyền xóa" });
            }

            const deleted = await client.query(
                `WITH RECURSIVE thread(id, path) AS (
                    SELECT id, ARRAY[id]
                    FROM comments
                    WHERE id = $1

                    UNION ALL

                    SELECT c.id, t.path || c.id
                    FROM comments c
                    JOIN thread t ON c.parent_id = t.id
                    WHERE NOT c.id = ANY(t.path)
                 ),
                 deleted_likes AS (
                    DELETE FROM comment_likes
                    WHERE comment_id IN (SELECT id FROM thread)
                 )
                 DELETE FROM comments
                 WHERE id IN (SELECT id FROM thread)
                 RETURNING id`,
                [commentId]
            );

            await client.query("COMMIT");

            res.json({
                message: "Xóa comment thành công",
                deletedCount: deleted.rows.length
            });
        } catch (err) {
            await client.query("ROLLBACK");
            console.error("SQL ERROR /api/comments DELETE:", err);
            res.status(500).json({ message: "Lỗi server" });
        } finally {
            client.release();
        }
    });

    router.post("/like", auth, async (req, res) => {
        const commentId = toPositiveInt(req.body.comment_id);
        if (!commentId) {
            return res.status(400).json({ message: "Thiếu comment_id" });
        }

        const client = await pool.connect();
        let owner = null;
        let liked = false;
        let likes = 0;

        try {
            await client.query("BEGIN");

            const commentResult = await client.query(
                `SELECT c.id, c.story_id, c.user_id, u.email
                 FROM comments c
                 JOIN users u ON u.id = c.user_id
                 WHERE c.id = $1
                 FOR UPDATE`,
                [commentId]
            );

            if (commentResult.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ message: "Comment không tồn tại" });
            }

            owner = commentResult.rows[0];

            const inserted = await client.query(
                `INSERT INTO comment_likes (user_id, comment_id)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id, comment_id) DO NOTHING
                 RETURNING id`,
                [req.user.userId, commentId]
            );

            if (inserted.rows.length > 0) {
                liked = true;
                const updated = await client.query(
                    `UPDATE comments
                     SET likes = COALESCE(likes, 0) + 1
                     WHERE id = $1
                     RETURNING likes`,
                    [commentId]
                );
                likes = Number(updated.rows[0].likes || 0);
            } else {
                liked = false;
                await client.query(
                    `DELETE FROM comment_likes
                     WHERE user_id = $1 AND comment_id = $2`,
                    [req.user.userId, commentId]
                );
                const updated = await client.query(
                    `UPDATE comments
                     SET likes = GREATEST(COALESCE(likes, 0) - 1, 0)
                     WHERE id = $1
                     RETURNING likes`,
                    [commentId]
                );
                likes = Number(updated.rows[0].likes || 0);
            }

            await client.query("COMMIT");

            if (liked && owner.user_id !== req.user.userId && owner.email) {
                try {
                    const username = req.user.username || "Ai đó";
                    const link = `/read2.html?id=${owner.story_id}#comment-${commentId}`;
                    await sendNotification(io, owner.email, `${username} đã thích bình luận của bạn`, link);
                } catch (notifyErr) {
                    console.error("Notification error like comment:", notifyErr);
                }
            }

            res.json({
                message: liked ? "Like thành công" : "Bỏ like thành công",
                liked,
                likes
            });
        } catch (err) {
            await client.query("ROLLBACK");
            console.error("[commentRoutes] like:", err);
            res.status(500).json({ message: "Lỗi server" });
        } finally {
            client.release();
        }
    });

    return router;
};
