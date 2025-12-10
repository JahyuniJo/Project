import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_KEY });

export async function createStoryEmbedding(story) {
  const text = `
    Title: ${story.title}
    Genres: ${story.genres.join(", ")}
    Tags: ${story.tags.join(", ")}
    Description: ${story.description}
  `;

  const res = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: text
  });

  return res.data[0].embedding;
}
