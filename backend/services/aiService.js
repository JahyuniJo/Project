const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUMMARY_MODEL = "llama-3.1-8b-instant";
const CHAT_MODEL = "llama-3.3-70b-versatile";

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

module.exports = { callAI, callAIStream, callAIRaw };