const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_HEADERS = {
  Authorization: `Bearer ${GROQ_API_KEY}`,
  "Content-Type": "application/json",
};
const SUMMARY_MODEL = "llama-3.1-8b-instant";
const CHAT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const VISION_MAX_IMAGES = 5; // Giới hạn cứng của Groq cho model vision

if (!GROQ_API_KEY) {
  console.warn("⚠️ GROQ_API_KEY not set");
}

/**
 * Gọi Groq AI (model text nhỏ `llama-3.1-8b-instant`) để tóm tắt truyện — non-streaming.
 *
 * System prompt cố định ràng buộc AI: chỉ tóm tắt từ dữ liệu được cung cấp, không suy
 * đoán, không spoil kết truyện; nếu thiếu dữ liệu phải trả về "Không đủ dữ liệu để tóm tắt".
 * Temperature 0.3 để kết quả ổn định, ít "sáng tạo".
 *
 * @param {string} prompt - Nội dung cần tóm tắt (description hoặc các chapter summary đã gộp).
 * @returns {Promise<string>} Đoạn văn tóm tắt.
 * @throws {Error} Khi Groq API trả lỗi hoặc không sinh được nội dung.
 */
async function callAI(prompt) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: GROQ_HEADERS,
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Bạn là AI chuyên tóm tắt truyện tiếng Việt cho website đọc truyện. " +
            "Quy tắc: Không tự suy đoán nội dung. Không hỏi thêm thông tin. " +
            'Nếu dữ liệu không đủ, trả về: "Không đủ dữ liệu để tóm tắt". ' +
            "Không tiết lộ nội dung quan trọng hoặc kết truyện.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    console.error("[aiService] callAI error:", raw);
    throw new Error("Groq API lỗi");
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI không tạo được nội dung");
  return content;
}

/**
 * Gọi Groq AI dạng streaming (SSE) — dùng cho chatbot, model chat lớn `llama-3.3-70b-versatile`.
 *
 * Đọc từng dòng `data: {...}` từ response body, parse JSON lấy delta content và đẩy ngay
 * cho caller qua callback `onChunk` (chatRoutes emit tiếp qua Socket.io tới client).
 * Buffer được cắt theo newline để xử lý chunk mạng bị đứt giữa dòng; dòng parse lỗi
 * (JSON dở dang) được bỏ qua an toàn. AbortController hủy request khi quá timeout.
 *
 * @param {Array<{role: string, content: string}>} messages - Hội thoại đầy đủ (system + history + tin mới).
 * @param {(chunk: string) => void} onChunk - Callback nhận từng mẩu text ngay khi AI sinh ra.
 * @param {number} [temperature=0.7] - Độ ngẫu nhiên (chat cần tự nhiên hơn tóm tắt).
 * @param {number} [timeoutMs=45000] - Thời gian tối đa cho cả lượt stream.
 * @returns {Promise<string>} Toàn bộ nội dung đã ghép lại (để lưu vào DB sau khi stream xong).
 * @throws {Error} Khi timeout, Groq API lỗi, hoặc lỗi mạng.
 */
async function callAIStream(messages, onChunk, temperature = 0.7, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: GROQ_HEADERS,
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        temperature,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("AI stream timeout sau 45 giây");
    throw err;
  }

  if (!res.ok) {
    clearTimeout(timer);
    const raw = await res.text();
    console.error("[aiService] callAIStream error:", raw);
    throw new Error("Groq API lỗi");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullContent = "";

  try {
    for await (const rawChunk of res.body) {
      buffer += decoder.decode(rawChunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const json = JSON.parse(trimmed.slice(6));
          const chunk = json.choices?.[0]?.delta?.content;
          if (chunk) {
            fullContent += chunk;
            onChunk(chunk);
          }
        } catch (_) {}
      }
    }
  } finally {
    clearTimeout(timer);
  }

  return fullContent;
}

/**
 * Gọi Groq AI "thô" — nhanh, rẻ, không system prompt, không streaming.
 *
 * Dùng model nhỏ `llama-3.1-8b-instant` cho các tác vụ phụ trợ cần latency thấp:
 * phát hiện intent tìm kiếm (chatRoutes), mở rộng từ khóa tìm kiếm (searchService).
 * Mặc định temperature 0.2 + maxTokens 120 vì các tác vụ này chỉ cần câu trả lời
 * ngắn, deterministic; timeout 8s để không kéo dài phản hồi chatbot.
 *
 * @param {Array<{role: string, content: string}>} messages - Messages gửi thẳng lên API.
 * @param {object} [options]
 * @param {number} [options.temperature=0.2]
 * @param {number} [options.maxTokens=120]
 * @param {number} [options.timeoutMs=8000]
 * @returns {Promise<string>} Nội dung AI trả về, chuỗi rỗng nếu không có.
 * @throws {Error} Khi timeout hoặc Groq API lỗi.
 */
async function callAIRaw(messages, { temperature = 0.2, maxTokens = 120, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: GROQ_HEADERS,
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("callAIRaw timeout");
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Groq API lỗi: ${raw.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Trích thời gian chờ (ms) từ message lỗi 429 của Groq.
 *
 * Groq trả message dạng "...Please try again in 14.036s..." khi rate limit — đọc đúng
 * thời gian chờ server đề xuất thay vì đoán, tránh retry quá sớm gây lặp lại lỗi.
 * Cộng thêm 500ms biên an toàn; nếu không parse được (format lạ) → mặc định 5000ms.
 *
 * @param {string} raw - Body text thô của response lỗi từ Groq.
 * @returns {number} Số millisecond cần chờ trước khi retry.
 */
function parseRateLimitDelayMs(raw) {
  try {
    const data = JSON.parse(raw);
    const match = /try again in ([\d.]+)s/i.exec(data?.error?.message || "");
    if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500; // +500ms biên an toàn
  } catch {}
  return 5000;
}

// Groq tính rate limit vision theo token/phút (TPM) trên toàn organization, không phải theo số request,
// nên phải tự ước lượng dựa trên usage thật trả về sau mỗi lượt gọi — gap cố định không đủ vì 1 batch
// ảnh có thể chiếm tới 40%+ quota của cả phút.
const VISION_TPM_LIMIT = 30000; // hạn mức tier on_demand hiện tại của Groq cho model vision
const VISION_TPM_SAFETY = 0.85; // chỉ tiêu thụ tối đa 85% quota — chừa biên cho sai số ước lượng

let _visionQueueTail = Promise.resolve(); // mutex — đảm bảo toàn app chỉ có 1 lượt gọi vision chạy cùng lúc
let _visionAvailableAt = 0; // epoch ms — thời điểm sớm nhất được phép gọi tiếp theo

/**
 * Chờ (sleep) đến đúng thời điểm `timestamp` (epoch ms); resolve ngay nếu đã qua.
 * @param {number} timestamp - Mốc thời gian epoch ms cần chờ tới.
 * @returns {Promise<void>}
 */
function delayUntil(timestamp) {
  const waitMs = timestamp - Date.now();
  return waitMs > 0 ? new Promise((r) => setTimeout(r, waitMs)) : Promise.resolve();
}

/**
 * Gọi Groq Vision AI (llama-4-scout) đọc trực tiếp ảnh chương truyện và trả lời theo prompt —
 * dùng cho tóm tắt chapter bằng vision (chapterSummaryService).
 *
 * Cơ chế điều phối để không vượt rate limit TPM (token/phút) toàn organization:
 *   1. Mutex hàng đợi (`_visionQueueTail`): mọi lượt gọi vision trong toàn app chạy
 *      nối tiếp — kể cả khi nhiều chapter được tóm tắt song song.
 *   2. Tự điều tốc (`_visionAvailableAt`): sau mỗi lượt thành công, dựa vào
 *      `usage.total_tokens` thật để tính thời điểm sớm nhất được gọi tiếp,
 *      chỉ tiêu thụ tối đa 85% quota (VISION_TPM_SAFETY).
 *   3. Retry 429: khi vẫn dính rate limit, chờ đúng thời gian Groq đề xuất
 *      (parseRateLimitDelayMs) rồi thử lại, tối đa `maxRetries` lần.
 *
 * @param {string[]} imageUrls - Danh sách URL/data-URI ảnh, tối đa VISION_MAX_IMAGES (5) ảnh/lượt.
 * @param {string} prompt - Câu hỏi/yêu cầu gửi kèm ảnh (vd: "tóm tắt diễn biến trong các trang này").
 * @param {object} [options]
 * @param {number} [options.temperature=0.3]
 * @param {number} [options.maxTokens=600]
 * @param {number} [options.timeoutMs=30000] - Timeout mỗi lần gọi (không tính thời gian xếp hàng).
 * @param {number} [options.maxRetries=3] - Số lần retry khi gặp 429.
 * @returns {Promise<string>} Nội dung vision model trả về.
 * @throws {Error} Khi số ảnh không hợp lệ, timeout, hết lượt retry, hoặc API lỗi.
 */
async function callVisionAI(imageUrls, prompt, { temperature = 0.3, maxTokens = 600, timeoutMs = 30000, maxRetries = 3 } = {}) {
  if (!imageUrls.length || imageUrls.length > VISION_MAX_IMAGES) {
    throw new Error(`callVisionAI chỉ nhận 1-${VISION_MAX_IMAGES} ảnh/lượt`);
  }

  const content = [
    { type: "text", text: prompt },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  // Giữ chỗ trong hàng đợi toàn app — lượt gọi vision từ chapter khác (đang chạy song song) phải chờ tới lượt
  const myTurn = _visionQueueTail;
  let releaseTurn;
  _visionQueueTail = new Promise((r) => { releaseTurn = r; });
  await myTurn;

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await delayUntil(_visionAvailableAt);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res;
      try {
        res = await fetch(GROQ_URL, {
          method: "POST",
          headers: GROQ_HEADERS,
          body: JSON.stringify({
            model: VISION_MODEL,
            messages: [{ role: "user", content }],
            temperature,
            max_tokens: maxTokens,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") throw new Error("callVisionAI timeout");
        throw err;
      }
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const totalTokens = data.usage?.total_tokens;
        if (totalTokens) {
          _visionAvailableAt = Date.now() + (totalTokens / (VISION_TPM_LIMIT * VISION_TPM_SAFETY)) * 60000;
        }
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error("Vision AI không tạo được nội dung");
        return text;
      }

      const raw = await res.text();

      if (res.status === 429 && attempt < maxRetries) {
        const delay = parseRateLimitDelayMs(raw);
        _visionAvailableAt = Date.now() + delay;
        console.warn(`[aiService] callVisionAI rate limit — chờ ${delay}ms rồi thử lại (lần ${attempt + 1}/${maxRetries})`);
        continue;
      }

      console.error("[aiService] callVisionAI error:", raw);
      throw new Error("Groq Vision API lỗi");
    }
  } finally {
    releaseTurn();
  }
}

module.exports = { callAI, callAIStream, callAIRaw, callVisionAI, VISION_MAX_IMAGES };