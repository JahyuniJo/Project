const pool = require("../config/pool");
const { client, indexName } = require("../config/elasticsearch");
const { removeVietnameseTones } = require("../utils/normalizeText");
const { createStoryEmbedding, embedText } = require("./embedding");
const { callAIRaw } = require("./aiService");

const STORIES_INDEX_BODY = {
  settings: {
    analysis: {
      analyzer: {
        vietnamese_analyzer: {
          type: "custom",
          tokenizer: "standard",
          filter: ["lowercase", "asciifolding"],
        },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: "integer" },
      title: { type: "text", analyzer: "vietnamese_analyzer" },
      author: { type: "text", analyzer: "vietnamese_analyzer" },
      genres: { type: "text", analyzer: "vietnamese_analyzer" },
      description: { type: "text", analyzer: "vietnamese_analyzer" },
      status: { type: "keyword" },
      url: { type: "keyword" },
      cover_url: { type: "keyword" },
      created_at: { type: "date" },
      embedding: {
        type: "dense_vector",
        dims: 1536,
        index: true,
        similarity: "cosine",
      },
    },
  },
};

// ========== Circuit breaker ==========
// null = chưa kiểm tra, true = ES đang lên, false = ES đang xuống
let esAvailable = null;
const ES_RETRY_INTERVAL_MS = 30_000;
let _esRetryTimer = null;

/**
 * Đặt lịch kiểm tra lại kết nối Elasticsearch sau ES_RETRY_INTERVAL_MS (30s).
 * Idempotent: nếu đã có timer đang chờ thì không đặt thêm — tránh dồn nhiều
 * lần ping khi liên tiếp gặp lỗi ES.
 */
function scheduleEsRetry() {
  if (_esRetryTimer) return;
  _esRetryTimer = setTimeout(() => {
    _esRetryTimer = null;
    checkElasticsearch();
  }, ES_RETRY_INTERVAL_MS);
}

/**
 * Ping Elasticsearch để cập nhật cờ trạng thái `esAvailable` (circuit breaker).
 * Ping thất bại → đánh dấu ES down, log cảnh báo (chỉ 1 lần cho mỗi đợt down)
 * và tự đặt lịch thử lại sau 30s. Được gọi ngay khi module load.
 */
async function checkElasticsearch() {
  try {
    await client.ping();
    esAvailable = true;
  } catch {
    if (esAvailable !== false) {
      console.warn("[Elasticsearch] Không kết nối được — sẽ dùng SQL fallback");
    }
    esAvailable = false;
    scheduleEsRetry();
  }
}

// Kiểm tra ngay khi module load
checkElasticsearch();

/**
 * ES có đang sẵn sàng nhận query không (theo lần kiểm tra gần nhất).
 * Các hàm search dùng cờ này để quyết định đi đường ES hay SQL fallback
 * mà không phải ping trước mỗi query.
 * @returns {boolean}
 */
function isEsUp() {
  return esAvailable === true;
}

// ========== Helpers ==========
/**
 * Lấy tổng số hit từ response ES — xử lý cả 2 format:
 * số thuần (ES cũ / rest_total_hits_as_int) và object `{ value, relation }` (ES 7+).
 * @param {object} result - Response từ client.search().
 * @returns {number} Tổng số document khớp.
 */
function getHitTotal(result) {
  const total = result.hits?.total;
  return typeof total === "number" ? total : total?.value || 0;
}

/**
 * Chuyển mảng hits của ES thành mảng story object phẳng:
 * gộp `_source` và ép `_id` (string) về `id` (number) cho khớp kiểu với PostgreSQL.
 * @param {object} result - Response từ client.search().
 * @returns {Array<object>} Danh sách truyện.
 */
function mapHits(result) {
  return result.hits.hits.map((hit) => ({
    id: Number(hit._id),
    ...hit._source,
  }));
}

// ========== Index management ==========
/**
 * Đảm bảo index `stories` tồn tại trên Elasticsearch — tạo mới với mapping chuẩn
 * (vietnamese_analyzer bỏ dấu + dense_vector 1536 chiều cho semantic search) nếu chưa có.
 * @returns {Promise<{created: boolean, indexName: string}>} `created: true` nếu vừa tạo mới.
 */
async function ensureStoriesIndex() {
  const exists = await client.indices.exists({ index: indexName });
  if (exists) return { created: false, indexName };

  await client.indices.create({ index: indexName, ...STORIES_INDEX_BODY });
  return { created: true, indexName };
}

/**
 * Đồng bộ toàn bộ bảng `stories` từ PostgreSQL sang Elasticsearch (full re-index).
 *
 * - Với mỗi truyện, cố gắng sinh embedding OpenAI (tuần tự + delay 300ms để tránh
 *   rate limit); truyện không sinh được embedding vẫn được index bình thường
 *   (chỉ mất khả năng semantic search).
 * - Đẩy tất cả bằng 1 lệnh bulk, `refresh: true` để kết quả tìm được ngay.
 *
 * Được gọi từ script `npm run es:sync` và sau khi crawl (POST /api/stories/sync).
 * @returns {Promise<{indexed: number, withEmbedding?: number, errors: boolean}>}
 */
async function syncStoriesFromSql() {
  await ensureStoriesIndex();

  const { rows: stories } = await pool.query("SELECT * FROM stories;");
  if (!stories.length) return { indexed: 0, errors: false };

  // Generate embedding tuần tự + delay 300ms để không vượt rate limit OpenAI
  const docs = [];
  for (let i = 0; i < stories.length; i++) {
    const vector = await createStoryEmbedding(stories[i]);
    docs.push(vector ? { ...stories[i], embedding: vector } : stories[i]);
    if (i < stories.length - 1) await new Promise((r) => setTimeout(r, 300));
  }

  const operations = docs.flatMap((doc) => [
    { index: { _index: indexName, _id: String(doc.id) } },
    doc,
  ]);

  const result = await client.bulk({ refresh: true, operations });
  const withEmbedding = docs.filter((d) => d.embedding).length;
  return { indexed: stories.length, withEmbedding, errors: Boolean(result.errors) };
}

// ========== Search ==========
/**
 * Entry point tìm kiếm/liệt kê truyện cho GET /api/stories — tự chọn engine phù hợp.
 *
 * Thứ tự quyết định:
 *   1. Có từ khóa + không cần sort/length đặc biệt + ES đang lên → Elasticsearch
 *      (ES lỗi giữa chừng → hạ cờ circuit breaker, rơi tiếp xuống SQL).
 *   2. Không filter gì cả (trang chủ mặc định) → fast path `listStoriesFromSql`.
 *   3. Còn lại → `searchStoriesFromSql` (ILIKE + genre overlap + sort/length động).
 *
 * @param {object} opts
 * @param {string} [opts.search] - Từ khóa tìm kiếm.
 * @param {number} [opts.page=1] - Trang hiện tại (1-based).
 * @param {number} [opts.limit=12] - Số truyện mỗi trang.
 * @param {string|null} [opts.status] - Lọc theo trạng thái truyện.
 * @param {string[]|null} [opts.genres] - Lọc: truyện có ít nhất 1 thể loại trùng.
 * @param {string} [opts.sort="newest"] - newest | views | rating | az.
 * @param {string|null} [opts.length] - short (<50 chương) | medium (50-200) | long (>200).
 * @returns {Promise<{page, total, totalPages, stories, source}>} `source` cho biết engine đã dùng.
 */
async function searchStoriesWithSqlFallback({ search, page = 1, limit = 12, status = null, genres = null, sort = "newest", length = null }) {
  // length và sort khác "newest" (views/rating/az) cần dữ liệu không có trong chỉ mục
  // Elasticsearch hiện tại (số chương, rating trung bình, title.keyword để sort chữ cái),
  // nên luôn xử lý bằng SQL. genres thì đã có sẵn trong mapping nên có thể lọc ngay trong ES.
  const needsSqlOnlySort = !!(length || (sort && sort !== "newest"));
  const hasGenreFilter = !!(genres && genres.length);

  // Dùng ES cho text search kết hợp được với lọc thể loại — chỉ rơi về SQL khi cần sort/length
  // mà ES không có dữ liệu để xử lý
  if (search && !needsSqlOnlySort && isEsUp()) {
    try {
      return await searchStoriesWithElasticsearch({ search, page, limit, status, genres: hasGenreFilter ? genres : null });
    } catch (err) {
      console.warn("[Elasticsearch] search error:", err.message || err.name);
      esAvailable = false;
      scheduleEsRetry();
    }
  }

  // Default view không có filter → fast path
  if (!search && !needsSqlOnlySort && !hasGenreFilter && !status) {
    return listStoriesFromSql({ page, limit, status: null });
  }

  return searchStoriesFromSql({ search, page, limit, status, genres, sort, length, fallback: !!(search && !isEsUp()) });
}

/**
 * Tìm truyện trên Elasticsearch theo chiến lược 3 bước, dừng ở bước đầu tiên có kết quả:
 *
 *   Bước 1 — `match_phrase` trên title (slop 1): ưu tiên khớp đúng tên truyện.
 *   Bước 2 — KNN semantic search trên trường `embedding` (chỉ khi có OPENAI_KEY):
 *            hiểu được query mô tả ý nghĩa thay vì từ khóa chính xác.
 *   Bước 3 — `multi_match` fuzzy trên title/author/genres/description với
 *            minimum_should_match "2<75%" để loại kết quả chỉ khớp 1 từ chung chung.
 *
 * Filter status/genres được áp ở cả 3 bước. Query được bỏ dấu tiếng Việt trước
 * khi fuzzy match (khớp với asciifolding trong analyzer).
 *
 * @returns {Promise<{page, total, totalPages, stories, source}>}
 *   `source`: "elasticsearch" hoặc "elasticsearch-hybrid" (đi đường KNN).
 */
async function searchStoriesWithElasticsearch({ search, page, limit, status = null, genres = null }) {
  const offset = (page - 1) * limit;
  const normalizedSearch = removeVietnameseTones(search.toLowerCase());
  const filterClauses = [];
  if (status) filterClauses.push({ term: { status } });
  if (genres && genres.length) {
    // genres là text field đã phân tích (asciifolding) — dùng match thay vì term,
    // should + minimum_should_match 1 để khớp ngữ nghĩa "có ít nhất một thể loại trùng"
    // tương đương phép toán && (overlap) đang dùng ở nhánh SQL
    filterClauses.push({
      bool: {
        should: genres.map((g) => ({ match: { genres: g } })),
        minimum_should_match: 1,
      },
    });
  }

  // Bước 1 — match_phrase ưu tiên tên chính xác
  let result = await client.search({
    index: indexName,
    from: offset,
    size: limit,
    track_total_hits: true,
    query: { bool: { must: { match_phrase: { title: { query: search, slop: 1 } } }, filter: filterClauses } },
  });

  if (getHitTotal(result) > 0) {
    const total = getHitTotal(result);
    return {
      page,
      total,
      totalPages: Math.ceil(total / limit),
      stories: mapHits(result),
      source: "elasticsearch",
    };
  }

  // Bước 2 — Tìm kiếm ngữ nghĩa bằng KNN nếu có OPENAI_KEY, ngược lại rơi xuống Bước 3
  if (process.env.OPENAI_KEY) {
    const vector = await embedText(search);
    if (vector) {
      // Pure KNN — cosine similarity làm thước đo duy nhất để tránh BM25 scale lấn át.
      // total lấy theo k (kích thước pool ứng viên) vì knn không có khái niệm "tổng số tài
      // liệu khớp" như query thường — nó luôn xếp hạng toàn bộ index rồi cắt lấy k láng giềng
      // gần nhất, nên from/size chỉ có ý nghĩa phân trang trong phạm vi k đó.
      const k = Math.max(limit * 4, 50);
      const knnFilter = filterClauses.length ? { bool: { filter: filterClauses } } : undefined;
      result = await client.search({
        index: indexName,
        from: offset,
        size: limit,
        knn: {
          field: "embedding",
          query_vector: vector,
          k,
          num_candidates: Math.max(limit * 8, 100),
          ...(knnFilter && { filter: knnFilter }),
        },
      });
      return {
        page,
        total: k,
        totalPages: Math.ceil(k / limit),
        stories: mapHits(result),
        source: "elasticsearch-hybrid",
      };
    }
  }

  // Fallback — keyword search
  //
  // minimum_should_match "2<75%":
  //   ≤ 2 từ → tất cả phải khớp (tránh "tu" match lung tung)
  //   > 2 từ → 75% phải khớp (floor: 3 từ→2, 4 từ→3)
  // Điều này lọc kết quả chỉ khớp 1 từ chung chung như "truyen"
  result = await client.search({
    index: indexName,
    from: offset,
    size: limit,
    track_total_hits: true,
    query: {
      bool: {
        must: {
          multi_match: {
            query: normalizedSearch,
            fields: ["title^3", "author^2", "genres^2", "description"],
            fuzziness: "AUTO",
            type: "best_fields",
            minimum_should_match: "2<75%",
          },
        },
        filter: filterClauses,
      },
    },
  });

  const total = getHitTotal(result);
  return {
    page,
    total,
    totalPages: Math.ceil(total / limit),
    stories: mapHits(result),
    source: "elasticsearch",
  };
}

/**
 * Liệt kê truyện từ PostgreSQL không tìm kiếm — fast path cho trang chủ mặc định.
 * Sort cố định theo `created_at DESC` (truyện mới nhất), phân trang bằng LIMIT/OFFSET,
 * tùy chọn lọc theo status.
 * @returns {Promise<{page, total, totalPages, stories, source: "postgres"}>}
 */
async function listStoriesFromSql({ page, limit, status = null }) {
  const offset = (page - 1) * limit;

  if (status) {
    const totalRes = await pool.query(
      `SELECT COUNT(*) FROM stories WHERE status = $1`,
      [status]
    );
    const total = Number(totalRes.rows[0].count);
    const result = await pool.query(
      `SELECT * FROM stories WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    return { page, total, totalPages: Math.ceil(total / limit), stories: result.rows, source: "postgres" };
  }

  const totalRes = await pool.query(`SELECT COUNT(*) FROM stories`);
  const total = Number(totalRes.rows[0].count);
  const result = await pool.query(
    `SELECT * FROM stories ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return { page, total, totalPages: Math.ceil(total / limit), stories: result.rows, source: "postgres" };
}

/**
 * Tìm kiếm truyện thuần SQL — xử lý mọi tổ hợp filter/sort mà ES không hỗ trợ,
 * đồng thời là đường fallback khi ES down.
 *
 * Build câu SQL động (luôn parameterized $1, $2...):
 *   - search: ILIKE trên title/author/description/genres (gộp mảng bằng array_to_string).
 *   - genres: toán tử overlap `&&` — truyện có ít nhất 1 thể loại trùng.
 *   - length: JOIN chapters + GROUP BY + HAVING COUNT theo ngưỡng short/medium/long.
 *   - sort=rating: JOIN ratings + AVG; views: view_count DESC; az: title ASC.
 *   - Câu COUNT tổng được chọn tương ứng (subquery khi có HAVING, COUNT DISTINCT khi có GROUP BY).
 *
 * @param {object} opts - Như searchStoriesWithSqlFallback, thêm:
 * @param {boolean} [opts.fallback=false] - true khi được gọi do ES down (đánh dấu trong `source`).
 * @returns {Promise<{page, total, totalPages, stories, source: "postgres"|"postgres-fallback"}>}
 */
async function searchStoriesFromSql({ search, page, limit, status = null, genres = null, sort = "newest", length = null, fallback = false }) {
  const offset = (page - 1) * limit;
  const params = [];
  const conditions = [];

  if (search) {
    params.push(`%${search}%`);
    const p = params.length;
    conditions.push(`(s.title ILIKE $${p} OR s.author ILIKE $${p} OR s.description ILIKE $${p} OR array_to_string(s.genres, ' ') ILIKE $${p})`);
  }

  if (status) {
    params.push(status);
    conditions.push(`s.status = $${params.length}`);
  }

  if (genres && genres.length > 0) {
    params.push(genres);
    conditions.push(`s.genres && $${params.length}::text[]`);
  }

  const needChapters = !!length;
  const needRating   = sort === "rating";
  const needGroup    = needChapters || needRating;

  const chapterJoin  = needChapters ? "LEFT JOIN chapters c ON c.story_id = s.id" : "";
  const ratingJoin   = needRating   ? "LEFT JOIN ratings r ON r.story_id = s.id"  : "";
  const ratingSelect = needRating   ? ", COALESCE(AVG(r.rating), 0) AS avg_rating" : "";
  const groupBy      = needGroup    ? "GROUP BY s.id" : "";

  let having = "";
  if (length === "short")  having = "HAVING COUNT(c.id) < 50";
  else if (length === "medium") having = "HAVING COUNT(c.id) BETWEEN 50 AND 200";
  else if (length === "long")   having = "HAVING COUNT(c.id) > 200";

  let orderBy;
  switch (sort) {
    case "views":  orderBy = "ORDER BY s.view_count DESC NULLS LAST"; break;
    case "rating": orderBy = "ORDER BY avg_rating DESC NULLS LAST, s.view_count DESC NULLS LAST"; break;
    case "az":     orderBy = "ORDER BY s.title ASC"; break;
    default:       orderBy = "ORDER BY s.created_at DESC";
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  let countSql;
  if (having) {
    countSql = `SELECT COUNT(*) FROM (
      SELECT s.id FROM stories s ${chapterJoin} ${ratingJoin} ${where} ${groupBy} ${having}
    ) AS _cnt`;
  } else if (needGroup) {
    countSql = `SELECT COUNT(DISTINCT s.id) FROM stories s ${chapterJoin} ${ratingJoin} ${where}`;
  } else {
    countSql = `SELECT COUNT(*) FROM stories s ${where}`;
  }

  const totalRes = await pool.query(countSql, params);
  const total = Number(totalRes.rows[0].count);

  params.push(limit, offset);
  const dataSql = `
    SELECT s.*${ratingSelect}
    FROM stories s ${chapterJoin} ${ratingJoin}
    ${where}
    ${groupBy}
    ${having}
    ${orderBy}
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(dataSql, params);
  return {
    page,
    total,
    totalPages: Math.ceil(total / limit),
    stories: result.rows,
    source: fallback ? "postgres-fallback" : "postgres",
  };
}

// ========== Suggest (autocomplete) ==========
const _suggestCache = new Map();
const SUGGEST_CACHE_TTL_MS = 10_000;

// Xóa cache entry cũ mỗi phút để tránh memory leak
setInterval(() => {
  const cutoff = Date.now() - SUGGEST_CACHE_TTL_MS;
  for (const [key, entry] of _suggestCache) {
    if (entry.ts < cutoff) _suggestCache.delete(key);
  }
}, 60_000);

/**
 * Autocomplete gợi ý truyện khi người dùng gõ ô tìm kiếm (GET /api/stories/search).
 *
 * - Cache in-memory 10s theo query — hấp thụ các lần gõ lặp/từng-ký-tự, giảm tải ES/DB.
 * - Ưu tiên Elasticsearch (prefix match); ES lỗi → hạ cờ circuit breaker và
 *   fallback SQL ILIKE trong suốt với caller.
 *
 * @param {string} query - Chuỗi người dùng đang gõ.
 * @returns {Promise<Array<object>>} Tối đa 10 truyện gợi ý (id, title, author, genres, cover_url).
 */
async function suggestStories(query) {
  if (!query) return [];

  const cached = _suggestCache.get(query);
  if (cached && Date.now() - cached.ts < SUGGEST_CACHE_TTL_MS) return cached.data;

  let data;
  if (isEsUp()) {
    try {
      data = await suggestStoriesWithElasticsearch(query);
    } catch (err) {
      console.warn("[Elasticsearch] suggest error:", err.message || err.name);
      esAvailable = false;
      scheduleEsRetry();
    }
  }

  if (!data) data = await suggestStoriesFromSql(query);

  _suggestCache.set(query, { data, ts: Date.now() });
  return data;
}


/**
 * Autocomplete trên Elasticsearch — kết hợp 2 chiến lược trong 1 bool should:
 *   - `match_phrase_prefix` trên title: ưu tiên truyện có tên bắt đầu bằng query.
 *   - `multi_match bool_prefix` trên bản đã bỏ dấu: khớp tiền tố từng từ
 *     ("truyen" khớp "truyện tranh", "truyện ngắn", ...), có fuzzy chịu lỗi gõ.
 * Chỉ lấy các field cần hiển thị dropdown (_source giới hạn), tối đa 10 kết quả.
 * @param {string} query
 * @returns {Promise<Array<object>>}
 */
async function suggestStoriesWithElasticsearch(query) {
  const normalizedQuery = removeVietnameseTones(query.toLowerCase());

  const result = await client.search({
    index: indexName,
    size: 10,
    query: {
      bool: {
        should: [
          { match_phrase_prefix: { title: { query, slop: 1 } } },
          {
            multi_match: {
              query: normalizedQuery,
              fields: ["title^3", "author^2", "genres"],
              fuzziness: "AUTO",
              type: "bool_prefix",
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    _source: ["id", "title", "author", "genres", "cover_url"],
  });

  return mapHits(result);
}


/**
 * Autocomplete fallback bằng SQL khi ES down: ILIKE trên title/author/genres,
 * xếp theo view_count để truyện phổ biến nổi lên trước, tối đa 10 kết quả.
 * @param {string} query
 * @returns {Promise<Array<object>>}
 */
async function suggestStoriesFromSql(query) {
  const keyword = `%${query}%`;
  const result = await pool.query(
    `SELECT id, title, author, genres, cover_url
     FROM stories
     WHERE title ILIKE $1 OR author ILIKE $1 OR array_to_string(genres, ' ') ILIKE $1
     ORDER BY view_count DESC NULLS LAST
     LIMIT 10;`,
    [keyword]
  );
  return result.rows;
}

// ========== Search by description (chatbot recommendation) ==========

/**
 * Nhờ AI (callAIRaw — model nhỏ, nhanh) mở rộng query mô tả thành các từ khóa cụ thể.
 *
 * Ví dụ "truyện về đầu bếp" → ["ẩm thực", "nấu ăn", "món ăn"] — giúp keyword search
 * bắt được truyện mà mô tả không chứa nguyên văn query. Kết quả được làm sạch
 * (bỏ bullet/số thứ tự, lọc chuỗi quá ngắn/dài) và cắt còn tối đa 3 từ khóa.
 * AI lỗi → trả mảng rỗng, search vẫn tiếp tục với query gốc.
 *
 * @param {string} query - Yêu cầu tìm truyện của người dùng.
 * @returns {Promise<string[]>} Tối đa 3 từ khóa mở rộng.
 */
async function expandSearchQuery(query) {
  try {
    const result = await callAIRaw([
      {
        role: "user",
        content: `Yêu cầu tìm truyện tranh: "${query}"

Liệt kê 6 từ khoá tiếng Việt hoặc tiếng Anh để tìm truyện phù hợp. Bao gồm: tên riêng, món ăn, địa danh, nhân vật, thể loại, chủ đề liên quan.
Chỉ trả về từ khoá, cách nhau bằng dấu phẩy, không giải thích.`,
      },
    ]);
    return result
      .split(/[,\n]/)
      .map((k) => k.trim().replace(/^[-•*\d.]+\s*/, ""))
      .filter((k) => k.length > 1 && k.length < 40)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Tìm truyện theo mô tả tự do — dùng cho chatbot gợi ý truyện (chatRoutes).
 *
 * Pipeline: mở rộng query bằng AI (nếu query ≥ 4 ký tự) → tìm trên ES với toàn bộ
 * từ khóa (query gốc được boost cao hơn) → ES lỗi/down thì fallback SQL ILIKE.
 *
 * @param {object} opts
 * @param {string} opts.query - Mô tả/yêu cầu của người dùng.
 * @param {number|null} [opts.excludeId] - Loại truyện đang đọc khỏi kết quả (tránh gợi ý lại chính nó).
 * @param {number} [opts.limit=5] - Số truyện tối đa trả về.
 * @returns {Promise<Array<object>>} Danh sách truyện phù hợp.
 */
async function searchByDescription({ query, excludeId = null, limit = 5 }) {
  // Chỉ expand khi query đủ dài và có ý nghĩa tìm kiếm
  const shouldExpand = query.length >= 4;
  const expandedKeywords = shouldExpand ? await expandSearchQuery(query) : [];
  const allQueries = [query, ...expandedKeywords];

  if (isEsUp()) {
    try {
      return await searchByDescriptionES({ queries: allQueries, excludeId, limit });
    } catch (err) {
      console.warn("[searchService] searchByDescription ES:", err.message || err.name);
    }
  }
  return searchByDescriptionSQL({ queries: allQueries, excludeId, limit });
}

/**
 * Tìm theo mô tả trên Elasticsearch: mỗi từ khóa thành 1 clause `multi_match` fuzzy
 * (genres được boost cao nhất vì gợi ý thường xoay quanh thể loại; query gốc boost x2).
 * Nếu có OPENAI_KEY và sinh được embedding → chạy hybrid: KNN semantic (boost 0.5)
 * cộng điểm với keyword search trong cùng 1 request.
 *
 * @param {object} opts
 * @param {string[]} opts.queries - [query gốc, ...từ khóa mở rộng].
 * @param {number|null} opts.excludeId - ID truyện cần loại (must_not).
 * @param {number} opts.limit
 * @returns {Promise<Array<object>>}
 */
async function searchByDescriptionES({ queries, excludeId, limit }) {
  const mustNot = excludeId ? [{ term: { id: excludeId } }] : [];

  // asciifolding analyzer đã xử lý Vietnamese normalization — không cần gửi cả bản normalized
  // fuzzy_rewrite: "top_terms_16" giới hạn clause expansion, tránh lỗi "too many clauses"
  const shouldClauses = queries.map((term, i) => ({
    multi_match: {
      query: term,
      fields: ["genres^3", "title^2", "description", "author"],
      fuzziness: "AUTO",
      fuzzy_rewrite: "top_terms_16",
      type: "best_fields",
      boost: i === 0 ? 2 : 1,
    },
  }));

  // Thêm knn nếu có OPENAI_KEY và stories đã có embedding
  if (process.env.OPENAI_KEY) {
    const vector = await embedText(queries.join(" "));
    if (vector) {
      const result = await client.search({
        index: indexName,
        size: limit,
        knn: {
          field: "embedding",
          query_vector: vector,
          k: limit * 3,
          num_candidates: 150,
          boost: 0.5,
        },
        query: {
          bool: { should: shouldClauses, must_not: mustNot, minimum_should_match: 1 },
        },
        _source: ["id", "title", "author", "cover_url", "genres", "description"],
      });
      return mapHits(result);
    }
  }

  const result = await client.search({
    index: indexName,
    size: limit,
    query: {
      bool: { should: shouldClauses, must_not: mustNot, minimum_should_match: 1 },
    },
    _source: ["id", "title", "author", "cover_url", "genres", "description"],
  });

  return mapHits(result);
}

/**
 * Fallback SQL cho tìm theo mô tả: OR các điều kiện ILIKE của từng từ khóa trên
 * title/author/description/genres, loại excludeId, xếp theo view_count DESC.
 * Luôn parameterized để chống SQL injection.
 *
 * @param {object} opts - Cùng shape với searchByDescriptionES.
 * @returns {Promise<Array<object>>}
 */
async function searchByDescriptionSQL({ queries, excludeId, limit }) {
  const params = [];
  const conditions = queries.map((q) => {
    params.push(`%${q}%`);
    const i = params.length;
    return `(title ILIKE $${i} OR author ILIKE $${i} OR description ILIKE $${i} OR array_to_string(genres, ' ') ILIKE $${i})`;
  });

  let excludeClause = "";
  if (excludeId) {
    params.push(excludeId);
    excludeClause = `AND id != $${params.length}`;
  }

  params.push(limit);
  const limitIdx = params.length;

  const result = await pool.query(
    `SELECT id, title, author, cover_url, genres, description
     FROM stories
     WHERE (${conditions.join(" OR ")})
     ${excludeClause}
     ORDER BY view_count DESC NULLS LAST
     LIMIT $${limitIdx}`,
    params
  );
  return result.rows;
}

// ========== Single story index/delete ==========
/**
 * Index (thêm/cập nhật) 1 truyện lên Elasticsearch — gọi sau mỗi CREATE/UPDATE truyện
 * để chỉ mục tìm kiếm luôn khớp với PostgreSQL.
 *
 * Cố gắng sinh embedding trước khi index; refresh ngay để truyện tìm được tức thì.
 * Best-effort: ES down hoặc lỗi → trả false và chỉ log warn, KHÔNG throw —
 * thao tác ghi DB chính không được phép thất bại vì lỗi chỉ mục phụ.
 *
 * @param {object} story - Row truyện đầy đủ từ PostgreSQL.
 * @returns {Promise<boolean>} true nếu index thành công.
 */
async function indexStory(story) {
  if (!isEsUp()) return false;
  try {
    await ensureStoriesIndex();
    const vector = await createStoryEmbedding(story);
    const document = vector ? { ...story, embedding: vector } : story;
    await client.index({ index: indexName, id: String(story.id), document });
    await client.indices.refresh({ index: indexName });
    return true;
  } catch (err) {
    console.warn("[Elasticsearch] indexStory:", err.message || err.name);
    return false;
  }
}

/**
 * Xóa 1 truyện khỏi chỉ mục Elasticsearch — gọi sau khi DELETE truyện trong PostgreSQL.
 * Best-effort như indexStory: ES down, document không tồn tại (404), hay lỗi khác
 * đều trả false, không throw.
 *
 * @param {number} id - ID truyện cần xóa khỏi index.
 * @returns {Promise<boolean>} true nếu xóa thành công.
 */
async function deleteStory(id) {
  if (!isEsUp()) return false;
  try {
    await client.delete({ index: indexName, id: String(id) });
    return true;
  } catch (err) {
    if (err.meta?.statusCode === 404) return false;
    console.warn("[Elasticsearch] deleteStory:", err.message || err.name);
    return false;
  }
}

module.exports = {
  ensureStoriesIndex,
  syncStoriesFromSql,
  searchStoriesWithSqlFallback,
  suggestStories,
  indexStory,
  deleteStory,
  searchByDescription,
};
