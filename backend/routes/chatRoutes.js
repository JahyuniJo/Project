const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/requireAdmin");
const { callAIStream, callAIRaw } = require("../services/aiService");
const { getReadingRecap } = require("../services/chapterSummaryService");
const { searchByDescription } = require("../services/searchService");

const JWT_SECRET = process.env.JWT_SECRET;
const MAX_MESSAGE_LENGTH = 500;
const HISTORY_LIMIT = 20;
const MAX_HISTORY_TOKENS = 4000; // ~12k ký tự tiếng Việt — giữ context vừa đủ
const HISTORY_DISPLAY_LIMIT = 50;
const CHAT_COOLDOWN_MS = 2000;
const CHAPTER_CONTEXT_LIMIT = 20;
const CHAPTER_LAST_LIMIT = 5;
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
/**
 * Ước lượng số token của 1 đoạn text theo tỷ lệ ~3 ký tự/token với tiếng Việt
 * (ước lượng bảo thủ — thà đoán dư còn hơn vượt context limit của model).
 * @param {string} text
 * @returns {number} Số token ước lượng.
 */
function estimateTokens(text) {
  return Math.ceil((text || "").length / 3);
}

/**
 * Cắt bớt lịch sử chat để tổng token không vượt ngưỡng — tránh lỗi context limit
 * khi gửi lên Groq. Duyệt từ tin MỚI NHẤT ngược về cũ, giữ lại nhiều tin gần đây
 * nhất có thể; tin cũ vượt ngưỡng bị bỏ (chúng ít giá trị nhất cho ngữ cảnh).
 *
 * @param {Array<{role: string, content: string}>} history - Lịch sử theo thứ tự cũ → mới.
 * @param {number} [maxTokens=MAX_HISTORY_TOKENS] - Ngưỡng token cho phần history.
 * @returns {Array} History đã cắt, vẫn giữ thứ tự cũ → mới.
 */
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
/**
 * Lấy các thể loại người dùng hay đọc nhất, suy ra từ lịch sử xem (`user_story_views`
 * JOIN `stories`, unnest mảng genres rồi đếm tần suất). Kết quả được nhúng vào
 * system prompt để chatbot cá nhân hóa gợi ý.
 *
 * Lỗi query → trả mảng rỗng thay vì throw: sở thích chỉ là thông tin phụ,
 * không được phép làm hỏng cả lượt chat.
 *
 * @param {object} db - pool hoặc client — bất kỳ đối tượng nào có .query().
 * @param {number} userId
 * @param {number} [limit=5] - Số thể loại tối đa.
 * @returns {Promise<string[]>} Thể loại xếp theo tần suất đọc giảm dần.
 */
async function getUserTopGenres(db, userId, limit = 5) {
  try {
    const result = await db.query(
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

/**
 * Lấy thông tin tổng quan thư viện (tổng số truyện + danh sách thể loại distinct)
 * để nhúng vào system prompt của chatbot library mode.
 *
 * Cache in-memory TTL 5 phút: dữ liệu này thay đổi chậm (chỉ khi crawl thêm truyện)
 * nên không cần query lại mỗi tin nhắn chat.
 *
 * @returns {Promise<{totalStories: number, genres: string[]}>}
 */
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
/**
 * Dựng system prompt cho chatbot LIBRARY MODE (chat chung, không gắn với truyện nào):
 * AI đóng vai trợ lý thư viện giúp tìm truyện.
 *
 * Prompt nhúng: tổng số truyện, tối đa 30 thể loại có sẵn, sở thích người dùng (nếu có),
 * và các quy tắc chống ảo giác — quan trọng nhất là AI CHỈ được giới thiệu truyện
 * xuất hiện trong khối [KẾT QUẢ TỪ THƯ VIỆN] (kết quả search thật), tuyệt đối không
 * tự bịa tên truyện từ kiến thức nền.
 *
 * @param {{totalStories: number, genres: string[]}} ctx - Từ getLibraryContext().
 * @param {string[]} [userGenres] - Thể loại hay đọc, từ getUserTopGenres().
 * @returns {string} System prompt hoàn chỉnh.
 */
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
2. Nếu tin nhắn người dùng bắt đầu bằng [KẾT QUẢ TỪ THƯ VIỆN], đó là kết quả tìm kiếm đã được thực hiện sẵn — hãy giới thiệu từng truyện một cách tự nhiên, hấp dẫn dựa trên dữ liệu đó
3. Giới thiệu truyện ngắn gọn; nêu bật thể loại và điểm nổi bật
4. Kết thúc bằng câu mời ("Bạn muốn tìm thể loại nào khác không?", v.v.)
5. Không bịa đặt thông tin về truyện ngoài những gì được cung cấp
6. Nếu [KẾT QUẢ TỪ THƯ VIỆN — 0 truyện], giải thích không tìm thấy và gợi ý người dùng thử mô tả khác
7. TUYỆT ĐỐI không tự đề xuất tên truyện cụ thể nào từ kiến thức của bạn — chỉ giới thiệu truyện khi có [KẾT QUẢ TỪ THƯ VIỆN]`;
}

/**
 * Dựng system prompt cho chatbot STORY MODE (đang chat trong trang đọc 1 truyện cụ thể).
 *
 * Prompt nhúng nhiều lớp ngữ cảnh:
 *   - Metadata truyện: tên, tác giả, thể loại, mô tả, ai_summary.
 *   - Tiến độ đọc: chương đang đọc / tổng số chương, kèm cảnh báo KHÔNG spoil
 *     nội dung các chương sau nếu người dùng chưa đọc hết.
 *   - Recap: tóm tắt nội dung các chương 1→N đã đọc (từ chapter_summaries) — cho phép
 *     AI trả lời chính xác "tóm tắt lại những gì tôi đã đọc" mà không bịa.
 *   - Danh sách chương đầu + "Dữ liệu chính xác" (tổng chương, chương mới nhất)
 *     để AI trả lời thẳng các câu hỏi đếm số thay vì suy đoán.
 *   - Sở thích thể loại của người dùng.
 *   - Quy tắc trả lời: tiếng Việt, ngắn gọn, không ảo giác, chỉ giới thiệu truyện
 *     có trong [KẾT QUẢ TỪ THƯ VIỆN].
 *
 * @param {object} story - Row từ bảng stories (title, author, genres, description, ai_summary).
 * @param {number|null} chapterNum - Chương người dùng đang đọc (null nếu chat từ trang giới thiệu).
 * @param {Array<{chapter_num, title}>} chapters - Các chương đầu (tối đa CHAPTER_CONTEXT_LIMIT).
 * @param {Array<{chapter_num}>} lastChapters - Vài chương mới nhất (suy ra chương mới nhất).
 * @param {number} totalChaps - Tổng số chương của truyện.
 * @param {string[]} [userGenres] - Thể loại hay đọc của người dùng.
 * @param {string|null} [recap] - Recap chương 1→N từ getReadingRecap(), null nếu chưa có.
 * @returns {string} System prompt hoàn chỉnh.
 */
function buildSystemPrompt(story, chapterNum, chapters, lastChapters, totalChaps, userGenres = [], recap = null) {
  const genres = Array.isArray(story.genres) ? story.genres.join(", ") : story.genres || "";
  const summaryLine = story.ai_summary ? `\n- Tóm tắt AI: ${story.ai_summary}` : "";
  const recapBlock = recap
    ? `\n\n## Nội dung các chương người dùng ĐÃ ĐỌC (chương 1 → ${chapterNum})\n${recap}\nDùng đoạn này để trả lời chính xác khi người dùng hỏi lại nội dung đã đọc — không bịa thêm ngoài đây.`
    : "";

  const latestChapNum = lastChapters?.length
    ? Math.max(...lastChapters.map((c) => c.chapter_num))
    : null;

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

  const factsLines = [
    `- Tổng số chương: ${totalChaps ?? "Chưa rõ"}`,
    latestChapNum != null ? `- Chương mới nhất: Chương ${latestChapNum}` : null,
    chapterNum ? `- Người dùng đang ở: Chương ${chapterNum}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `Bạn là trợ lý AI của DH.Story — nền tảng đọc truyện tranh trực tuyến.

## Truyện đang hỗ trợ
- Tên: ${story.title}
- Tác giả: ${story.author || "Không rõ"}
- Thể loại: ${genres || "Không rõ"}
- Mô tả: ${story.description || "Không có mô tả"}${summaryLine}${progressLine}${chapterListText}${prefLine}${recapBlock}

## Dữ liệu chính xác — trả lời trực tiếp từ đây, không suy đoán
${factsLines}

## Nguyên tắc trả lời
1. Luôn dùng tiếng Việt, thân thiện, ngắn gọn (không quá 4 đoạn)
2. Câu hỏi về số chương, chương mới nhất → trả lời thẳng từ "Dữ liệu chính xác" ở trên
3. Dựa vào thông tin được cung cấp — không bịa đặt nội dung chương
4. Tôn trọng tiến độ đọc: không tiết lộ nội dung chương người dùng chưa đọc
5. Nếu không biết chắc, hãy nói thật thay vì đoán mò
6. Nếu tin nhắn người dùng bắt đầu bằng [KẾT QUẢ TỪ THƯ VIỆN], đó là danh sách truyện gợi ý đã được tìm sẵn — hãy giới thiệu từng truyện ngắn gọn, hấp dẫn dựa trên dữ liệu đó
7. TUYỆT ĐỐI không tự đề xuất tên truyện cụ thể nào từ kiến thức của bạn — chỉ giới thiệu truyện khi có [KẾT QUẢ TỪ THƯ VIỆN]`;
}

/**
 * Định dạng kết quả search thành khối [KẾT QUẢ TỪ THƯ VIỆN] để tiêm vào tin nhắn
 * người dùng trước khi gửi AI — AI chỉ được giới thiệu truyện từ khối này.
 *
 * Mỗi truyện gồm tên, tác giả, thể loại và 100 ký tự đầu của mô tả (đủ để AI
 * viết lời giới thiệu, không tốn token thừa). Mảng rỗng → khối "0 truyện" kèm
 * hướng dẫn AI thông báo không tìm thấy và gợi ý người dùng mô tả lại.
 *
 * @param {Array<object>} stories - Kết quả từ searchByDescription().
 * @returns {string} Khối context dạng text.
 */
function buildRecommendContext(stories) {
  if (!stories.length) {
    return "[KẾT QUẢ TỪ THƯ VIỆN — 0 truyện]\n\nThư viện DH.Story không tìm thấy truyện phù hợp. Hãy thông báo điều này và gợi ý người dùng mô tả lại (ví dụ: thể loại cụ thể, đặc điểm nhân vật, bối cảnh).";
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
/**
 * Trích giá trị cookie `authToken` từ raw Cookie header.
 * Socket.io handshake không đi qua middleware cookie-parser của Express
 * nên phải tự parse bằng regex.
 * @param {string|undefined} cookieHeader - Header `Cookie` thô từ handshake.
 * @returns {string|null} JWT token, hoặc null nếu không có.
 */
function parseCookieToken(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)authToken=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Xác thực người dùng từ Socket.io connection: lấy JWT từ cookie handshake
 * rồi verify chữ ký. Đây là chốt auth thật của chat qua socket (thay cho
 * authMiddleware vốn chỉ áp dụng cho HTTP route).
 * @param {import("socket.io").Socket} socket
 * @returns {object|null} Payload JWT đã decode ({ userId, ... }), null nếu chưa đăng nhập / token hỏng / hết hạn.
 */
function getUserFromSocket(socket) {
  try {
    const token = parseCookieToken(socket.handshake.headers.cookie);
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Kiểm tra + ghi nhận cooldown chống spam chat: mỗi user chỉ được gửi 1 tin
 * mỗi CHAT_COOLDOWN_MS (2s). Tính theo userId chứ không theo socket để user
 * mở nhiều tab không lách được giới hạn. Nếu hợp lệ thì đồng thời cập nhật
 * mốc thời gian mới (side effect có chủ đích).
 * @param {number} userId
 * @returns {boolean} true nếu được phép gửi.
 */
function checkCooldown(userId) {
  const now = Date.now();
  const lastTime = userCooldowns.get(userId) || 0;
  if (now - lastTime < CHAT_COOLDOWN_MS) return false;
  userCooldowns.set(userId, now);
  return true;
}

/**
 * Guard chung chạy đầu mọi socket event chat, gom 3 lớp kiểm tra theo thứ tự:
 *   1. Tin nhắn: phải là string không rỗng, ≤ MAX_MESSAGE_LENGTH (500) ký tự.
 *   2. Đăng nhập: JWT hợp lệ trong cookie (getUserFromSocket).
 *   3. Cooldown: chưa gửi tin nào trong 2s gần nhất (checkCooldown).
 *
 * @param {import("socket.io").Socket} socket
 * @param {unknown} message - Payload thô từ client (chưa tin cậy được kiểu).
 * @returns {{msg: string, userId: number}|null} Tin đã trim + userId khi hợp lệ;
 *   null khi vi phạm (đã tự emit `chatError` cho client, caller chỉ cần return).
 */
function guardChatEvent(socket, message) {
  const msg = typeof message === "string" ? message.trim() : "";
  if (!msg || msg.length > MAX_MESSAGE_LENGTH) {
    socket.emit("chatError", {
      message: msg ? `Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự` : "Tin nhắn không được trống",
    });
    return null;
  }

  const decoded = getUserFromSocket(socket);
  if (!decoded) {
    socket.emit("chatError", { message: "Vui lòng đăng nhập để dùng tính năng này" });
    return null;
  }
  if (!checkCooldown(decoded.userId)) {
    socket.emit("chatError", { message: "Vui lòng chờ trước khi gửi tin tiếp theo" });
    return null;
  }

  return { msg, userId: decoded.userId };
}

/**
 * Emit event `chatStories` gửi danh sách truyện gợi ý cho client render thành
 * card có ảnh bìa (đẹp hơn text thuần trong bubble chat). Chỉ pick các field
 * cần hiển thị — không lộ description/metadata thừa. Mảng rỗng → không emit gì.
 * @param {import("socket.io").Socket} socket
 * @param {Array<object>} stories - Truyện đã được AI gợi ý trong lượt chat này.
 */
function emitStoryCards(socket, stories) {
  if (!stories.length) return;
  socket.emit("chatStories", {
    stories: stories.map(({ id, title, author, cover_url, genres }) => ({
      id, title, author, cover_url, genres,
    })),
  });
}

/**
 * Chạy tìm kiếm truyện cho chatbot: gọi searchByDescription (ES + AI expand +
 * SQL fallback) rồi đóng gói kết quả thành khối context [KẾT QUẢ TỪ THƯ VIỆN].
 * @param {string} query - Từ khóa đã trích từ intent người dùng.
 * @param {number|null} excludeId - ID truyện đang đọc cần loại khỏi kết quả.
 * @returns {Promise<{stories: Array<object>, context: string}>}
 */
async function runSearch(query, excludeId) {
  const stories = await searchByDescription({
    query: query || "",
    excludeId: excludeId || null,
    limit: RECOMMEND_RESULT_LIMIT,
  });
  return { stories, context: buildRecommendContext(stories) };
}

/**
 * Phát hiện intent tìm kiếm & trích xuất từ khóa từ tin nhắn người dùng —
 * dùng model nhỏ qua callAIRaw (temperature 0, maxTokens 25) để nhanh và deterministic.
 *
 * Hai mức độ nhạy theo mode:
 *   - 'story': rất conservative — chỉ trả từ khóa khi user NÓI RÕ muốn tìm truyện KHÁC
 *     ("gợi ý truyện tương tự"...); hỏi về nội dung/nhân vật truyện đang đọc → NONE.
 *   - 'library': rộng — hầu hết câu hỏi trong chat thư viện đều là tìm truyện.
 *
 * @param {string} userMessage - Tin nhắn gốc của người dùng.
 * @param {string} [mode="library"] - 'story' | 'library'.
 * @returns {Promise<string|null>} Từ khóa tìm kiếm, hoặc null nếu không có intent / AI lỗi
 *   (lỗi được nuốt — thiếu search chỉ làm câu trả lời kém phong phú, không được chặn chat).
 */
async function getSearchIntent(userMessage, mode = "library") {
  const prompt =
    mode === "story"
      ? `Người dùng đang đọc một truyện và gửi tin nhắn: "${userMessage}"

Nhiệm vụ: Xác định người dùng có muốn TÌM TRUYỆN KHÁC hoặc GỢI Ý TRUYỆN MỚI không.
- Chỉ trả về từ khóa nếu user nói rõ muốn: "gợi ý truyện tương tự", "tìm truyện khác", "truyện nào hay như vậy", "recommend truyện", v.v.
- Nếu user hỏi về nội dung, nhân vật, cốt truyện, chương của truyện đang đọc → chỉ trả về: NONE
- Nếu KHÔNG chắc → trả về: NONE

Chỉ trả về từ khóa tìm kiếm hoặc NONE, không giải thích.`
      : `Tin nhắn người dùng: "${userMessage}"

Nhiệm vụ: Xác định người dùng có muốn tìm/được gợi ý truyện không.
- Nếu CÓ → trả về từ khóa tìm kiếm ngắn gọn (thể loại, chủ đề, đặc điểm, v.v.)
- Nếu KHÔNG → chỉ trả về: NONE

Chỉ trả về từ khóa hoặc NONE, không giải thích.`;

  try {
    const result = await callAIRaw(
      [{ role: "user", content: prompt }],
      { temperature: 0, maxTokens: 25 }
    );
    const q = (result || "").trim();
    return q && q.toUpperCase() !== "NONE" ? q : null;
  } catch {
    return null;
  }
}

// Keyword pre-filter cho story mode — chỉ trigger search khi user nói rõ muốn tìm truyện khác.
// Dùng keyword thay vì gọi AI để tránh false positive và loại bỏ latency thừa.
const STORY_SEARCH_TRIGGERS = [
  'tìm truyện', 'gợi ý truyện', 'recommend truyện', 'đề xuất truyện',
  'truyện tương tự', 'truyện giống', 'truyện khác', 'truyện như vậy',
  'truyện nào hay', 'truyện nên đọc', 'có truyện nào',
  'tương tự', 'nội dung tương tự', 'thể loại tương tự',
  'truyện isekai', 'truyện fantasy', 'truyện action', 'truyện romance',
  'gợi ý', 'recommend', 'đề xuất',
];

/**
 * Kiểm tra nhanh (không gọi AI) tin nhắn trong story mode có chứa cụm từ thể hiện
 * ý muốn tìm truyện khác không — khớp substring không phân biệt hoa thường với
 * danh sách STORY_SEARCH_TRIGGERS.
 * @param {string} message
 * @returns {boolean} true nếu nên kích hoạt luồng tìm kiếm gợi ý.
 */
function storyModeWantsSearch(message) {
  const lower = message.toLowerCase();
  return STORY_SEARCH_TRIGGERS.some((kw) => lower.includes(kw));
}

// ── Handler chung cho cả 2 mode ───────────────────────────────────────────────
/**
 * Lõi xử lý 1 lượt chat, dùng chung cho cả story mode và library mode:
 *
 *   1. Xác định có cần tìm truyện không:
 *      - story mode: pre-filter keyword (storyModeWantsSearch) trước, rồi mới gọi AI
 *        trích từ khóa; AI không trích được → dùng nguyên tin nhắn làm query.
 *      - library mode: luôn thử trích từ khóa bằng AI (getSearchIntent).
 *   2. Có từ khóa → emit `chatThinking` (client hiện trạng thái "đang tìm..."),
 *      chạy runSearch rồi TIÊM khối [KẾT QUẢ TỪ THƯ VIỆN] vào tin nhắn cuối
 *      để AI giới thiệu đúng truyện có thật trong thư viện.
 *   3. Gọi callAIStream — từng chunk được emit ngay qua event `chatChunk`.
 *
 * Lỗi ở bước intent/search chỉ log warn rồi chat tiếp bình thường (best-effort).
 *
 * @param {object} opts
 * @param {import("socket.io").Socket} opts.socket
 * @param {Array<{role, content}>} opts.messages - [system, ...history, user] đã dựng sẵn.
 * @param {string} opts.thinkingStatus - Text hiển thị khi đang tìm kiếm.
 * @param {number|null} opts.excludeId - ID truyện đang đọc (loại khỏi gợi ý), null ở library mode.
 * @param {string} [opts.mode="library"] - 'story' | 'library'.
 * @returns {Promise<{fullReply: string, recommendedStories: Array<object>}>}
 *   Câu trả lời đầy đủ (để lưu DB) + danh sách truyện đã gợi ý (để lưu metadata & emit card).
 */
async function runAgenticChat({ socket, messages: inMessages, thinkingStatus, excludeId, mode = "library" }) {
  const messages = [...inMessages];
  const userMessage = messages[messages.length - 1]?.content || "";
  let recommendedStories = [];

  try {
    // Story mode: keyword pre-filter đã xác nhận intent — dùng "library" prompt để extract query
    // (broad, không có "return NONE if unsure") thay vì story prompt vốn rất conservative.
    // Fallback về userMessage nếu AI extraction vẫn không trả về gì.
    const shouldSearch = mode === "story" ? storyModeWantsSearch(userMessage) : true;
    let searchQuery = null;
    if (shouldSearch) {
      searchQuery = await getSearchIntent(userMessage, mode === "story" ? "library" : mode);
      if (!searchQuery && mode === "story") searchQuery = userMessage;
    }
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
/**
 * Đăng ký các Socket.io event handler cho chatbot — gọi 1 lần từ app.js khi khởi động.
 *
 * Event nhận từ client:
 *   - `chatMessage`   { storyId, message, chapterNum } — chat trong trang đọc truyện (story mode).
 *   - `libraryMessage` { message } — chat tổng ở widget thư viện (library mode).
 *
 * Event server emit về client:
 *   - `chatThinking` { status }  — đang tìm truyện trong thư viện.
 *   - `chatChunk`    { chunk }   — từng mẩu text AI đang sinh (streaming).
 *   - `chatDone`     { reply }   — AI trả lời xong, kèm full text.
 *   - `chatStories`  { stories } — card truyện gợi ý (nếu có).
 *   - `chatError`    { message } — lỗi validate/auth/server.
 *
 * @param {import("socket.io").Server} io - Socket.io server instance.
 */
function initChat(io) {
  io.on("connection", (socket) => {
    // ── Story mode ────────────────────────────────────────────────────────────
    // Luồng: validate storyId → guard (msg/auth/cooldown) → load song song mọi ngữ
    // cảnh (truyện, chương, history, recap, sở thích) → lưu tin user vào DB →
    // dựng system prompt → runAgenticChat stream trả lời → lưu tin assistant
    // (kèm metadata story_ids nếu có gợi ý) → emit chatDone + card truyện.
    // Lỗi giữa chừng: xóa tin user vừa lưu (rollback thủ công) để history không
    // chứa câu hỏi chưa từng được trả lời.
    socket.on("chatMessage", async ({ storyId, message, chapterNum }) => {
      const sid = parseInt(storyId);
      if (!sid || sid <= 0) {
        return socket.emit("chatError", { message: "Story không hợp lệ" });
      }

      const guard = guardChatEvent(socket, message);
      if (!guard) return;
      const { msg, userId } = guard;

      const chapNum = chapterNum != null ? parseFloat(chapterNum) : null;
      const validChapNum = chapNum > 0 ? chapNum : null;

      // Dùng pool.query trực tiếp (mỗi query tự mượn–trả connection): KHÔNG giữ một client
      // cố định suốt lượt gọi AI streaming (tới 45s) — tránh giam connection làm cạn pool.
      let userMsgId = null;
      try {
        // Load tất cả dữ liệu song song
        const [storyRow, chapResult, lastChapResult, historyRows, totalChapsRow, userGenres, recap] = await Promise.all([
          pool.query(
            "SELECT id, title, author, genres, description, ai_summary FROM stories WHERE id = $1",
            [sid]
          ),
          pool.query(
            "SELECT chapter_num, title FROM chapters WHERE story_id = $1 ORDER BY chapter_num ASC LIMIT $2",
            [sid, CHAPTER_CONTEXT_LIMIT]
          ),
          pool.query(
            "SELECT chapter_num FROM chapters WHERE story_id = $1 ORDER BY chapter_num DESC LIMIT $2",
            [sid, CHAPTER_LAST_LIMIT]
          ),
          pool.query(
            `SELECT role, content FROM chat_messages
             WHERE user_id = $1 AND story_id = $2
             ORDER BY created_at DESC LIMIT $3`,
            [userId, sid, HISTORY_LIMIT]
          ),
          pool.query("SELECT COUNT(*) AS total FROM chapters WHERE story_id = $1", [sid]),
          getUserTopGenres(pool, userId),
          validChapNum ? getReadingRecap(sid, validChapNum).catch(() => null) : Promise.resolve(null),
        ]);

        if (!storyRow.rows.length) {
          return socket.emit("chatError", { message: "Không tìm thấy truyện" });
        }

        const story = storyRow.rows[0];
        const totalChaps = parseInt(totalChapsRow.rows[0]?.total) || 0;
        const history = trimHistoryToFit([...historyRows.rows].reverse());

        const insertResult = await pool.query(
          "INSERT INTO chat_messages (user_id, story_id, role, content) VALUES ($1, $2, 'user', $3) RETURNING id",
          [userId, sid, msg]
        );
        userMsgId = insertResult.rows[0].id;

        const messages = [
          { role: "system", content: buildSystemPrompt(story, validChapNum, chapResult.rows, lastChapResult.rows, totalChaps, userGenres, recap) },
          ...history.map((r) => ({ role: r.role, content: r.content })),
          { role: "user", content: msg },
        ];

        const { fullReply, recommendedStories } = await runAgenticChat({
          socket,
          messages,
          excludeId: sid,
          thinkingStatus: "Đang tìm truyện phù hợp...",
          mode: "story",
        });

        if (!fullReply) throw new Error("AI trả về nội dung rỗng");

        const storyMetaJson = recommendedStories.length
          ? JSON.stringify({ story_ids: recommendedStories.map((s) => s.id) })
          : null;
        await pool.query(
          "INSERT INTO chat_messages (user_id, story_id, role, content, metadata) VALUES ($1, $2, 'assistant', $3, $4)",
          [userId, sid, fullReply, storyMetaJson]
        );

        socket.emit("chatDone", { reply: fullReply });
        emitStoryCards(socket, recommendedStories);
      } catch (err) {
        console.error("[chatRoutes] chatMessage:", err);
        if (userMsgId) {
          await pool.query("DELETE FROM chat_messages WHERE id = $1", [userMsgId]).catch(() => {});
        }
        socket.emit("chatError", { message: "Lỗi server, vui lòng thử lại" });
      }
    });

    // ── Library mode ──────────────────────────────────────────────────────────
    // Như chatMessage nhưng không gắn với truyện nào (story_id = NULL trong DB):
    // ngữ cảnh là tổng quan thư viện (getLibraryContext) thay vì metadata 1 truyện,
    // và luôn sẵn sàng tìm kiếm gợi ý theo mọi câu hỏi.
    socket.on("libraryMessage", async ({ message }) => {
      const guard = guardChatEvent(socket, message);
      if (!guard) return;
      const { msg, userId } = guard;

      // Dùng pool.query trực tiếp — không giữ client cố định suốt lượt gọi AI (xem chatMessage).
      let userMsgId = null;
      try {
        const [libCtx, historyRows, userGenres] = await Promise.all([
          getLibraryContext(),
          pool.query(
            `SELECT role, content FROM chat_messages
             WHERE user_id = $1 AND story_id IS NULL
             ORDER BY created_at DESC LIMIT $2`,
            [userId, HISTORY_LIMIT]
          ),
          getUserTopGenres(pool, userId),
        ]);

        const history = trimHistoryToFit([...historyRows.rows].reverse());

        const insertResult = await pool.query(
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
        await pool.query(
          "INSERT INTO chat_messages (user_id, story_id, role, content, metadata) VALUES ($1, NULL, 'assistant', $2, $3)",
          [userId, fullReply, libMetaJson]
        );

        socket.emit("chatDone", { reply: fullReply });
        emitStoryCards(socket, recommendedStories);
      } catch (err) {
        console.error("[chatRoutes] libraryMessage:", err);
        if (userMsgId) {
          await pool.query("DELETE FROM chat_messages WHERE id = $1", [userMsgId]).catch(() => {});
        }
        socket.emit("chatError", { message: "Lỗi server, vui lòng thử lại" });
      }
    });
  });
}

// ── HTTP routes ───────────────────────────────────────────────────────────────
const router = express.Router();

/**
 * GET /api/chat/history?story_id=N — Tải lịch sử chat để widget hiển thị lại khi mở.
 *
 * - Có story_id → lịch sử chat của truyện đó; không có → lịch sử library mode
 *   (story_id IS NULL). Trả tối đa HISTORY_DISPLAY_LIMIT (50) tin, cũ → mới.
 * - Tin assistant có metadata.story_ids (từng gợi ý truyện) → batch-fetch tất cả
 *   truyện bằng 1 query ANY($1::int[]) rồi gắn vào field `story_cards` để client
 *   render lại card; truyện đã bị xóa được lọc bỏ êm.
 * - Chỉ trả tin của chính user đang đăng nhập (authMiddleware + WHERE user_id).
 */
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
        [req.user.userId, storyId, HISTORY_DISPLAY_LIMIT]
      );
    } else {
      result = await pool.query(
        `SELECT id, role, content, metadata, created_at FROM chat_messages
         WHERE user_id = $1 AND story_id IS NULL
         ORDER BY created_at ASC LIMIT $2`,
        [req.user.userId, HISTORY_DISPLAY_LIMIT]
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

/**
 * DELETE /api/chat/history?story_id=N — Người dùng xóa lịch sử chat của mình.
 * Có story_id → chỉ xóa hội thoại với truyện đó; không có → xóa lịch sử library mode.
 * Scope theo user_id từ JWT nên không thể xóa nhầm chat của người khác.
 */
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
        [req.user.userId, storyId]
      );
    } else {
      await pool.query(
        "DELETE FROM chat_messages WHERE user_id = $1 AND story_id IS NULL",
        [req.user.userId]
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

/**
 * GET /api/admin/chat/stats — Số liệu tổng quan chatbot cho trang admin (Admin only).
 *
 * 5 query chạy song song: tổng tin nhắn toàn hệ thống, tin hôm nay, tin 7 ngày,
 * số user hoạt động 7 ngày, và hoạt động theo ngày (tách cột user/assistant,
 * ngày tính theo múi giờ Asia/Ho_Chi_Minh để cột "hôm nay" khớp giờ Việt Nam)
 * — dùng vẽ biểu đồ dashboard.
 */
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

/**
 * GET /api/admin/chat/logs — Xem log chat toàn hệ thống, phân trang (Admin only).
 *
 * Query params: page, limit (tối đa 50), mode (all | library | story),
 * user_id, story_id — điều kiện WHERE được build động nhưng luôn parameterized.
 * JOIN thêm tên truyện + username/email để admin đọc log không phải tra ID.
 * Trả { total, page, totalPages, messages } sắp xếp mới nhất trước.
 */
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

/**
 * DELETE /api/admin/chat/messages/:id — Admin xóa 1 tin nhắn chat bất kỳ
 * (nội dung vi phạm, v.v.). RETURNING id để phân biệt 404 (không tồn tại)
 * với xóa thành công.
 */
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
