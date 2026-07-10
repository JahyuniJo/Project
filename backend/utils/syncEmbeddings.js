/**
 * Script CLI `npm run es:sync-embeddings` — bổ sung/cập nhật embedding OpenAI
 * cho các document truyện ĐÃ có sẵn trên Elasticsearch (partial update từng doc,
 * không re-index toàn bộ như es:sync).
 *
 * Dùng khi: bật OPENAI_KEY sau khi đã sync dữ liệu, hoặc muốn làm mới vector.
 * Chạy tuần tự + delay 250ms/truyện để tránh rate limit OpenAI; truyện sinh
 * embedding thất bại chỉ bị skip và thống kê lại cuối script, không dừng cả đợt.
 * Yêu cầu OPENAI_KEY trong .env — thiếu thì báo và thoát ngay.
 */
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
