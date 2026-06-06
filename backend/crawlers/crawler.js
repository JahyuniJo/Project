const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const axios = require("axios");
const cheerio = require("cheerio");
const { Client } = require("pg");

const url = "https://comi.mobi/truyen/quan-at-chu-bai/";

async function crawl() {
  console.log(`🔍 Đang tải: ${url}`);
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  // --- Lấy dữ liệu ---
  const title = $(".profile-manga h3").text().trim() || $("h3").first().text().trim();
  const cover_url = $(".summary_image img").attr("src") || null;

  // Genres
  const genres = $(".genres-content a")
    .map((i, el) => $(el).text().trim())
    .get();

  // Author
  const author = $(".post-content_item:contains('Tác giả')")
    .find(".summary-content")
    .text()
    .trim() || null;

  // Description
  const description =
    $(".summary__content p").text().trim() ||
    $(".description-summary p").text().trim() ||
    null;

  // Status (chuẩn hoá theo constraint)
  let raw_status = $(".post-content_item:contains('Tình trạng')")
    .find(".summary-content")
    .text()
    .trim()
    .toLowerCase();

  let status = "ongoing";
  if (raw_status.includes("hoàn") || raw_status.includes("complete")) {
    status = "completed";
  } else if (raw_status.includes("drop") || raw_status.includes("ngưng")) {
    status = "dropped";
  }

  const story = { title, cover_url, genres, author, description, status };
  console.log("➡️ Dữ liệu crawl được:");
  console.log(story);

  if (!title) {
    console.log("❌ Không tìm thấy title, có thể cấu trúc HTML đã thay đổi");
    return;
  }

  // --- Kết nối DB ---
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: parseInt(process.env.DB_PORT) || 5432,
  });

  await client.connect();
  console.log("✅ Đã kết nối với PostgreSQL");

  // --- Lưu vào DB ---
  await client.query(
    `INSERT INTO stories (title, cover_url, genres, author, description, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (title) DO UPDATE
     SET cover_url = EXCLUDED.cover_url,
         genres = EXCLUDED.genres,
         author = EXCLUDED.author,
         description = EXCLUDED.description,
         status = EXCLUDED.status`,
    [title, cover_url, genres, author, description, status]
  );

  console.log("🎉 Crawl xong và lưu vào DB!");
  await client.end();
}

crawl().catch((err) => console.error("❌ Lỗi khi crawl:", err.message));
