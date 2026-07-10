const axios = require("axios");
const sharp = require("sharp");
const pool = require("../config/pool");
const { callAI, callVisionAI, VISION_MAX_IMAGES } = require("./aiService");

const INTRO_CHAPTERS_LIMIT = 5;
const RECAP_DIRECT_JOIN_LIMIT = 15; // <= ngần này chương: nối thẳng, không cần tóm tắt phân cấp
const RECAP_GROUP_SIZE = 10;
const RECAP_CACHE_TTL_MS = 10 * 60 * 1000;
const VISION_SAFE_PIXELS = 30_000_000; // dưới giới hạn cứng 33.177.600px của Groq, chừa biên an toàn
const VISION_MAX_DIMENSION = 768; // giảm token/lượt gọi — vision model không cần ảnh full-res để tóm tắt nội dung
const VISION_MIN_DIMENSION = 16; // bỏ ảnh dải phân cách/banner mỏng — không phải nội dung truyện, Groq từ chối ảnh < 2px

// Ngăn gọi vision trùng cho cùng 1 chapter khi user F5 trong lúc đang xử lý
const _pendingChapterSummaries = new Set();

/**
 * Chia mảng thành các mảng con kích thước `size` (mảng cuối có thể ngắn hơn) —
 * dùng chia ảnh theo batch 5 ảnh/lượt vision và chia chương theo nhóm 10 khi recap.
 * @param {Array} arr
 * @param {number} size
 * @returns {Array<Array>}
 */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Tải 1 ảnh chương về, resize cho vừa giới hạn của Groq vision, encode thành
 * data-URI JPEG base64 sẵn sàng gửi lên API.
 *
 * Vì sao không gửi thẳng URL gốc: Groq từ chối ảnh > 33.177.600 px và tính phí
 * theo kích thước — ảnh scan truyện tranh (rất dài) thường vượt cả hai mức.
 *
 * Quy trình: tải (timeout 15s, giả User-Agent trình duyệt vì nguồn chặn bot)
 * → đọc kích thước bằng sharp → loại ảnh suy biến (cạnh ngắn < 16px: dải phân
 * cách/banner, không phải nội dung) → scale xuống dưới 30M pixel → ép cạnh dài
 * ≤ 768px (giảm token) → chặn sàn 2px mỗi chiều (Groq yêu cầu tối thiểu)
 * → JPEG quality 80 → base64.
 *
 * @param {string} url - URL ảnh gốc từ chapter_contents.
 * @returns {Promise<string|null>} Data-URI, hoặc null khi ảnh lỗi/rỗng/bị chặn —
 *   caller bỏ qua ảnh đó thay vì làm hỏng cả batch.
 */
async function fetchAndResizeImage(url) {
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      validateStatus: (s) => s >= 200 && s < 300,
    });

    const buffer = Buffer.from(res.data);
    if (!buffer.length) return null;

    const image = sharp(buffer, { failOn: "none" });
    const meta = await image.metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;

    // Ảnh suy biến (dải phân cách, banner mỏng, pixel trống) — không có nội dung truyện, bỏ qua
    if (Math.min(width, height) < VISION_MIN_DIMENSION) return null;

    const pixels = width * height;
    let targetWidth = width;
    let targetHeight = height;

    if (pixels > VISION_SAFE_PIXELS) {
      const scale = Math.sqrt(VISION_SAFE_PIXELS / pixels);
      targetWidth = Math.floor(width * scale);
      targetHeight = Math.floor(height * scale);
    }

    const longestSide = Math.max(targetWidth, targetHeight);
    if (longestSide > VISION_MAX_DIMENSION) {
      const scale = VISION_MAX_DIMENSION / longestSide;
      targetWidth = Math.floor(targetWidth * scale);
      targetHeight = Math.floor(targetHeight * scale);
    }

    // Groq yêu cầu tối thiểu 2px mỗi chiều — chặn floor về 0/1 với ảnh tỉ lệ cực đoan
    targetWidth = Math.max(2, targetWidth);
    targetHeight = Math.max(2, targetHeight);

    let pipeline = image;
    if (targetWidth !== width || targetHeight !== height) {
      pipeline = pipeline.resize({ width: targetWidth, height: targetHeight });
    }

    const jpegBuffer = await pipeline.jpeg({ quality: 80 }).toBuffer();
    return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
  } catch (err) {
    console.warn(`[chapterSummaryService] bỏ qua ảnh lỗi: ${url} — ${err.message}`);
    return null;
  }
}

/**
 * Tóm tắt diễn biến của 1 BATCH ảnh (tối đa 5 trang liên tiếp) bằng vision model.
 * Chuẩn bị tất cả ảnh song song, lọc ảnh hỏng, rồi gửi 1 lượt callVisionAI với
 * prompt yêu cầu mô tả nội dung diễn biến (nhân vật, hành động, thoại) 2-4 câu.
 *
 * @param {string[]} images - URL ảnh gốc của batch.
 * @param {string} batchLabel - Nhãn vị trí ("trang 1-5") để AI hiểu ngữ cảnh thứ tự.
 * @returns {Promise<string|null>} Mô tả diễn biến, null nếu cả batch không còn ảnh hợp lệ.
 */
async function summarizeImageBatch(images, batchLabel) {
  const prepared = (await Promise.all(images.map(fetchAndResizeImage))).filter(Boolean);
  if (!prepared.length) return null;

  const prompt = `Đây là ${prepared.length} trang ảnh liên tiếp (${batchLabel}) trong 1 chương truyện tranh tiếng Việt.
Hãy mô tả ngắn gọn diễn biến chính xảy ra trong các trang này: nhân vật, hành động, lời thoại quan trọng (nếu đọc được chữ trong ảnh).
Không cần mô tả chi tiết bố cục hình ảnh, chỉ cần nội dung diễn biến. Viết bằng tiếng Việt, 2-4 câu.`;
  return callVisionAI(prepared, prompt);
}

/**
 * Cô đặc mô tả của nhiều batch thành 1 đoạn tóm tắt duy nhất cho cả chương
 * bằng 1 lượt gọi text model (rẻ hơn vision). Chương chỉ có 1 batch → trả
 * thẳng, không tốn thêm lượt gọi AI.
 * @param {string[]} batchDescriptions - Mô tả từng batch, đúng thứ tự trang.
 * @returns {Promise<string>} Tóm tắt hoàn chỉnh 5-8 câu của chương.
 */
async function condenseBatchDescriptions(batchDescriptions) {
  if (batchDescriptions.length === 1) return batchDescriptions[0].trim();

  const joined = batchDescriptions
    .map((d, i) => `[Phần ${i + 1}]\n${d}`)
    .join("\n\n");
  const prompt = `Dưới đây là mô tả diễn biến của từng phần (theo đúng thứ tự) trong 1 chương truyện tranh:

${joined}

Hãy viết lại thành 1 đoạn tóm tắt mạch lạc, đầy đủ diễn biến của chương, bằng tiếng Việt, súc tích (5-8 câu).`;
  return callAI(prompt);
}

/**
 * Pipeline tóm tắt 1 CHƯƠNG từ ảnh thật — được chapterRoutes gọi FIRE-AND-FORGET
 * ngay sau lần crawl ảnh đầu tiên (không block response trả ảnh cho người đọc).
 *
 * Các bước:
 *   1. Chống trùng 2 lớp: Set `_pendingChapterSummaries` đăng ký ĐỒNG BỘ trước
 *      mọi await (chặn 2 request F5 cùng lúc), rồi check DB đã có summary chưa
 *      (chặn chạy lại giữa các lần khởi động server).
 *   2. Chia ảnh thành batch 5 ảnh → summarizeImageBatch từng batch TUẦN TỰ
 *      (mutex + điều tốc TPM nằm trong callVisionAI); batch lỗi bị bỏ qua.
 *   3. condenseBatchDescriptions gộp thành 1 summary/chương.
 *   4. Lưu vào `chapter_summaries` (ON CONFLICT DO NOTHING) kèm tên model.
 *
 * Kết quả nuôi 2 tính năng: ai_summary giới thiệu truyện (aggregateIntroSummary)
 * và recap tiến độ đọc cho chatbot (getReadingRecap).
 *
 * @param {number} chapterId
 * @param {number} storyId - Denormalize vào bảng để query range không cần JOIN.
 * @param {number} chapterNum
 * @param {string[]} imageUrls - Ảnh vừa crawl của chương.
 */
async function summarizeChapterImages(chapterId, storyId, chapterNum, imageUrls) {
  if (!imageUrls?.length) return;
  // Đăng ký pending NGAY (đồng bộ) để chặn request thứ hai cho cùng chapter chen vào trước khi
  // DB check kịp chạy — tránh hai lượt tóm tắt song song đốt cùng một quota token.
  if (_pendingChapterSummaries.has(chapterId)) return;
  _pendingChapterSummaries.add(chapterId);

  try {
    const existing = await pool.query(
      "SELECT 1 FROM chapter_summaries WHERE chapter_id = $1",
      [chapterId]
    );
    if (existing.rows.length) return;

    const batches = chunk(imageUrls, VISION_MAX_IMAGES);
    const batchDescriptions = [];
    for (let i = 0; i < batches.length; i++) {
      const label = `trang ${i * VISION_MAX_IMAGES + 1}-${i * VISION_MAX_IMAGES + batches[i].length}`;
      const desc = await summarizeImageBatch(batches[i], label);
      if (desc) batchDescriptions.push(desc);
    }

    if (!batchDescriptions.length) {
      console.warn(`[chapterSummaryService] chapter ${chapterId}: không tóm tắt được ảnh nào`);
      return;
    }

    const summary = await condenseBatchDescriptions(batchDescriptions);

    await pool.query(
      `INSERT INTO chapter_summaries (chapter_id, story_id, chapter_num, summary, model)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (chapter_id) DO NOTHING`,
      [chapterId, storyId, chapterNum, summary, process.env.GROQ_VISION_MODEL || null]
    );
  } finally {
    _pendingChapterSummaries.delete(chapterId);
  }
}

/**
 * Sinh đoạn GIỚI THIỆU truyện (không spoil) từ tóm tắt của tối đa 5 chương đầu
 * trong `chapter_summaries` — nguồn ưu tiên cho `stories.ai_summary`
 * (POST /api/ai/summarize) vì dựa trên nội dung ảnh thật, chính xác hơn
 * description crawl được.
 *
 * @param {number} storyId
 * @param {object} [options]
 * @param {number} [options.firstNChapters=5] - Số chương đầu dùng làm nguồn.
 * @returns {Promise<string|null>} Đoạn giới thiệu 3-5 câu; null nếu truyện
 *   chưa có chapter_summaries nào (caller fallback sang description).
 */
async function aggregateIntroSummary(storyId, { firstNChapters = INTRO_CHAPTERS_LIMIT } = {}) {
  const result = await pool.query(
    `SELECT chapter_num, summary FROM chapter_summaries
     WHERE story_id = $1 ORDER BY chapter_num ASC LIMIT $2`,
    [storyId, firstNChapters]
  );
  if (!result.rows.length) return null;

  const joined = result.rows.map((r) => `Chương ${r.chapter_num}: ${r.summary}`).join("\n");
  const prompt = `Dưới đây là tóm tắt ${result.rows.length} chương đầu của 1 truyện tranh:

${joined}

YÊU CẦU BẮT BUỘC:
- Viết bằng tiếng Việt, 3-5 câu
- Văn phong trung tính, dễ đọc, dùng để giới thiệu truyện cho người đọc mới
- KHÔNG tiết lộ các tình tiết quan trọng hoặc kết thúc
- Chỉ dựa trên thông tin đã cung cấp`;

  return callAI(prompt);
}

// ── Recap theo tiến độ đọc — cache ngắn hạn để không tính lại mỗi tin nhắn chat ──
const _recapCache = new Map();

/**
 * Đọc recap từ cache in-memory. Phân biệt 3 trạng thái: undefined = chưa cache
 * (phải tính), null = đã cache "không có dữ liệu" (khỏi query lại), string = recap.
 * Entry quá TTL 10 phút bị xóa và coi như chưa cache.
 * @param {string} key - "storyId:upToChapterNum".
 * @returns {string|null|undefined}
 */
function getCachedRecap(key) {
  const hit = _recapCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.cachedAt > RECAP_CACHE_TTL_MS) {
    _recapCache.delete(key);
    return undefined;
  }
  return hit.value;
}

/**
 * Recap PHÂN CẤP cho truyện đã đọc nhiều chương (> 15): nối thẳng tất cả summary
 * sẽ quá dài cho context AI, nên tóm tắt 2 tầng — chia chương thành nhóm 10,
 * mỗi nhóm 1 lượt callAI tóm tắt thành "giai đoạn", rồi 1 lượt cuối gộp các
 * giai đoạn thành recap 8-12 câu. Chỉ có 1 nhóm → trả luôn, khỏi gộp.
 * @param {Array<{chapter_num, summary}>} rows - Summary các chương, đúng thứ tự.
 * @returns {Promise<string>} Recap hoàn chỉnh.
 */
async function buildHierarchicalRecap(rows) {
  const groups = chunk(rows, RECAP_GROUP_SIZE);
  const groupSummaries = [];
  for (const group of groups) {
    const joined = group.map((r) => `Chương ${r.chapter_num}: ${r.summary}`).join("\n");
    const prompt = `Tóm tắt lại đoạn diễn biến sau (gồm nhiều chương liên tiếp của 1 truyện tranh) thành 1 đoạn ngắn, giữ đúng trình tự, bằng tiếng Việt:

${joined}`;
    groupSummaries.push(await callAI(prompt));
  }
  if (groupSummaries.length === 1) return groupSummaries[0].trim();

  const finalPrompt = `Dưới đây là tóm tắt theo từng giai đoạn (theo đúng thứ tự) của 1 truyện tranh:

${groupSummaries.map((s, i) => `[Giai đoạn ${i + 1}]\n${s}`).join("\n\n")}

Hãy gộp lại thành 1 đoạn recap mạch lạc, đầy đủ diễn biến chính, bằng tiếng Việt, súc tích (8-12 câu) — dùng để nhắc người đọc nhớ lại nội dung trước khi đọc tiếp.`;
  return callAI(finalPrompt);
}

/**
 * Recap nội dung các chương NGƯỜI DÙNG ĐÃ ĐỌC (chương 1 → upToChapterNum) —
 * nguồn cho chatbot trả lời "tóm tắt lại những gì tôi đã đọc" và
 * GET /api/stories/:id/recap. Chỉ lấy chương ≤ N nên không bao giờ spoil chương sau.
 *
 * - Cache in-memory theo (storyId, N) TTL 10 phút — mỗi tin nhắn chat đều cần
 *   recap, không thể tính lại mỗi lần.
 * - ≤ 15 chương: nối thẳng summary từng chương (đủ ngắn, giữ nguyên chi tiết);
 *   nhiều hơn: buildHierarchicalRecap tóm tắt 2 tầng.
 *
 * @param {number} storyId
 * @param {number} upToChapterNum - Chương đang đọc (float, hỗ trợ chương 10.5).
 * @returns {Promise<string|null>} Recap, hoặc null nếu chưa chương nào có summary.
 */
async function getReadingRecap(storyId, upToChapterNum) {
  if (!upToChapterNum || upToChapterNum <= 0) return null;

  const cacheKey = `${storyId}:${upToChapterNum}`;
  const cached = getCachedRecap(cacheKey);
  if (cached !== undefined) return cached;

  const result = await pool.query(
    `SELECT chapter_num, summary FROM chapter_summaries
     WHERE story_id = $1 AND chapter_num <= $2 ORDER BY chapter_num ASC`,
    [storyId, upToChapterNum]
  );
  if (!result.rows.length) {
    _recapCache.set(cacheKey, { value: null, cachedAt: Date.now() });
    return null;
  }

  const recap = result.rows.length <= RECAP_DIRECT_JOIN_LIMIT
    ? result.rows.map((r) => `Chương ${r.chapter_num}: ${r.summary}`).join("\n")
    : await buildHierarchicalRecap(result.rows);

  _recapCache.set(cacheKey, { value: recap, cachedAt: Date.now() });
  return recap;
}

module.exports = { summarizeChapterImages, aggregateIntroSummary, getReadingRecap };
