// Tính năng semantic search — chưa tích hợp vào searchService.js (OPENAI_KEY tuỳ chọn)
const { OpenAI } = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_KEY });

async function createStoryEmbedding(story) {
  const text = `
    Title: ${story.title}
    Genres: ${(story.genres || []).join(", ")}
    Tags: ${(story.tags || []).join(", ")}
    Description: ${story.description || ""}
  `.trim();

  const res = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: text,
  });

  return res.data[0].embedding;
}

module.exports = { createStoryEmbedding };
