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

module.exports = { callAI };