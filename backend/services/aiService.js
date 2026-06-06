const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.warn("⚠️ GROQ_API_KEY not set");
}

async function callAI(prompt) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `
                Bạn là AI chuyên tóm tắt truyện tiếng Việt cho website đọc truyện.
                  Quy tắc:
                  - Không tự suy đoán nội dung
                  - Không hỏi thêm thông tin
                  - Nếu dữ liệu không đủ, trả về: "Không đủ dữ liệu để tóm tắt"
                  - Không tiết lộ nội dung quan trọng hoặc kết truyện
`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3
      })
    });

    const raw = await res.text();

    if (!res.ok) {
      console.error("GROQ RAW ERROR:", raw);
      return "⚠️ AI không phản hồi hợp lệ.";
    }

    const data = JSON.parse(raw);

    return data.choices?.[0]?.message?.content || "⚠️ AI không tạo được nội dung.";

  } catch (err) {
    console.error("GROQ ERROR:", err);
    return "⚠️ AI đang gặp sự cố.";
  }
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
        model: "llama-3.1-8b-instant",
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

module.exports = { callAI, callAIStream };