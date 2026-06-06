const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");
const { callAIStream } = require("../services/aiService");

const JWT_SECRET = process.env.JWT_SECRET;
const MAX_MESSAGE_LENGTH = 500;
const HISTORY_LIMIT = 20;       // số tin nhắn đưa vào context AI
const HISTORY_DISPLAY_LIMIT = 50; // số tin nhắn hiển thị trên UI
const CHAT_COOLDOWN_MS = 2000;

// Rate limiting per user (không phải per socket — ngăn multi-tab bypass)
const userCooldowns = new Map();
setInterval(() => {
  const cutoff = Date.now() - CHAT_COOLDOWN_MS;
  for (const [uid, ts] of userCooldowns) {
    if (ts < cutoff) userCooldowns.delete(uid);
  }
}, 60_000);

function buildSystemPrompt(story) {
  const genres = Array.isArray(story.genres) ? story.genres.join(", ") : story.genres || "";
  const summaryLine = story.ai_summary ? `\n- Tóm tắt AI: ${story.ai_summary}` : "";
  return `Bạn là trợ lý đọc truyện thông minh của DH.Story. Bạn đang hỗ trợ người đọc cho truyện:
- Tên truyện: ${story.title}
- Tác giả: ${story.author || "Không rõ"}
- Thể loại: ${genres || "Không rõ"}
- Mô tả: ${story.description || "Không có mô tả"}${summaryLine}

Hãy trả lời bằng tiếng Việt, thân thiện và ngắn gọn. Chỉ trả lời câu hỏi liên quan đến truyện này. Không tiết lộ kết truyện.`;
}

function parseCookieToken(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)authToken=([^;]+)/);
  return match ? match[1] : null;
}

function getUserFromSocket(socket) {
  try {
    const token = parseCookieToken(socket.handshake.headers.cookie);
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function initChat(io) {
  io.on("connection", (socket) => {
    socket.on("chatMessage", async ({ storyId, message }) => {
      const sid = parseInt(storyId);
      if (!sid || sid <= 0) {
        return socket.emit("chatError", { message: "Story không hợp lệ" });
      }

      const msg = typeof message === "string" ? message.trim() : "";
      if (!msg || msg.length > MAX_MESSAGE_LENGTH) {
        return socket.emit("chatError", {
          message: msg ? `Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự` : "Tin nhắn không được trống",
        });
      }

      const decoded = getUserFromSocket(socket);
      if (!decoded) {
        return socket.emit("chatError", { message: "Vui lòng đăng nhập để dùng tính năng này" });
      }

      const now = Date.now();
      const lastTime = userCooldowns.get(decoded.userId) || 0;
      if (now - lastTime < CHAT_COOLDOWN_MS) {
        return socket.emit("chatError", { message: "Vui lòng chờ trước khi gửi tin tiếp theo" });
      }
      userCooldowns.set(decoded.userId, now);

      let client;
      let userMsgId = null;
      try {
        client = await pool.connect();

        const userRow = await client.query(
          "SELECT id FROM users WHERE id = $1",
          [decoded.userId]
        );
        if (!userRow.rows.length) {
          return socket.emit("chatError", { message: "Tài khoản không tồn tại" });
        }
        const userId = userRow.rows[0].id;

        const storyRow = await client.query(
          "SELECT id, title, author, genres, description, ai_summary FROM stories WHERE id = $1",
          [sid]
        );
        if (!storyRow.rows.length) {
          return socket.emit("chatError", { message: "Không tìm thấy truyện" });
        }
        const story = storyRow.rows[0];

        const historyRows = await client.query(
          `SELECT role, content FROM chat_messages
           WHERE user_id = $1 AND story_id = $2
           ORDER BY created_at DESC LIMIT $3`,
          [userId, sid, HISTORY_LIMIT]
        );
        const history = historyRows.rows.reverse();

        const insertResult = await client.query(
          "INSERT INTO chat_messages (user_id, story_id, role, content) VALUES ($1, $2, 'user', $3) RETURNING id",
          [userId, sid, msg]
        );
        userMsgId = insertResult.rows[0].id;

        const messages = [
          { role: "system", content: buildSystemPrompt(story) },
          ...history.map((r) => ({ role: r.role, content: r.content })),
          { role: "user", content: msg },
        ];

        const fullReply = await callAIStream(messages, (chunk) => {
          socket.emit("chatChunk", { chunk });
        });

        await client.query(
          "INSERT INTO chat_messages (user_id, story_id, role, content) VALUES ($1, $2, 'assistant', $3)",
          [userId, sid, fullReply]
        );

        socket.emit("chatDone", { reply: fullReply });
      } catch (err) {
        console.error("[chatRoutes] chatMessage:", err);
        // Xóa user message mồ côi nếu AI thất bại
        if (userMsgId && client) {
          await client.query("DELETE FROM chat_messages WHERE id = $1", [userMsgId]).catch(() => {});
        }
        socket.emit("chatError", { message: "Lỗi server, vui lòng thử lại" });
      } finally {
        if (client) client.release();
      }
    });
  });
}

const router = express.Router();

router.get("/history", authMiddleware, async (req, res) => {
  const storyId = parseInt(req.query.story_id);
  if (!storyId || storyId <= 0) {
    return res.status(400).json({ message: "story_id không hợp lệ" });
  }

  try {
    const result = await pool.query(
      `SELECT id, role, content, created_at FROM chat_messages
       WHERE user_id = $1 AND story_id = $2
       ORDER BY created_at ASC LIMIT $3`,
      [req.user.id, storyId, HISTORY_DISPLAY_LIMIT]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error("[chatRoutes] history:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.delete("/history", authMiddleware, async (req, res) => {
  const storyId = parseInt(req.query.story_id);
  if (!storyId || storyId <= 0) {
    return res.status(400).json({ message: "story_id không hợp lệ" });
  }

  try {
    await pool.query(
      "DELETE FROM chat_messages WHERE user_id = $1 AND story_id = $2",
      [req.user.id, storyId]
    );
    res.json({ message: "Đã xóa lịch sử chat" });
  } catch (err) {
    console.error("[chatRoutes] delete history:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = { router, initChat };
