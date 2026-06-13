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
      _embeddingDisabled = true;
      console.warn("[embedding] Quota vượt giới hạn — tắt embedding cho phiên này");
    } else {
      console.error("[embedding] embedText lỗi:", err.message || err.name);
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
