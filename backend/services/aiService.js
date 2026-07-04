const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUMMARY_MODEL = "llama-3.1-8b-instant";
const CHAT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const VISION_MAX_IMAGES = 5; // Giới hạn cứng của Groq cho model vision

if (!GROQ_API_KEY) {
  console.warn("⚠️ GROQ_API_KEY not set");
}

async function callAI(prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
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

async function callAIStream(messages, onChunk, temperature = 0.7, timeoutMs = 45000) {
  const { default: fetch } = await import("node-fetch");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
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

async function callAIRaw(messages, { temperature = 0.2, maxTokens = 120, timeoutMs = 8000 } = {}) {
  const { default: fetchNode } = await import("node-fetch");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchNode("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
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

// Groq trả message dạng "...Please try again in 14.036s..." khi rate limit — đọc đúng thời gian
// chờ server đề xuất thay vì đoán, tránh retry quá sớm gây lặp lại lỗi.
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

function delayUntil(timestamp) {
  const waitMs = timestamp - Date.now();
  return waitMs > 0 ? new Promise((r) => setTimeout(r, waitMs)) : Promise.resolve();
}

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

      const { default: fetchNode } = await import("node-fetch");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res;
      try {
        res = await fetchNode("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
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