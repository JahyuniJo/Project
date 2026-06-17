const { OpenAI } = require("openai");

let openaiClient = null;
let _embeddingDisabled = false;

if (process.env.OPENAI_KEY) {
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_KEY });
} else {
  console.warn("[embedding] OPENAI_KEY không được set — semantic search bị vô hiệu hoá");
}

async function embedText(text) {
  if (!openaiClient || _embeddingDisabled) return null;
  try {
    const res = await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return res.data[0].embedding;
  } catch (err) {
    if (err.status === 429) {
      const code = err.error?.code;
      if (code === "insufficient_quota") {
        _embeddingDisabled = true;
        console.warn("[embedding] Không đủ credit OpenAI — vào platform.openai.com/settings/billing để nạp tiền");
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
