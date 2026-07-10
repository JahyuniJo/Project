// crawlAll().catch((err) => console.error("❌ Lỗi tổng:", err.message));
  // 📄 middleware/crawlALL.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const axios = require("axios");
const cheerio = require("cheerio");
const { Client } = require("pg");

/**
 * Crawl metadata 1 truyện từ trang chi tiết — TRẢ VỀ object, không lưu DB
 * (việc lưu do caller quyết định, tách trách nhiệm crawl/persist).
 *
 * Mỗi trường thử nhiều selector fallback (|| chuỗi selector) vì các trang
 * cùng theme Madara nhưng cấu trúc hơi khác nhau. Status được chuẩn hóa
 * về ongoing/completed/stopped. Không lấy được title (đổi layout, bị chặn)
 * hoặc lỗi mạng → trả null để caller skip, không throw làm gãy cả đợt crawl.
 *
 * @param {string} url - URL trang chi tiết truyện.
 * @returns {Promise<object|null>} { title, cover_url, url, genres, author, description, status }.
 */
async function crawlStory(url) {
  try {
    console.log(`🔍 Crawling: ${url}`);
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const title =
      $(".profile-manga h3").text().trim() ||
      $("h3.post-title").text().trim() ||
      $("h3").first().text().trim();
    const cover_url = $(".summary_image img").attr("data-src") || null;

    const genres = $(".genres-content a")
      .map((i, el) => $(el).text().trim())
      .get();

    const author =
      $(".post-content_item:contains('Tác giả') .summary-content").text().trim() ||
      $(".summary-heading:contains('Tác giả')").next().text().trim() ||
      null;

    const description =
      $(".summary__content p").text().trim() ||
      $(".description-summary p").text().trim() ||
      $(".c-page_content .summary__content p").text().trim() ||
      null;

    let raw_status =
      $(".post-content_item:contains('Tình trạng') .summary-content").text().trim().toLowerCase() ||
      "";
    let status = "ongoing";
    if (raw_status.includes("hoàn") || raw_status.includes("complete")) status = "completed";
    else if (raw_status.includes("drop") || raw_status.includes("ngưng")) status = "stopped";

    if (!title) return null;

    return { title, cover_url, url, genres, author, description, status };
  } catch (err) {
    console.error(`❌ Lỗi crawl ${url}:`, err.message);
    return null;
  }
}

/**
 * Crawl toàn bộ truyện của 1 chuyên mục, duyệt phân trang `page/1/, page/2/...`
 * cho tới khi trang không còn link truyện hoặc trả lỗi (thường là 404 hết trang).
 * Với mỗi link truyện tìm được → gọi crawlStory(); nghỉ 1.2s giữa các truyện
 * để không dội request khiến nguồn chặn IP.
 *
 * @param {string} baseUrl - URL chuyên mục (vd: https://comi.mobi/truyen-tranh/).
 * @returns {Promise<Array<object>>} Danh sách truyện crawl thành công.
 */
async function crawlList(baseUrl) {
  const results = [];
  console.log(`📚 Đang tải danh sách từ: ${baseUrl}`);
  let page = 1;

  while (true) {
    const listUrl = `${baseUrl}page/${page}/`;
    console.log(`📄 Trang ${page}: ${listUrl}`);

    try {
      const { data } = await axios.get(listUrl);
      const $ = cheerio.load(data);

      const storyLinks = $(".tab-summary .summary_image a, .item-thumb a, .post-title h3 a")
        .map((i, el) => $(el).attr("href"))
        .get()
        .filter(Boolean);

      if (storyLinks.length === 0) {
        console.log("⚠️ Hết truyện — dừng crawl.");
        break;
      }

      for (const link of storyLinks) {
        const story = await crawlStory(link);
        if (story) results.push(story);
        await new Promise((r) => setTimeout(r, 1200));
      }

      page++;
    } catch (err) {
      console.log(`🚫 Dừng ở trang ${page} (${err.message})`);
      break;
    }
  }

  return results;
}

/**
 * Crawl tất cả chuyên mục nguồn (truyện tranh + tiểu thuyết) tuần tự,
 * gộp kết quả thành 1 mảng. Đây là hàm được export cho nơi khác dùng.
 * @returns {Promise<Array<object>>} Toàn bộ truyện crawl được.
 */
async function crawlAllStories() {
  const categories = [
    "https://comi.mobi/truyen-tranh/",
    "https://comi.mobi/tieu-thuyet/",
  ];

  const allStories = [];

  for (const category of categories) {
    const stories = await crawlList(category);
    allStories.push(...stories);
  }

  console.log(`🎉 Crawl hoàn tất: ${allStories.length} truyện`);
  return allStories;
}

// Khi chạy trực tiếp (node crawlALL.js — cách storyController.syncStories gọi
// qua execFile): crawl xong upsert từng truyện vào DB theo UNIQUE(title),
// crawl lại chỉ cập nhật metadata chứ không tạo trùng.
if (require.main === module) {
  (async () => {
    const client = new Client({
      user: process.env.DB_USER,
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_NAME,
      password: process.env.DB_PASS,
      port: parseInt(process.env.DB_PORT) || 5432,
    });
    await client.connect();
    console.log("✅ Đã kết nối PostgreSQL");

    const stories = await crawlAllStories();

    for (const s of stories) {
      await client.query(
        `INSERT INTO stories (title, cover_url, url, genres, author, description, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (title) DO UPDATE
         SET cover_url = EXCLUDED.cover_url,
             url = EXCLUDED.url,
             genres = EXCLUDED.genres,
             author = EXCLUDED.author,
             description = EXCLUDED.description,
             status = EXCLUDED.status`,
        [s.title, s.cover_url, s.url, s.genres, s.author, s.description, s.status]
      );
    }

    await client.end();
    console.log("💾 Lưu vào DB hoàn tất!");
  })();
}

module.exports = { crawlAllStories };
