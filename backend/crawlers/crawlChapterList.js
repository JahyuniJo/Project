/**
 * crawlers/crawlChapterList.js — Crawl DANH SÁCH CHƯƠNG và ẢNH CHƯƠNG từ nguồn
 * (comi.mobi, theme WordPress Madara). Chiến lược chung: thử cách rẻ trước
 * (Axios + Cheerio), chỉ leo thang lên Puppeteer (trình duyệt thật, đắt) khi
 * trang cần chạy JavaScript hoặc yêu cầu đăng nhập.
 *
 * Export:
 *   - crawlChapterList(storyUrl): danh sách chương (5 phương pháp fallback).
 *   - crawlChapterImages(chapterUrl): ảnh 1 chương (3 tầng leo thang).
 */
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
};

const COOKIES_FILE = path.join(__dirname, "../config/comiCookies.json");

// ─── Cookie persistence ───────────────────────────────────────────────
// Cookie đăng nhập comi (từ Puppeteer) được lưu ra file JSON để tái dùng giữa
// các lần crawl và giữa các lần restart server — tránh phải login lại mỗi chương.

/** Ghi mảng cookie (định dạng Puppeteer) ra file cache; lỗi ghi chỉ log, không throw. */
function saveCookies(cookies) {
  try {
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  } catch (err) {
    console.error("[cookies] Lưu thất bại:", err.message);
  }
}

/**
 * Đọc cookie từ file cache, lọc bỏ cookie đã hết hạn (so `expires` với thời điểm
 * hiện tại). Trả null khi file không tồn tại/hỏng/toàn cookie hết hạn —
 * caller hiểu là "chưa đăng nhập".
 * @returns {Array<object>|null}
 */
function loadCookies() {
  try {
    if (!fs.existsSync(COOKIES_FILE)) return null;
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf-8"));
    const now = Date.now() / 1000;
    const valid = cookies.filter((c) => !c.expires || c.expires > now);
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

/** Xóa file cookie cache — gọi khi phát hiện cookie hết hạn (vẫn bị chặn dù đã gửi). */
function deleteCookies() {
  try { fs.unlinkSync(COOKIES_FILE); } catch {}
}

/** Chuyển mảng cookie Puppeteer thành chuỗi header `Cookie: name=value; ...` cho Axios. */
function cookiesToHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

// ─── Chapter list crawl ───────────────────────────────────────────────

/**
 * Bóc tách danh sách chương từ 1 document Cheerio, theo 2 pass:
 *
 *   Pass 1 — selector chuẩn theme Madara (li.wp-manga-chapter...): lấy URL +
 *   số chương từ text ("Chương 10.5") hoặc từ URL (/chuong-10_5/); "oneshot"
 *   được quy ước là chương 1.
 *   Pass 2 — fallback khi trang tùy biến CSS class: quét mọi thẻ <a> trong các
 *   container quen thuộc, chỉ nhận link có pattern chuong/chapter-N trong URL.
 *
 * Set `seen` khử URL trùng (nhiều selector match cùng element).
 * @param {cheerio.CheerioAPI} $ - HTML đã load bằng cheerio.
 * @returns {Array<{chapter_num: number, title: string, source_url: string}>}
 *   Danh sách chương sắp theo chapter_num tăng dần.
 */
function extractChapters($) {
  const chapters = [];
  const seen = new Set();

  // Pass 1: selectors chuẩn Madara
  const SELECTORS = [
    "li.wp-manga-chapter",
    ".version-chap li",
    ".listing-chapters_wrap li",
    ".chapter-list li",
    "ul.main li",
  ];

  for (const sel of SELECTORS) {
    $(sel).each((i, el) => {
      const $el = $(el);
      const url = $el.find("a").first().attr("href");
      if (!url || seen.has(url)) return;

      const nameText = $el.find(".chapter-name").text().trim();
      const linkText = $el.find("a").first().text().trim();
      const numMatch = (nameText || linkText).match(/([\d.]+)/);

      let chapter_num = null;
      if (numMatch) {
        chapter_num = parseFloat(numMatch[1]);
      } else {
        const text = nameText || linkText;
        if (/oneshot|one.?shot/i.test(text)) {
          chapter_num = 1;
        } else {
          const urlMatch = url.match(/(?:chuong|chapter)[_-](\d+(?:[._]\d+)?)/i);
          if (urlMatch) chapter_num = parseFloat(urlMatch[1].replace("_", "."));
          else if (/\/oneshot(?:\/|$)|[_-]oneshot/i.test(url)) chapter_num = 1;
        }
      }

      if (chapter_num !== null) {
        seen.add(url);
        const extTitle = $el.find(".chapter-extend-name").text().trim();
        chapters.push({ chapter_num, title: extTitle || "Oneshot", source_url: url });
      }
    });
    if (chapters.length > 0) break;
  }

  if (chapters.length > 0) return chapters;

  // Pass 2: fallback dựa trên URL pattern — hoạt động với mọi CSS class tuỳ biến
  const CONTAINERS = [
    ".listing-chapters_wrap",
    ".page-content-listing",
    ".wp-manga-chapters",
    "#manga-chapters-holder",
    ".chapter-list",
  ];
  let $scope = null;
  for (const c of CONTAINERS) {
    if ($(c).length) { $scope = $(c); break; }
  }

  ($scope ? $scope.find("a[href]") : $("a[href]")).each((i, el) => {
    const url = $(el).attr("href") || "";
    if (!url || seen.has(url)) return;

    const text = $(el).text().trim();
    const urlMatch = url.match(/(?:chuong|chapter)[_-](\d+(?:[._]\d+)?)/i);
    const isOneshot = /\/oneshot(?:\/|$)|[_-]oneshot/i.test(url) || /oneshot/i.test(text);

    let chapter_num = null;
    if (urlMatch) chapter_num = parseFloat(urlMatch[1].replace("_", "."));
    else if (isOneshot) chapter_num = 1;

    if (chapter_num === null) return;

    seen.add(url);
    chapters.push({ chapter_num, title: text || "Oneshot", source_url: url });
  });

  return chapters.sort((a, b) => a.chapter_num - b.chapter_num);
}

/**
 * Trích WordPress nonce (token chống CSRF) từ trang truyện — cần cho lời gọi
 * admin-ajax.php ở một số bản Madara. Thử 3 nguồn theo thứ tự: hidden input
 * chứa "nonce" → data-nonce của khối danh sách chương → pattern "nonce":"..."
 * trong script inline. Không thấy → chuỗi rỗng (caller vẫn thử gọi không nonce).
 * @param {cheerio.CheerioAPI} $
 * @param {string[]} scripts - Nội dung các thẻ <script> inline.
 * @returns {string}
 */
function extractNonce($, scripts) {
  // Ưu tiên trích từ hidden input (WordPress pattern phổ biến)
  const inputVal = $('input[name*="nonce"], input[id*="nonce"]').first().val();
  if (inputVal) return inputVal;

  // Trích từ data attribute của listing-chapters_wrap
  const dataNonce = $(".listing-chapters_wrap").attr("data-nonce");
  if (dataNonce) return dataNonce;

  // Trích từ script inline
  for (const s of scripts) {
    const m = s.match(/["\']nonce["\']\s*:\s*["\']([a-zA-Z0-9]+)["\']/);
    if (m) return m[1];
  }
  return "";
}

/**
 * Fallback cuối của crawlChapterList: mở trang bằng Puppeteer (Chrome headless)
 * để JavaScript của trang tự render danh sách chương, rồi bóc tách ngay trong
 * browser context bằng page.evaluate với cùng logic 2-pass như extractChapters
 * (bản DOM API thay vì Cheerio). Inject cookie đã lưu nếu có. Lỗi → trả mảng
 * rỗng, không throw.
 * @param {string} storyUrl
 * @returns {Promise<Array<{chapter_num, title, source_url}>>}
 */
async function crawlChapterListWithPuppeteer(storyUrl) {
  const puppeteer = require("puppeteer");
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setUserAgent(HEADERS["User-Agent"]);

    const savedCookies = loadCookies();
    if (savedCookies) await page.setCookie(...savedCookies);

    await page.goto(storyUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Đợi danh sách chương xuất hiện (tối đa 10s)
    const CHAPTER_SELECTORS = [
      "li.wp-manga-chapter",
      ".version-chap li",
      ".listing-chapters_wrap li",
      ".chapter-list li",
      "ul.main li",
    ];
    await page.waitForSelector(CHAPTER_SELECTORS.join(", "), { timeout: 10000 }).catch(() => {});

    const chapters = await page.evaluate((selectors) => {
      const results = [];
      const seen = new Set();

      // Pass 1: selectors chuẩn
      let items = [];
      for (const sel of selectors) {
        items = [...document.querySelectorAll(sel)];
        if (items.length > 0) break;
      }

      for (const el of items) {
        const link = el.querySelector("a");
        if (!link) continue;
        const url = link.href;
        if (!url || seen.has(url)) continue;

        const nameEl = el.querySelector(".chapter-name");
        const text = (nameEl?.textContent || link.textContent).trim();
        const numMatch = text.match(/([\d.]+)/);

        let chapter_num = null;
        if (numMatch) {
          chapter_num = parseFloat(numMatch[1]);
        } else if (/oneshot/i.test(text)) {
          chapter_num = 1;
        } else {
          const urlMatch = url.match(/(?:chuong|chapter)[_-](\d+(?:[._]\d+)?)/i);
          if (urlMatch) chapter_num = parseFloat(urlMatch[1].replace("_", "."));
          else if (/\/oneshot(?:\/|$)|[_-]oneshot/i.test(url)) chapter_num = 1;
        }

        if (chapter_num !== null) {
          seen.add(url);
          const extEl = el.querySelector(".chapter-extend-name");
          results.push({ chapter_num, title: extEl?.textContent.trim() || text || "Oneshot", source_url: url });
        }
      }

      if (results.length > 0) return results;

      // Pass 2: URL pattern fallback
      const CONTAINERS = [
        ".listing-chapters_wrap", ".page-content-listing",
        ".wp-manga-chapters", "#manga-chapters-holder", ".chapter-list",
      ];
      let scope = null;
      for (const c of CONTAINERS) {
        scope = document.querySelector(c);
        if (scope) break;
      }
      const links = [...(scope || document).querySelectorAll("a[href]")];
      for (const link of links) {
        const url = link.href;
        if (!url || seen.has(url)) continue;
        const text = link.textContent.trim();
        const urlMatch = url.match(/(?:chuong|chapter)[_-](\d+(?:[._]\d+)?)/i);
        const isOneshot = /\/oneshot(?:\/|$)|[_-]oneshot/i.test(url) || /oneshot/i.test(text);
        let chapter_num = null;
        if (urlMatch) chapter_num = parseFloat(urlMatch[1].replace("_", "."));
        else if (isOneshot) chapter_num = 1;
        if (chapter_num === null) continue;
        seen.add(url);
        results.push({ chapter_num, title: text || "Oneshot", source_url: url });
      }

      return results.sort((a, b) => a.chapter_num - b.chapter_num);
    }, CHAPTER_SELECTORS);

    console.error(`[crawlChapterListWithPuppeteer] → ${chapters.length} chương`);
    return chapters;
  } catch (err) {
    console.error("[crawlChapterListWithPuppeteer] lỗi:", err.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Gọi endpoint WordPress admin-ajax.php với 1 body cho trước (giả header
 * XMLHttpRequest + Referer như request từ trang thật), parse HTML trả về
 * thành danh sách chương.
 * @param {string} origin - Origin của trang nguồn (https://comi.mobi).
 * @param {string} storyUrl - Dùng làm Referer.
 * @param {string} bodyStr - Body form-urlencoded (action, manga id, nonce...).
 * @returns {Promise<Array>} Danh sách chương, có thể rỗng.
 */
async function tryAdminAjax(origin, storyUrl, bodyStr) {
  const { data: ajaxData } = await axios.post(
    `${origin}/wp-admin/admin-ajax.php`,
    bodyStr,
    {
      headers: {
        ...HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": storyUrl,
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: 15000,
    }
  );
  const html = typeof ajaxData === "object" ? (ajaxData.data || "") : ajaxData;
  return html ? extractChapters(cheerio.load(html)) : [];
}

/**
 * ENTRY POINT crawl danh sách chương của 1 truyện — thử lần lượt 5 phương pháp
 * từ rẻ đến đắt, dừng ngay khi có kết quả:
 *
 *   1. HTML tĩnh: chương có sẵn trong trang (extractChapters trực tiếp).
 *   2. POST {storyUrl}/ajax/chapters/ — endpoint Madara mới, không cần nonce.
 *   3. POST admin-ajax.php với nonce (trích từ trang).
 *   4. POST admin-ajax.php không nonce / đổi tham số manga → post_id.
 *   5. Puppeteer render JS thật (crawlChapterListWithPuppeteer).
 *
 * postId lấy từ class `postid-NNN` trên <body> (quy ước WordPress).
 * Log dùng console.error để không lẫn vào stdout khi chạy như child process.
 *
 * @param {string} storyUrl - URL trang chi tiết truyện.
 * @returns {Promise<Array<{chapter_num, title, source_url}>>}
 */
async function crawlChapterList(storyUrl) {
  const { data } = await axios.get(storyUrl, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(data);

  const bodyClass = $("body").attr("class") || "";
  const postIdMatch = bodyClass.match(/postid-(\d+)/);
  const postId = postIdMatch ? postIdMatch[1] : null;

  // Phương pháp 1: chương đã có sẵn trong HTML (ít phổ biến với truyện nhiều chương)
  const directChapters = extractChapters($);
  if (directChapters.length > 0) {
    console.error(`[crawlChapterList] Direct → ${directChapters.length} chương`);
    return directChapters;
  }

  // Phương pháp 2: /ajax/chapters/ (Madara mới hơn, không cần nonce)
  try {
    const ajaxUrl = storyUrl.replace(/\/?$/, "/") + "ajax/chapters/";
    console.error(`[crawlChapterList] Thử /ajax/chapters/`);
    const { data: ajaxData } = await axios.post(ajaxUrl, "", {
      headers: {
        ...HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": storyUrl,
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: 15000,
    });

    // Debug: in ra cấu trúc response để chẩn đoán
    const rawPreview = typeof ajaxData === "string"
      ? ajaxData.substring(0, 300)
      : JSON.stringify(ajaxData).substring(0, 300);
    console.error(`[crawlChapterList] /ajax/chapters/ raw (type=${typeof ajaxData}):`, rawPreview);

    // Thử các trường có thể chứa HTML
    const htmlCandidates = typeof ajaxData === "object"
      ? [ajaxData.data, ajaxData.html, ajaxData.content, JSON.stringify(ajaxData)]
      : [ajaxData];

    for (const html of htmlCandidates) {
      if (typeof html !== "string" || !html.trim()) continue;
      const chapters = extractChapters(cheerio.load(html));
      if (chapters.length > 0) {
        console.error(`[crawlChapterList] /ajax/chapters/ → ${chapters.length} chương`);
        return chapters;
      }
    }
  } catch (err) {
    console.error("[crawlChapterList] /ajax/chapters/ lỗi:", err.message);
  }

  // Phương pháp 3 & 4: admin-ajax.php với và không có nonce
  if (postId) {
    const origin = new URL(storyUrl).origin;
    const scripts = $("script").map((i, el) => $(el).html() || "").get();
    const nonce = extractNonce($, scripts);
    console.error(`[crawlChapterList] AJAX postId=${postId} nonce=${nonce || "(none)"}`);

    // Thử lần lượt: có nonce → không nonce → dùng post_id thay vì manga
    const attempts = [
      nonce ? `action=manga_get_chapters&manga=${postId}&nonce=${nonce}` : null,
      `action=manga_get_chapters&manga=${postId}`,
      `action=manga_get_chapters&post_id=${postId}`,
    ].filter(Boolean);

    for (const body of attempts) {
      try {
        const chapters = await tryAdminAjax(origin, storyUrl, body);
        if (chapters.length > 0) {
          console.error(`[crawlChapterList] AJAX (${body.split("&")[2] || "no-nonce"}) → ${chapters.length} chương`);
          return chapters;
        }
      } catch (err) {
        console.error(`[crawlChapterList] AJAX attempt lỗi (${err.response?.status || err.message}):`, body.split("&")[0]);
      }
    }
  }

  // Phương pháp 5: Puppeteer — chạy JS thật để render danh sách chương
  console.error("[crawlChapterList] Thử Puppeteer để render danh sách chương...");
  return crawlChapterListWithPuppeteer(storyUrl);
}

// ─── Axios crawl (không auth) ─────────────────────────────────────────

/**
 * Bóc tách URL ảnh chương từ document Cheerio.
 *
 * Pass 1: quét các selector khung đọc quen thuộc; với mỗi <img> thử lần lượt
 * data-src → data-lazy-src → data-cfsrc → src (trang lazy-load để URL thật
 * trong data-* còn src chỉ là placeholder). Bỏ ảnh data: URI, khử trùng lặp.
 * Pass 2 (fallback): parse mảng `theChapterData.imgs` trong thẻ <script>
 * (một số bản Madara render ảnh bằng JS từ JSON này).
 *
 * @param {cheerio.CheerioAPI} $
 * @returns {string[]} URL ảnh theo đúng thứ tự trang.
 */
function extractImages($) {
  const seen = new Set();
  const images = [];

  function collect(src) {
    if (!src) return;
    const s = src.trim();
    if (s.startsWith("data:") || seen.has(s)) return;
    seen.add(s);
    images.push(s);
  }

  const IMG_SELECTORS = [
    "#chapterImgList img",
    ".reading-content img",
    ".page-break img",
    "img.wp-manga-chapter-img",
  ];
  const ATTRS = ["data-src", "data-lazy-src", "data-cfsrc", "src"];

  for (const sel of IMG_SELECTORS) {
    $(sel).each((i, el) => {
      for (const attr of ATTRS) {
        const v = $(el).attr(attr);
        if (v && !v.startsWith("data:")) { collect(v); break; }
      }
    });
    if (images.length > 0) break;
  }

  if (images.length > 0) return images;

  // Fallback: parse theChapterData.imgs từ script tag (Madara theme)
  const scriptContent = $("script")
    .map((i, el) => $(el).html() || "")
    .get()
    .find((s) => s.includes("theChapterData"));

  if (scriptContent) {
    const match = scriptContent.match(/["']imgs["']\s*:\s*(\[.*?\])/s);
    if (match) {
      try {
        const urls = JSON.parse(match[1]);
        urls.forEach((u) => collect(u.replace(/\\\//g, "/")));
      } catch {}
    }
  }

  return images;
}

/**
 * Tầng 1 — crawl ảnh chương bằng Axios thuần (không đăng nhập): nhanh nhất,
 * đủ cho các chương không bị khóa.
 * @param {string} chapterUrl
 * @returns {Promise<string[]>}
 */
async function crawlWithAxios(chapterUrl) {
  const { data: html } = await axios.get(chapterUrl, { headers: HEADERS, timeout: 20000 });
  return extractImages(cheerio.load(html));
}

// ─── Axios crawl (với saved cookies) ─────────────────────────────────

/**
 * Tầng 2 — crawl ảnh bằng Axios kèm cookie đăng nhập đã cache: đọc được chương
 * khóa mà KHÔNG phải khởi động Puppeteer (đắt). Nếu trang vẫn hiện overlay chặn
 * (#comi-blocked-chapter) nghĩa là cookie đã hết hạn → báo caller xóa cache.
 * @param {string} chapterUrl
 * @param {Array<object>} cookies - Cookie đã lưu từ lần login trước.
 * @returns {Promise<{images: string[], cookiesExpired: boolean}>}
 */
async function crawlWithAxiosCookies(chapterUrl, cookies) {
  const { data: html } = await axios.get(chapterUrl, {
    headers: { ...HEADERS, Cookie: cookiesToHeader(cookies) },
    timeout: 20000,
  });
  const $ = cheerio.load(html);

  // Kiểm tra vẫn bị block sau khi dùng cookies
  if ($("#comi-blocked-chapter").length > 0) {
    return { images: [], cookiesExpired: true };
  }

  return { images: extractImages($), cookiesExpired: false };
}

// ─── Puppeteer login (modal-based) ────────────────────────────────────

/**
 * Đăng nhập comi.mobi ngay trong browser context của Puppeteer, dùng tài khoản
 * COMI_USERNAME/COMI_PASSWORD trong .env.
 *
 * Cách làm: page.evaluate đọc form login (#form-login) TRỰC TIẾP từ DOM —
 * tên field, action, các hidden input (testcookie, redirect_to, nonce) đều lấy
 * động thay vì hardcode, vì comi dùng wp-login.php chuẩn WordPress và có thể
 * đổi cấu trúc. Submit bằng fetch(credentials:'include') để cookie tự set vào
 * browser. Thành công được xác nhận bằng sự xuất hiện của cookie
 * `wordpress_logged_in*` (thử reload 1 lần nếu chưa thấy), rồi lưu toàn bộ
 * cookie ra file cache cho các lần crawl sau.
 *
 * @param {import("puppeteer").Page} page - Page đang mở trang comi.
 * @returns {Promise<boolean>} true nếu đăng nhập và lưu cookie thành công.
 */
async function loginToComi(page) {
  const username = process.env.COMI_USERNAME;
  const password = process.env.COMI_PASSWORD;
  if (!username || !password) {
    console.error("[loginToComi] Không có COMI_USERNAME/COMI_PASSWORD trong .env");
    return false;
  }
  try {
    // Đọc form action và field names trực tiếp từ DOM — không hardcode
    // Lý do: comi dùng wp-login.php (hidden fields testcookie/redirect_to), không phải AJAX
    const result = await page.evaluate(async (user, pass) => {
      const form = document.querySelector("#form-login form");
      if (!form) return { ok: false, debug: "form #form-login không tìm thấy" };

      const userField = form.querySelector('input[name="log"], input[name="username"], input[type="email"], input[type="text"]:not([name="search"])');
      const passField = form.querySelector('input[name="pwd"], input[name="password"], input[type="password"]');
      if (!userField || !passField) {
        return { ok: false, debug: `fields: user=${userField?.name} pass=${passField?.name}` };
      }

      // Thu thập tất cả hidden inputs (redirect_to, testcookie, nonce, v.v.)
      const hiddenInputs = {};
      form.querySelectorAll('input[type="hidden"]').forEach((el) => {
        if (el.name) hiddenInputs[el.name] = el.value;
      });

      const params = new URLSearchParams({
        [userField.name]: user,
        [passField.name]: pass,
        "wp-submit": "Log In",
        ...hiddenInputs,
      });

      const endpoint = form.action || "/wp-login.php";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body: params.toString(),
        redirect: "follow",
      });

      const raw = await res.text();
      // Login thành công: WordPress redirect ra khỏi trang login
      // Login thất bại: vẫn trả về trang có form login
      const failed = raw.includes('id="login"') || raw.includes("login_error") || raw.includes("loginform");
      return {
        ok: !failed,
        endpoint,
        userField: userField.name,
        passField: passField.name,
        finalUrl: res.url,
        raw: raw.substring(0, 150),
      };
    }, username, password);

    console.error("[loginToComi] form submit:", JSON.stringify({ ...result, raw: result.raw?.substring(0, 80) }));

    if (!result.ok) {
      console.error("[loginToComi] Đăng nhập thất bại:", result.debug || result.finalUrl || "");
      return false;
    }

    // fetch() với credentials:'include' đã set auth cookies trong browser context
    const cookies = await page.cookies();
    const hasAuthCookie = cookies.some((c) => c.name.startsWith("wordpress_logged_in"));
    if (hasAuthCookie) {
      saveCookies(cookies);
      console.error(`[loginToComi] Đăng nhập thành công — đã lưu ${cookies.length} cookies`);
      return true;
    }

    // Fallback: reload để WordPress set cookie qua redirect
    await page.reload({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
    const refreshed = await page.cookies();
    if (refreshed.some((c) => c.name.startsWith("wordpress_logged_in"))) {
      saveCookies(refreshed);
      console.error(`[loginToComi] Đăng nhập thành công (reload) — đã lưu ${refreshed.length} cookies`);
      return true;
    }

    console.error("[loginToComi] Đăng nhập thất bại — không tìm thấy wordpress_logged_in cookie");
    return false;
  } catch (err) {
    console.error("[loginToComi] lỗi:", err.message);
    return false;
  }
}

// ─── Puppeteer crawl ──────────────────────────────────────────────────

/**
 * Tầng 3 (cuối) — crawl ảnh bằng Puppeteer, xử lý được cả trang render JS
 * lẫn chương yêu cầu đăng nhập.
 *
 * Thu ảnh từ 2 nguồn bổ trợ nhau: DOM (các <img> trong khung đọc) và network
 * (listener bắt mọi response ảnh từ CDN khác origin — bắt được ảnh do JS load
 * mà DOM chưa kịp gắn). Nếu gặp overlay chặn mà DOM không có ảnh:
 * xóa cookie cũ (đã hết hạn) → loginToComi → load lại trang → thu ảnh lần nữa.
 * Vẫn không được → trả { blocked: true } để chapterRoutes trả 403 báo người dùng
 * chương này cần tài khoản nguồn.
 *
 * @param {string} chapterUrl
 * @returns {Promise<{images: string[], blocked: boolean}>}
 */
async function crawlWithPuppeteer(chapterUrl) {
  const puppeteer = require("puppeteer");
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setUserAgent(HEADERS["User-Agent"]);

    // Inject saved cookies trước khi navigate — bỏ qua login nếu cookies còn hạn
    const savedCookies = loadCookies();
    if (savedCookies) {
      await page.setCookie(...savedCookies);
      console.error(`[crawlWithPuppeteer] Injected ${savedCookies.length} cookies`);
    }

    const siteOrigin = new URL(chapterUrl).origin;
    const capturedImages = [];
    page.on("response", (response) => {
      const ct = response.headers()["content-type"] || "";
      if (!ct.startsWith("image/") || ct.includes("svg")) return;
      const url = response.url();
      try {
        if (new URL(url).origin !== siteOrigin && !capturedImages.includes(url)) {
          capturedImages.push(url);
        }
      } catch {}
    });

    await page.goto(chapterUrl, { waitUntil: "networkidle2", timeout: 30000 });

    const info = await page.evaluate(() => ({
      title: document.title.substring(0, 80),
      blocked: !!document.getElementById("comi-blocked-chapter"),
      imgInList: (document.getElementById("chapterImgList")?.querySelectorAll("img") ?? []).length,
      hasCF: document.title.toLowerCase().includes("just a moment"),
    }));
    console.error("[Puppeteer debug]", JSON.stringify(info));

    const extractDomImages = () =>
      page.$$eval(
        "#chapterImgList img, .reading-content img, img.wp-manga-chapter-img",
        (imgs) =>
          [...new Set(
            imgs
              .map((img) => img.getAttribute("data-src") || img.getAttribute("src"))
              .filter((src) => src && !src.startsWith("data:"))
          )]
      );

    const domImages = await extractDomImages();
    console.error(
      `[crawlWithPuppeteer] DOM:${domImages.length} Network:${capturedImages.length} Blocked:${info.blocked}`
    );

    // Bị block + không có DOM images: network images là UI asset của overlay, không dùng
    if (info.blocked && domImages.length === 0) {
      if (savedCookies) {
        // Cookies đã inject nhưng vẫn block → hết hạn, xóa cache
        console.error("[crawlWithPuppeteer] Cookies hết hạn, xóa cache và login lại");
        deleteCookies();
      }
      const loggedIn = await loginToComi(page);
      if (loggedIn) {
        capturedImages.length = 0;
        await page.goto(chapterUrl, { waitUntil: "networkidle2", timeout: 30000 });
        const domAfter = await extractDomImages();
        const all = [...new Set([...domAfter, ...capturedImages])];
        console.error(`[crawlWithPuppeteer] Sau đăng nhập: DOM:${domAfter.length} Network:${capturedImages.length} Total:${all.length}`);
        if (all.length > 0) return { images: all, blocked: false };
      }
      return { images: [], blocked: true };
    }

    const all = [...new Set([...domImages, ...capturedImages])];
    console.error(`[crawlWithPuppeteer] Total:${all.length}`);
    return { images: all, blocked: false };
  } catch (err) {
    console.error("[crawlWithPuppeteer] lỗi:", err.message);
    return { images: [], blocked: false };
  } finally {
    if (browser) await browser.close();
  }
}

// ─── Main entry point ─────────────────────────────────────────────────

/**
 * ENTRY POINT crawl ảnh 1 chương (được chapterRoutes gọi khi lazy-crawl) —
 * leo thang 3 tầng từ rẻ đến đắt:
 *
 *   1. Axios không auth — đủ cho chương mở.
 *   2. Axios + cookie đã cache — chương khóa nhưng từng login; cookie hết hạn
 *      thì xóa cache.
 *   3. Puppeteer (kèm tự động login lại nếu cần).
 *
 * Ngưỡng "≥ 3 ảnh" mới coi là thành công: chương thật hiếm khi dưới 3 trang,
 * còn trang bị chặn thường chỉ lộ 1-2 ảnh UI — tránh nhận nhầm kết quả rác.
 *
 * @param {string} chapterUrl - source_url của chương trong DB.
 * @returns {Promise<{images: string[], blocked: boolean}>} blocked = true khi
 *   chương yêu cầu tài khoản nguồn mà không đăng nhập được.
 */
async function crawlChapterImages(chapterUrl) {
  // 1. Axios không auth (nhanh nhất, đủ cho chương không bị khóa)
  const axiosImages = await crawlWithAxios(chapterUrl).catch(() => []);
  if (axiosImages.length >= 3) {
    console.error(`[crawlChapterImages] ${axiosImages.length} ảnh (Axios)`);
    return { images: axiosImages, blocked: false };
  }

  // 2. Axios + saved cookies (tránh khởi động Puppeteer khi đã có cookies)
  const cookies = loadCookies();
  if (cookies) {
    console.error("[crawlChapterImages] Thử Axios + cookies...");
    const { images, cookiesExpired } = await crawlWithAxiosCookies(chapterUrl, cookies).catch(
      () => ({ images: [], cookiesExpired: true })
    );
    if (images.length >= 3) {
      console.error(`[crawlChapterImages] ${images.length} ảnh (Axios+cookies)`);
      return { images, blocked: false };
    }
    if (cookiesExpired) {
      console.error("[crawlChapterImages] Cookies hết hạn, xóa cache");
      deleteCookies();
    }
  }

  // 3. Puppeteer: inject cookies → load page → login qua modal nếu vẫn bị block
  console.error("[crawlChapterImages] Dùng Puppeteer...");
  return crawlWithPuppeteer(chapterUrl);
}

module.exports = { crawlChapterList, crawlChapterImages };
