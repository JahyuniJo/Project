const express = require("express");
const pool = require("../config/pool");
const auth = require("../middleware/authMiddleware");
const optionalAuth = require("../middleware/optionalAuth");

const MAX_COMMENT_LENGTH = 2000;

/**
 * Ép giá trị bất kỳ về số nguyên dương, sai kiểu/âm/thập phân → null.
 * Dùng validate mọi ID (story_id, comment_id, parent_id) từ client.
 * @param {unknown} value
 * @returns {number|null}
 */
function toPositiveInt(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Chuẩn hóa nội dung comment: trim khoảng trắng; không phải string → chuỗi rỗng
 * (để validateContent phía sau báo lỗi thống nhất thay vì crash).
 * @param {unknown} content
 * @returns {string}
 */
function normalizeContent(content) {
    return typeof content === "string" ? content.trim() : "";
}

/**
 * Kiểm tra nội dung comment: không rỗng, không vượt MAX_COMMENT_LENGTH (2000 ký tự).
 * @param {string} content - Nội dung ĐÃ qua normalizeContent.
 * @returns {string|null} Message lỗi tiếng Việt, hoặc null nếu hợp lệ.
 */
function validateContent(content) {
    if (!content) return "Nội dung không được để trống";
    if (content.length > MAX_COMMENT_LENGTH) {
        return `Nội dung tối đa ${MAX_COMMENT_LENGTH} ký tự`;
    }
    return null;
}

/**
 * Gửi thông báo cho 1 user theo 2 kênh cùng lúc:
 *   1. INSERT vào bảng `notifications` (bền — hiện ở chuông kể cả khi offline).
 *   2. Emit Socket.io `newNotification` tới room theo email — user đang online
 *      thấy ngay không cần refresh.
 * @param {import("socket.io").Server} io
 * @param {string} targetEmail - Email người nhận (cũng là tên room socket).
 * @param {string} message - Nội dung thông báo.
 * @param {string|null} [link] - URL đích khi bấm vào thông báo.
 */
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

/**
 * Phát hiện chuỗi parent_id bị vòng lặp (A → B → A) khi build cây comment —
 * dữ liệu hỏng kiểu này sẽ làm đệ quy dựng cây chạy vô hạn nếu không chặn.
 * Leo ngược từ comment lên tổ tiên, gặp lại ID đã đi qua → có vòng.
 * @param {object} row - Comment đang xét.
 * @param {Map<number, object>} rowById - Map id → row của toàn bộ comment.
 * @returns {boolean} true nếu nối vào cha sẽ tạo vòng lặp.
 */
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

/**
 * Chuyển mảng comment phẳng từ SQL thành CÂY lồng nhau để frontend render.
 *
 * - Mỗi node kèm cờ quyền theo góc nhìn user hiện tại: canEdit/canDelete
 *   (chỉ chủ comment), canHide (người khác), likedByMe.
 * - Comment mồ côi (cha bị xóa), tự trỏ chính nó, hoặc tạo vòng lặp
 *   (wouldCreateCycle) được "cứu" thành comment gốc thay vì biến mất.
 * - Sắp xếp 2 chiều ngược nhau có chủ đích: comment GỐC mới nhất trước
 *   (đọc bình luận mới), còn REPLY cũ nhất trước (đọc hội thoại theo dòng thời gian).
 *
 * @param {Array<object>} rows - Kết quả SQL (đã JOIN username, avatar, likes, liked_by_me).
 * @param {number|null} currentUserId - User đang xem, null nếu là khách.
 * @returns {Array<object>} Mảng comment gốc, replies lồng trong `replies`.
 */
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

// Router comment — export là factory nhận `io` để gửi thông báo realtime (reply/like).
module.exports = function (io) {
    const router = express.Router();

    /**
     * Handler dùng chung cho POST / (comment gốc) và POST /reply (trả lời).
     *
     * Chạy trong TRANSACTION: khi là reply, khóa comment cha bằng FOR SHARE
     * để cha không bị xóa giữa chừng (race với DELETE thread); story_id lấy theo
     * comment cha (client gửi story_id lệch cha → 400). Sau COMMIT, nếu reply
     * comment của NGƯỜI KHÁC thì gửi thông báo kèm link nhảy thẳng tới comment mới —
     * lỗi thông báo chỉ log, không làm fail request (comment đã lưu thành công).
     */
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
                    const link = `/read2?id=${storyId}#comment-${newCommentId}`;
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

    /**
     * GET /api/comments?story_id=N — Toàn bộ comment của truyện dạng CÂY (optionalAuth:
     * khách vẫn xem được, đăng nhập thì biết thêm likedByMe/canEdit...).
     * 1 query duy nhất JOIN users + subquery đếm like + LEFT JOIN lượt like của
     * chính mình, rồi buildCommentTree dựng cây phía Node.
     */
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

    // POST /api/comments — tạo comment gốc (hoặc reply nếu body có parent_id)
    router.post("/", auth, createComment);

    // POST /api/comments/reply — alias của createComment, chấp nhận cả tên field
    // cũ `comment_id` lẫn `parent_id` để tương thích client cũ
    router.post("/reply", auth, (req, res) => {
        req.body.parent_id = req.body.parent_id || req.body.comment_id;
        return createComment(req, res);
    });

    /**
     * PUT /api/comments { comment_id, content } — Sửa nội dung comment.
     * UPDATE có điều kiện `user_id = $3`: chỉ chủ comment sửa được; comment
     * của người khác trả 404 (gộp "không tồn tại" và "không có quyền" —
     * không lộ comment nào tồn tại). Cập nhật updated_at để UI hiện "đã sửa".
     */
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

    /**
     * DELETE /api/comments { comment_id } — Xóa comment và TOÀN BỘ thread con.
     *
     * Trong transaction:
     *   1. Khóa comment gốc bằng FOR UPDATE + kiểm tra quyền sở hữu.
     *   2. CTE đệ quy `thread` gom comment + mọi hậu duệ (mảng `path` chống
     *      vòng lặp parent_id vô hạn), xóa like của cả thread rồi xóa comment —
     *      tất cả trong MỘT câu SQL nguyên tử.
     * Trả `deletedCount` để UI biết đã xóa bao nhiêu comment con kéo theo.
     */
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

    /**
     * POST /api/comments/like { comment_id } — Toggle like/unlike trong transaction.
     *
     * INSERT với ON CONFLICT DO NOTHING trên UNIQUE(user_id, comment_id) vừa là
     * thao tác vừa là phép thử: insert được → vừa LIKE (tăng likes denormalized);
     * không insert được (đã like trước đó) → UNLIKE (xóa dòng like, giảm likes,
     * GREATEST(...) chặn âm). FOR UPDATE trên comment tuần tự hóa 2 request
     * like đồng thời. Like thành công comment người khác → gửi thông báo
     * (best-effort, sau COMMIT). Trả { liked, likes } để UI cập nhật ngay.
     */
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
                    const link = `/read2?id=${owner.story_id}#comment-${commentId}`;
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
