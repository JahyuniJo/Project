const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/requireAdmin");
const { callAIStream, callAIRaw } = require("../services/aiService");
const { searchByDescription } = require("../services/searchService");

const JWT_SECRET = process.env.JWT_SECRET;
const MAX_MESSAGE_LENGTH = 500;
const HISTORY_LIMIT = 20;
const MAX_HISTORY_TOKENS = 4000; // ~12k ký tự tiếng Việt — giữ context vừa đủ
const HISTORY_DISPLAY_LIMIT = 50;
const CHAT_COOLDOWN_MS = 2000;
const CHAPTER_CONTEXT_LIMIT = 15;
const RECOMMEND_RESULT_LIMIT = 5;

// Rate limiting per user (không phải per socket — ngăn multi-tab bypass)
const userCooldowns = new Map();
setInterval(() => {
  const cutoff = Date.now() - CHAT_COOLDOWN_MS;
  for (const [uid, ts] of userCooldowns) {
    if (ts < cutoff) userCooldowns.delete(uid);
  }
}, 60_000);

// ── Context window management ─────────────────────────────────────────────────
// ~3 ký tự/token với tiếng Việt (ước lượng bảo thủ)
function estimateTokens(text) {
  return Math.ceil((text || "").length / 3);
}

// Giữ lại history gần nhất vừa với ngưỡng token — tránh lỗi context limit
function trimHistoryToFit(history, maxTokens = MAX_HISTORY_TOKENS) {
  let used = 0;
  const kept = [];
  for (let i = history.length - 1; i >= 0; i--) {
    used += estimateTokens(history[i].content);
    if (used > maxTokens) break;
    kept.unshift(history[i]);
  }
  return kept;
}

// ── User preferences — top genres từ lịch sử đọc ─────────────────────────────
async function getUserTopGenres(client, userId, limit = 5) {
  try {
    const result = await client.query(
      `SELECT unnest(s.genres) AS genre, COUNT(*) AS cnt
       FROM user_story_views usv
       JOIN stories s ON s.id = usv.story_id
       WHERE usv.user_id = $1
       GROUP BY genre
       ORDER BY cnt DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map((r) => r.genre).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Library context (cache 5 phút) ───────────────────────────────────────────
let _libCtxCache = null;
let _libCtxCachedAt = 0;
const LIB_CTX_TTL_MS = 5 * 60 * 1000;

async function getLibraryContext() {
  const now = Date.now();
  if (_libCtxCache && now - _libCtxCachedAt < LIB_CTX_TTL_MS) return _libCtxCache;
  const [statsRow, genreRows] = await Promise.all([
    pool.query("SELECT COUNT(*) AS total FROM stories"),
    pool.query("SELECT DISTINCT unnest(genres) AS genre FROM stories ORDER BY genre ASC"),
  ]);
  _libCtxCache = {
    totalStories: Number(statsRow.rows[0].total),
    genres: genreRows.rows.map((r) => r.genre).filter(Boolean),
  };
  _libCtxCachedAt = now;
  return _libCtxCache;
}

// ── System prompts ────────────────────────────────────────────────────────────
function buildLibrarySystemPrompt(ctx, userGenres = []) {
  const genreList = ctx.genres.slice(0, 30).join(", ");
  const prefLine = userGenres.length
    ? `\n\n## Sở thích người dùng\nThể loại hay đọc: ${userGenres.join(", ")}`
    : "";

  return `Bạn là trợ lý thư viện của DH.Story — nền tảng đọc truyện tranh trực tuyến.

## Thư viện DH.Story
- Tổng số truyện: ${ctx.totalStories} truyện
- Thể loại có sẵn: ${genreList || "Đa dạng"}${prefLine}

## Nhiệm vụ
1. Giúp người dùng tìm truyện phù hợp — luôn dùng tiếng Việt
2. Khi người dùng mô tả loại truyện họ muốn, hãy dùng công cụ search_stories để tìm
3. Giới thiệu truyện ngắn gọn, hấp dẫn; nêu bật thể loại và điểm nổi bật
4. Khi hệ thống cung cấp danh sách truyện — hãy giới thiệu từng truyện một cách tự nhiên
5. Kết thúc bằng câu mời ("Bạn muốn tìm thể loại nào khác không?", v.v.)
6. Không bịa đặt thông tin về truyện ngoài những gì được cung cấp`;
}

function buildSystemPrompt(story, chapterNum, chapters, totalChaps, userGenres = []) {
  const genres = Array.isArray(story.genres) ? story.genres.join(", ") : story.genres || "";
  const summaryLine = story.ai_summary ? `\n- Tóm tắt AI: ${story.ai_summary}` : "";

  let progressLine = "";
  if (chapterNum) {
    const spoilerWarning =
      totalChaps && chapterNum < totalChaps
        ? " — chưa đọc xong, KHÔNG tiết lộ nội dung chương sau"
        : "";
    progressLine = `\n- Chương đang đọc: ${chapterNum}${totalChaps ? `/${totalChaps}` : ""}${spoilerWarning}`;
  }

  const prefLine = userGenres.length
    ? `\n\n## Sở thích người dùng\nThể loại hay đọc: ${userGenres.join(", ")}`
    : "";

  let chapterListText = "";
  if (chapters && chapters.length) {
    const list = chapters
      .map((c) => `  • Chương ${c.chapter_num}${c.title ? `: ${c.title}` : ""}`)
      .join("\n");
    chapterListText = `\n\n## Danh sách chương (${chapters.length} chương đầu)\n${list}`;
  }

  return `Bạn là trợ lý AI của DH.Story — nền tảng đọc truyện tranh trực tuyến.

## Truyện đang hỗ trợ
- Tên: ${story.title}
- Tác giả: ${story.author || "Không rõ"}
- Thể loại: ${genres || "Không rõ"}
- Mô tả: ${story.description || "Không có mô tả"}${summaryLine}${progressLine}${chapterListText}${prefLine}

## Nguyên tắc trả lời
1. Luôn dùng tiếng Việt, thân thiện, ngắn gọn (không quá 4 đoạn)
2. Dựa vào thông tin được cung cấp — không bịa đặt nội dung chương
3. Tôn trọng tiến độ đọc: không tiết lộ nội dung chương người dùng chưa đọc
4. Nếu không biết chắc, hãy nói thật thay vì đoán mò
5. Khi người dùng muốn tìm truyện tương tự hoặc gợi ý, hãy dùng công cụ search_similar_stories
6. Khi hệ thống cung cấp danh sách truyện gợi ý — hãy giới thiệu từng truyện ngắn gọn, hấp dẫn`;
}

function buildRecommendContext(stories) {
  if (!stories.length) {
    return "Hệ thống không tìm thấy truyện phù hợp. Hãy thông báo và gợi ý người dùng thử mô tả khác.";
  }
  const list = stories
    .map((s, i) => {
      const g = Array.isArray(s.genres) ? s.genres.join(", ") : s.genres || "Không rõ";
      const desc = s.description ? s.description.slice(0, 100) + "..." : "Không có mô tả";
      return `${i + 1}. **${s.title}** — Tác giả: ${s.author || "Không rõ"}\n   Thể loại: ${g}\n   Mô tả: ${desc}`;
    })
    .join("\n\n");
  return `[KẾT QUẢ TỪ THƯ VIỆN — ${stories.length} truyện]\n\n${list}`;
}

// ── Cookie / JWT ──────────────────────────────────────────────────────────────
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

function checkCooldown(userId) {
  const now = Date.now();
  const lastTime = userCooldowns.get(userId) || 0;
  if (now - lastTime < CHAT_COOLDOWN_MS) return false;
  userCooldowns.set(userId, now);
  return true;
}

function emitStoryCards(socket, stories) {
  if (!stories.length) return;
  socket.emit("chatStories", {
    stories: stories.map(({ id, title, author, cover_url, genres }) => ({
      id, title, author, cover_url, genres,
    })),
  });
}

async function runSearch(query, excludeId) {
  const stories = await searchByDescription({
    query: query || "",
    excludeId: excludeId || null,
    limit: RECOMMEND_RESULT_LIMIT,
  });
  return { stories, context: buildRecommendContext(stories) };
}

// Phát hiện intent tìm kiếm & trích xuất query — dùng model nhỏ, nhanh, reliable
async function getSearchIntent(userMessage) {
  try {
    const result = await callAIRaw(
      [
        {
          role: "user",
          content: `Tin nhắn người dùng: "${userMessage}"

Nhiệm vụ: Xác định người dùng có muốn tìm/được gợi ý truyện không.
- Nếu CÓ → trả về từ khóa tìm kiếm ngắn gọn (thể loại, chủ đề, đặc điểm, v.v.)
- Nếu KHÔNG → chỉ trả về: NONE

Chỉ trả về từ khóa hoặc NONE, không giải thích.`,
        },
      ],
      { temperature: 0, maxTokens: 25 }
    );
    const q = (result || "").trim();
    return q && q.toUpperCase() !== "NONE" ? q : null;
  } catch {
    return null;
  }
}

// ── Handler chung cho cả 2 mode ───────────────────────────────────────────────
async function runAgenticChat({ socket, messages: inMessages, thinkingStatus, excludeId }) {
  const messages = [...inMessages];
  const userMessage = messages[messages.length - 1]?.content || "";
  let recommendedStories = [];

  try {
    const searchQuery = await getSearchIntent(userMessage);
    if (searchQuery) {
      socket.emit("chatThinking", { status: thinkingStatus });
      const { stories, context } = await runSearch(searchQuery, excludeId);
      recommendedStories = stories;
      // Inject kết quả vào message cuối để AI dùng làm context
      messages[messages.length - 1] = {
        role: "user",
        content: `${context}\n\n---\nNgười dùng yêu cầu: ${userMessage}`,
      };
    }
  } catch (err) {
    console.warn("[chatRoutes] intent detection lỗi:", err.message);
  }

  const fullReply = await callAIStream(messages, (chunk) => socket.emit("chatChunk", { chunk }));
  return { fullReply, recommendedStories };
}

// ── Socket init ───────────────────────────────────────────────────────────────
function initChat(io) {
  io.on("connection", (socket) => {
    // ── Story mode ────────────────────────────────────────────────────────────
    socket.on("chatMessage", async ({ storyId, message, chapterNum }) => {
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
      if (!checkCooldown(decoded.userId)) {
        return socket.emit("chatError", { message: "Vui lòng chờ trước khi gửi tin tiếp theo" });
      }

      const chapNum = chapterNum != null ? parseFloat(chapterNum) : null;
      const validChapNum = chapNum > 0 ? chapNum : null;
      const userId = decoded.userId;

      let client;
      let userMsgId = null;
      try {
        client = await pool.connect();

        // Load tất cả dữ liệu song song
        const [storyRow, chapResult, historyRows, totalChapsRow, userGenres] = await Promise.all([
          client.query(
            "SELECT id, title, author, genres, description, ai_summary FROM stories WHERE id = $1",
            [sid]
          ),
          client.query(
            "SELECT chapter_num, title FROM chapters WHERE story_id = $1 ORDER BY chapter_num ASC LIMIT $2",
            [sid, CHAPTER_CONTEXT_LIMIT]
          ),
          client.query(
            `SELECT role, content FROM chat_messages
             WHERE user_id = $1 AND story_id = $2
             ORDER BY created_at DESC LIMIT $3`,
            [userId, sid, HISTORY_LIMIT]
          ),
          client.query("SELECT COUNT(*) AS total FROM chapters WHERE story_id = $1", [sid]),
          getUserTopGenres(client, userId),
        ]);

        if (!storyRow.rows.length) {
          return socket.emit("chatError", { message: "Không tìm thấy truyện" });
        }

        const story = storyRow.rows[0];
        const totalChaps = parseInt(totalChapsRow.rows[0]?.total) || 0;
        const history = trimHistoryToFit(historyRows.rows.reverse());

        const insertResult = await client.query(
          "INSERT INTO chat_messages (user_id, story_id, role, content) VALUES ($1, $2, 'user', $3) RETURNING id",
          [userId, sid, msg]
        );
        userMsgId = insertResult.rows[0].id;

        const messages = [
          { role: "system", content: buildSystemPrompt(story, validChapNum, chapResult.rows, totalChaps, userGenres) },
          ...history.map((r) => ({ role: r.role, content: r.content })),
          { role: "user", content: msg },
        ];

        const { fullReply, recommendedStories } = await runAgenticChat({
          socket,
          messages,
          excludeId: sid,
          thinkingStatus: "Đang tìm truyện phù hợp...",
        });

        if (!fullReply) throw new Error("AI trả về nội dung rỗng");

        const storyMetaJson = recommendedStories.length
          ? JSON.stringify({ story_ids: recommendedStories.map((s) => s.id) })
          : null;
        await client.query(
          "INSERT INTO chat_messages (user_id, story_id, role, content, metadata) VALUES ($1, $2, 'assistant', $3, $4)",
          [userId, sid, fullReply, storyMetaJson]
        );

        socket.emit("chatDone", { reply: fullReply });
        emitStoryCards(socket, recommendedStories);
      } catch (err) {
        console.error("[chatRoutes] chatMessage:", err);
        if (userMsgId && client) {
          await client.query("DELETE FROM chat_messages WHERE id = $1", [userMsgId]).catch(() => {});
        }
        socket.emit("chatError", { message: "Lỗi server, vui lòng thử lại" });
      } finally {
        if (client) client.release();
      }
    });

    // ── Library mode ──────────────────────────────────────────────────────────
    socket.on("libraryMessage", async ({ message }) => {
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
      if (!checkCooldown(decoded.userId)) {
        return socket.emit("chatError", { message: "Vui lòng chờ trước khi gửi tin tiếp theo" });
      }

      const userId = decoded.userId;
      let client;
      let userMsgId = null;
      try {
        client = await pool.connect();

        const [libCtx, historyRows, userGenres] = await Promise.all([
          getLibraryContext(),
          client.query(
            `SELECT role, content FROM chat_messages
             WHERE user_id = $1 AND story_id IS NULL
             ORDER BY created_at DESC LIMIT $2`,
            [userId, HISTORY_LIMIT]
          ),
          getUserTopGenres(client, userId),
        ]);

        const history = trimHistoryToFit(historyRows.rows.reverse());

        const insertResult = await client.query(
          "INSERT INTO chat_messages (user_id, story_id, role, content) VALUES ($1, NULL, 'user', $2) RETURNING id",
          [userId, msg]
        );
        userMsgId = insertResult.rows[0].id;

        const messages = [
          { role: "system", content: buildLibrarySystemPrompt(libCtx, userGenres) },
          ...history.map((r) => ({ role: r.role, content: r.content })),
          { role: "user", content: msg },
        ];

        const { fullReply, recommendedStories } = await runAgenticChat({
          socket,
          messages,
          excludeId: null,
          thinkingStatus: "Đang tìm kiếm trong thư viện...",
        });

        if (!fullReply) throw new Error("AI trả về nội dung rỗng");

        const libMetaJson = recommendedStories.length
          ? JSON.stringify({ story_ids: recommendedStories.map((s) => s.id) })
          : null;
        await client.query(
          "INSERT INTO chat_messages (user_id, story_id, role, content, metadata) VALUES ($1, NULL, 'assistant', $2, $3)",
          [userId, fullReply, libMetaJson]
        );

        socket.emit("chatDone", { reply: fullReply });
        emitStoryCards(socket, recommendedStories);
      } catch (err) {
        console.error("[chatRoutes] libraryMessage:", err);
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

// ── HTTP routes ───────────────────────────────────────────────────────────────
const router = express.Router();

router.get("/history", authMiddleware, async (req, res) => {
  const rawId = req.query.story_id;
  const storyId = rawId ? parseInt(rawId) : null;
  if (rawId && (!storyId || storyId <= 0)) {
    return res.status(400).json({ message: "story_id không hợp lệ" });
  }

  try {
    let result;
    if (storyId) {
      result = await pool.query(
        `SELECT id, role, content, metadata, created_at FROM chat_messages
         WHERE user_id = $1 AND story_id = $2
         ORDER BY created_at ASC LIMIT $3`,
        [req.user.id, storyId, HISTORY_DISPLAY_LIMIT]
      );
    } else {
      result = await pool.query(
        `SELECT id, role, content, metadata, created_at FROM chat_messages
         WHERE user_id = $1 AND story_id IS NULL
         ORDER BY created_at ASC LIMIT $2`,
        [req.user.id, HISTORY_DISPLAY_LIMIT]
      );
    }

    // Thu thập tất cả story_ids từ metadata để batch-fetch một lần
    const storyIdSet = new Set();
    for (const row of result.rows) {
      if (row.metadata?.story_ids?.length) {
        row.metadata.story_ids.forEach((id) => storyIdSet.add(id));
      }
    }

    let storyMap = {};
    if (storyIdSet.size > 0) {
      const { rows: storyRows } = await pool.query(
        `SELECT id, title, author, cover_url, genres FROM stories WHERE id = ANY($1::int[])`,
        [[...storyIdSet]]
      );
      for (const s of storyRows) storyMap[s.id] = s;
    }

    const messages = result.rows.map((row) => {
      const msg = { id: row.id, role: row.role, content: row.content, created_at: row.created_at };
      if (row.metadata?.story_ids?.length) {
        msg.story_cards = row.metadata.story_ids.map((id) => storyMap[id]).filter(Boolean);
      }
      return msg;
    });

    res.json({ messages });
  } catch (err) {
    console.error("[chatRoutes] history:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

router.delete("/history", authMiddleware, async (req, res) => {
  const rawId = req.query.story_id;
  const storyId = rawId ? parseInt(rawId) : null;
  if (rawId && (!storyId || storyId <= 0)) {
    return res.status(400).json({ message: "story_id không hợp lệ" });
  }

  try {
    if (storyId) {
      await pool.query(
        "DELETE FROM chat_messages WHERE user_id = $1 AND story_id = $2",
        [req.user.id, storyId]
      );
    } else {
      await pool.query(
        "DELETE FROM chat_messages WHERE user_id = $1 AND story_id IS NULL",
        [req.user.id]
      );
    }
    res.json({ message: "Đã xóa lịch sử chat" });
  } catch (err) {
    console.error("[chatRoutes] delete history:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// ── Admin routes ──────────────────────────────────────────────────────────────
const adminRouter = express.Router();

adminRouter.get("/stats", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const [total, today, week, activeUsers, daily] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM chat_messages"),
      pool.query(
        "SELECT COUNT(*) AS total FROM chat_messages WHERE created_at >= CURRENT_DATE"
      ),
      pool.query(
        "SELECT COUNT(*) AS total FROM chat_messages WHERE created_at >= NOW() - INTERVAL '7 days'"
      ),
      pool.query(
        "SELECT COUNT(DISTINCT user_id) AS total FROM chat_messages WHERE created_at >= NOW() - INTERVAL '7 days'"
      ),
      pool.query(`
        SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'DD/MM') AS day,
               COUNT(*) FILTER (WHERE role = 'user')      AS user_msgs,
               COUNT(*) FILTER (WHERE role = 'assistant') AS ai_msgs
        FROM chat_messages
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
        ORDER BY DATE(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') ASC
      `),
    ]);
    res.json({
      totalMessages: parseInt(total.rows[0].total),
      todayMessages: parseInt(today.rows[0].total),
      weekMessages:  parseInt(week.rows[0].total),
      activeUsers:   parseInt(activeUsers.rows[0].total),
      dailyActivity: daily.rows,
    });
  } catch (err) {
    console.error("[chatRoutes] admin stats:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

adminRouter.get("/logs", authMiddleware, requireAdmin, async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const mode   = req.query.mode || "all";
  const userId  = parseInt(req.query.user_id)  || null;
  const storyId = parseInt(req.query.story_id) || null;

  const conditions = [];
  const params = [];

  if (mode === "library") {
    conditions.push("cm.story_id IS NULL");
  } else if (mode === "story") {
    conditions.push("cm.story_id IS NOT NULL");
  }
  if (userId) {
    params.push(userId);
    conditions.push(`cm.user_id = $${params.length}`);
  }
  if (storyId) {
    params.push(storyId);
    conditions.push(`cm.story_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const [countRes, dataRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM chat_messages cm ${where}`, params),
      pool.query(
        `SELECT cm.id, cm.role, cm.content, cm.created_at,
                cm.story_id, s.title AS story_title,
                cm.user_id, u.username, u.email
         FROM chat_messages cm
         LEFT JOIN stories s ON s.id = cm.story_id
         LEFT JOIN users   u ON u.id = cm.user_id
         ${where}
         ORDER BY cm.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
    ]);

    const total = parseInt(countRes.rows[0].total);
    res.json({
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      messages: dataRes.rows,
    });
  } catch (err) {
    console.error("[chatRoutes] admin logs:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

adminRouter.delete("/messages/:id", authMiddleware, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id <= 0) return res.status(400).json({ message: "ID không hợp lệ" });

  try {
    const result = await pool.query(
      "DELETE FROM chat_messages WHERE id = $1 RETURNING id",
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
    res.json({ message: "Đã xóa tin nhắn" });
  } catch (err) {
    console.error("[chatRoutes] admin delete:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = { router, adminRouter, initChat };
