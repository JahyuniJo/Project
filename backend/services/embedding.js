const { OpenAI } = require("openai");

let openaiClient = null;
let _embeddingDisabled = false;
let _embeddingDisabledAt = null;
const EMBEDDING_RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 phút

if (process.env.OPENAI_KEY) {
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_KEY });
} else {
  console.warn("[embedding] OPENAI_KEY không được set — semantic search bị vô hiệu hoá");
}

// Cache theo nội dung văn bản — embedding là hàm thuần (cùng input + model → cùng vector),
// nên cache an toàn cho cả câu tìm kiếm lặp lại và văn bản truyện khi re-index
const EMBED_CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút
const _embedCache = new Map();

setInterval(() => {
  const cutoff = Date.now() - EMBED_CACHE_TTL_MS;
  for (const [key, entry] of _embedCache) {
    if (entry.ts < cutoff) _embedCache.delete(key);
  }
}, 60_000);

/**
 * Sinh vector embedding 1536 chiều cho 1 đoạn text bằng OpenAI
 * `text-embedding-3-small` — nền tảng của semantic search (KNN trên ES).
 *
 * Các lớp bảo vệ (embedding là tính năng TÙY CHỌN — mọi lỗi đều trả null
 * để search rơi êm về keyword, không bao giờ throw):
 *   - Không có OPENAI_KEY → null ngay.
 *   - Circuit breaker hết credit: lỗi 429 `insufficient_quota` → tự tắt 10 phút
 *     (tránh spam API + log trong khi chắc chắn thất bại) rồi tự thử lại.
 *   - 429 rate limit thường → chỉ log, không tắt (lỗi thoáng qua).
 *   - Cache theo nội dung (trim + lowercase, TTL 5 phút) — cùng câu tìm kiếm
 *     lặp lại không tốn thêm lượt gọi API.
 *
 * @param {string} text
 * @returns {Promise<number[]|null>} Vector embedding, hoặc null nếu không khả dụng.
 */
async function embedText(text) {
  if (!openaiClient) return null;

  // Hết thời gian chờ sau khi bị vô hiệu hoá do hết quota → cho thử lại
  if (_embeddingDisabled) {
    if (Date.now() - _embeddingDisabledAt < EMBEDDING_RETRY_INTERVAL_MS) return null;
    _embeddingDisabled = false;
  }

  const cacheKey = text.trim().toLowerCase();
  const cached = _embedCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < EMBED_CACHE_TTL_MS) return cached.vector;

  try {
    const res = await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    const vector = res.data[0].embedding;
    _embedCache.set(cacheKey, { vector, ts: Date.now() });
    return vector;
  } catch (err) {
    if (err.status === 429) {
      const code = err.error?.code;
      if (code === "insufficient_quota") {
        _embeddingDisabled = true;
        _embeddingDisabledAt = Date.now();
        console.warn(`[embedding] Không đủ credit OpenAI — tạm vô hiệu hoá ${EMBEDDING_RETRY_INTERVAL_MS / 60000} phút, vào platform.openai.com/settings/billing để nạp tiền`);
      } else {
        // rate_limit_exceeded — tạm thời, không disable vĩnh viễn
        console.warn("[embedding] OpenAI rate limit, thử lại sau:", err.message);
      }
    } else {
      console.error("[embedding] embedText lỗi:", err.status, err.message || err.name);
    }
    return null;
  }
}

/**
 * Sinh embedding đại diện cho 1 TRUYỆN: ghép title + author + genres +
 * description (+ ai_summary nếu có) thành 1 văn bản rồi embedText.
 * Càng nhiều trường có nghĩa, vector càng phản ánh đúng nội dung truyện
 * khi so cosine với câu tìm kiếm của người dùng.
 *
 * @param {object} story - Row từ bảng stories.
 * @returns {Promise<number[]|null>} Vector cho field `embedding` trên ES, null nếu tắt.
 */
async function createStoryEmbedding(story) {
  if (!openaiClient) return null;
  const parts = [
    story.title,
    story.author,
    (story.genres || []).join(", "),
    story.description || "",
  ];
  if (story.ai_summary) parts.push(story.ai_summary);
  const text = parts.filter(Boolean).join("\n").trim();
  return embedText(text);
}

module.exports = { createStoryEmbedding, embedText };
