require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

if (!process.env.OPENAI_KEY) {
  console.error(
    "[syncEmbeddings] OPENAI_KEY chưa được set.\n" +
      "Thêm OPENAI_KEY vào file .env rồi chạy lại: npm run es:sync-embeddings"
  );
  process.exit(1);
}

const pool = require("../config/pool");
const { client, indexName } = require("../config/elasticsearch");
const { createStoryEmbedding } = require("../services/embedding");

async function main() {
  const { rows: stories } = await pool.query("SELECT * FROM stories");
  const total = stories.length;
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const vector = await createStoryEmbedding(story);

    if (!vector) {
      console.warn(`[syncEmbeddings] ${i + 1}/${total} — "${story.title}" ✗ skip`);
      skipped++;
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }

    try {
      await client.update({
        index: indexName,
        id: String(story.id),
        doc: { embedding: vector },
      });
      console.log(`[syncEmbeddings] ${i + 1}/${total} — "${story.title}" ✓`);
      success++;
    } catch (err) {
      console.error(
        `[syncEmbeddings] ${i + 1}/${total} — "${story.title}" ✗ lỗi:`,
        err.message || err.name
      );
      failed++;
    }

    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(
    `\n[syncEmbeddings] Xong: ${success} thành công, ${failed} thất bại, ${skipped} skip (tổng ${total})`
  );
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[syncEmbeddings] Lỗi không mong đợi:", err);
    process.exitCode = 1;
    pool.end();
  });
