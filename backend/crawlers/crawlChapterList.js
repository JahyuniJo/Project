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

function saveCookies(cookies) {
  try {
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
  } catch (err) {
    console.error("[cookies] Lưu thất bại:", err.message);
  }
}

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

function deleteCookies() {
  try { fs.unlinkSync(COOKIES_FILE); } catch {}
}

function cookiesToHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

// ─── Chapter list crawl ───────────────────────────────────────────────

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

// Gọi admin-ajax.php với một body nhất định, trả về mảng chương (có thể rỗng)
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

async function crawlWithAxios(chapterUrl) {
  const { data: html } = await axios.get(chapterUrl, { headers: HEADERS, timeout: 20000 });
  return extractImages(cheerio.load(html));
}

// ─── Axios crawl (với saved cookies) ─────────────────────────────────

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
