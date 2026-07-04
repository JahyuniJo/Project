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

function scheduleEsRetry() {
  if (_esRetryTimer) return;
  _esRetryTimer = setTimeout(() => {
    _esRetryTimer = null;
    checkElasticsearch();
  }, ES_RETRY_INTERVAL_MS);
}

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

function isEsUp() {
  return esAvailable === true;
}

// ========== Helpers ==========
function getHitTotal(result) {
  const total = result.hits?.total;
  return typeof total === "number" ? total : total?.value || 0;
}

function mapHits(result) {
  return result.hits.hits.map((hit) => ({
    id: Number(hit._id),
    ...hit._source,
  }));
}

// ========== Index management ==========
async function ensureStoriesIndex() {
  const exists = await client.indices.exists({ index: indexName });
  if (exists) return { created: false, indexName };

  await client.indices.create({ index: indexName, ...STORIES_INDEX_BODY });
  return { created: true, indexName };
}

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

async function suggestStories(query) {
  if (!query) return [];  // Nếu query rỗng, trả về mảng rỗng ngay lập tức

  const cached = _suggestCache.get(query); // Kiểm tra cache để tránh gọi ES/SQL quá nhiều lần trong thời gian ngắn
  if (cached && Date.now() - cached.ts < SUGGEST_CACHE_TTL_MS) return cached.data;  // Nếu cache còn hạn, trả về dữ liệu đã lưu

  let data;
  if (isEsUp()) {  // Kiểm tra ES đang hoạt động, nếu không sẽ fallback về SQL
    try {
      data = await suggestStoriesWithElasticsearch(query); // Gọi service để lấy gợi ý truyện từ Elasticsearch
    } catch (err) {
      console.warn("[Elasticsearch] suggest error:", err.message || err.name);
      esAvailable = false;  // Cập nhật trạng thái ES không hoạt động
      scheduleEsRetry();  // Lịch ping lại ES sau 1 phút
    }
  }

  if (!data) data = await suggestStoriesFromSql(query);  // Nếu ES không hoạt động hoặc lỗi, fallback về SQL 

  _suggestCache.set(query, { data, ts: Date.now() });  // Lưu cache
  return data;
}


// Gọi service để lấy gợi ý truyện từ Elasticsearch
async function suggestStoriesWithElasticsearch(query) {
  const normalizedQuery = removeVietnameseTones(query.toLowerCase()); // Chuẩn hóa query để tìm kiếm không phân biệt dấu tiếng Việt

  const result = await client.search({
    index: indexName,
    size: 10, // tối đa 10 kết quả gợi ý
    query: {
      bool: {
        should: [ // Sử dụng match_phrase_prefix để ưu tiên các truyện có title bắt đầu bằng query, 
        // sau đó sử dụng multi_match để tìm kiếm nâng cao
          { match_phrase_prefix: { title: { query, slop: 1 } } },
          {
            multi_match: {
              query: normalizedQuery,
              fields: ["title^3", "author^2", "genres"],
              fuzziness: "AUTO", // Cho phép tìm kiếm gần đúng (fuzzy search) để khớp các từ có lỗi chính tả hoặc biến thể
              type: "bool_prefix", // Cho phép tìm kiếm các từ có tiền tố giống với query, ví dụ "truyen" sẽ khớp với "truyen tranh", "truyen ngắn", v.v.
            },
          },
        ],
        minimum_should_match: 1, // Yêu cầu ít nhất một trong các điều kiện should phải khớp để trả về kết quả
      },
    },
    _source: ["id", "title", "author", "genres", "cover_url"], // Chỉ lấy các trường cần thiết để giảm tải dữ liệu trả về
  });

  return mapHits(result).map(({ id, title, author, genres, cover_url }) => ({
    id,
    title,
    author,
    genres,
    cover_url,
  }));
}


// Gọi service để lấy gợi ý truyện từ SQL nếu Elasticsearch không hoạt động hoặc lỗi
async function suggestStoriesFromSql(query) {
  const keyword = `%${query}%`;
  const result = await pool.query( // Sử dụng ILIKE để tìm kiếm không phân biệt chữ hoa/chữ thường
    // truyện hot lên trước bằng ORDER BY view_count DESC NULLS LAST, sau đó giới hạn 10 kết quả
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
      return mapHits(result).map(({ id, title, author, cover_url, genres, description }) => ({
        id, title, author, cover_url, genres, description,
      }));
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

  return mapHits(result).map(({ id, title, author, cover_url, genres, description }) => ({
    id, title, author, cover_url, genres, description,
  }));
}

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
