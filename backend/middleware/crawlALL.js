// import axios from "axios";
// import * as cheerio from "cheerio";
// import pkg from "pg";
// const { Client } = pkg;

// // 🧩 Hàm crawl 1 truyện cụ thể
// async function crawlStory(url, client) {
//   try {
//     console.log(`🔍 Crawling: ${url}`);
//     const { data } = await axios.get(url);
//     const $ = cheerio.load(data);

//     const title =
//       $(".profile-manga h3").text().trim() || $("h3.post-title").text().trim() || $("h3").first().text().trim();
//     const cover_url = $(".summary_image img").attr("data-src") || null;

//     const genres = $(".genres-content a")
//       .map((i, el) => $(el).text().trim())
//       .get();

//     const author =
//       $(".post-content_item:contains('Tác giả') .summary-content").text().trim() ||
//       $(".summary-heading:contains('Tác giả')").next().text().trim() ||
//       null;

//     const description =
//       $(".summary__content p").text().trim() ||
//       $(".description-summary p").text().trim() ||
//       $(".c-page_content .summary__content p").text().trim() ||
//       null;

//     let raw_status =
//       $(".post-content_item:contains('Tình trạng') .summary-content").text().trim().toLowerCase() || "";

//     let status = "ongoing";
//     if (raw_status.includes("hoàn") || raw_status.includes("complete")) {
//       status = "completed";
//     } else if (raw_status.includes("drop") || raw_status.includes("ngưng")) {
//       status = "dropped";
//     }

//     if (!title) {
//       console.log("❌ Không tìm thấy title, bỏ qua.");
//       return;
//     }

//     await client.query(
//       `INSERT INTO stories (title, cover_url, url, genres, author, description, status, created_at)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
//        ON CONFLICT (title) DO UPDATE
//        SET cover_url = EXCLUDED.cover_url,
//            url = EXCLUDED.url,
//            genres = EXCLUDED.genres,
//            author = EXCLUDED.author,
//            description = EXCLUDED.description,
//            status = EXCLUDED.status`,
//       [title, cover_url, url, genres, author, description, status]
//     );

//     console.log(`✅ Lưu thành công: ${title}`);
//   } catch (err) {
//     console.error(`❌ Lỗi khi crawl ${url}:`, err.message);
//   }
// }

// // 🧩 Hàm crawl danh sách truyện trong 1 trang (vd: /truyen-tranh hoặc /tieu-thuyet)
// async function crawlList(baseUrl, client) {
//   console.log(`📚 Đang tải danh sách từ: ${baseUrl}`);

//   let page = 1;
//   while (true) {
//     const listUrl = `${baseUrl}page/${page}/`;
//     console.log(`📄 Trang ${page}: ${listUrl}`);

//     try {
//       const { data } = await axios.get(listUrl);
//       const $ = cheerio.load(data);

//       const storyLinks = $(".tab-summary .summary_image a, .item-thumb a, .post-title h3 a")
//         .map((i, el) => $(el).attr("href"))
//         .get()
//         .filter(Boolean);

//       if (storyLinks.length === 0) {
//         console.log("⚠️ Không còn truyện mới — dừng crawl.");
//         break;
//       }

//       for (const link of storyLinks) {
//         await crawlStory(link, client);
//         await new Promise((r) => setTimeout(r, 1500)); // nghỉ 1.5s để tránh spam server
//       }

//       page++;
//     } catch (err) {
//       console.log(`🚫 Dừng ở trang ${page} (${err.message})`);
//       break;
//     }
//   }
// }

// // 🧩 Chạy toàn bộ — cả truyện tranh + tiểu thuyết
// async function crawlAll() {
//   const client = new Client({
//     user: "story_user",
//     host: "localhost",
//     database: "story_db",
//     password: "002016",
//     port: 5432,
//   });

//   await client.connect();
//   console.log("✅ Đã kết nối PostgreSQL");

//   const categories = [
//     "https://comi.mobi/truyen-tranh/",
//     "https://comi.mobi/tieu-thuyet/",
//   ];

//   for (const category of categories) {
//     await crawlList(category, client);
//   }

//   await client.end();
//   console.log("🎉 Crawl toàn bộ hoàn tất!");
// }

// // --- Chạy ---
// crawlAll().catch((err) => console.error("❌ Lỗi tổng:", err.message));
  // 📄 middleware/crawlALL.js
import axios from "axios";
import * as cheerio from "cheerio";
const pkg = require('pg');
const { Client } = pkg;

// 🧩 Crawl 1 truyện cụ thể, nhưng trả về dữ liệu (không lưu DB ở đây)
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
    else if (raw_status.includes("drop") || raw_status.includes("ngưng")) status = "dropped";

    if (!title) return null;

    return { title, cover_url, url, genres, author, description, status };
  } catch (err) {
    console.error(`❌ Lỗi crawl ${url}:`, err.message);
    return null;
  }
}

// 🧩 Crawl danh sách truyện trong 1 trang (vd: /truyen-tranh)
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

// 🧩 Crawl toàn bộ (cả truyện tranh + tiểu thuyết)
export async function crawlAllStories() {
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

// 🧩 Nếu chạy trực tiếp file này: lưu vào DB luôn
if (process.argv[1].includes("crawlALL.js")) {
  (async () => {
    const client = new Client({
      user: "story_user",
      host: "localhost",
      database: "story_db",
      password: "002016",
      port: 5432,
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
