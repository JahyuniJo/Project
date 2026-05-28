const pool = require("../config/pool");
const { client, indexName } = require("../config/elasticsearch");
const { removeVietnameseTones } = require("../utils/normalizeText");

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
    },
  },
};

// ========== Circuit breaker ==========
// null = chưa kiểm tra, true = ES đang lên, false = ES đang xuống
let esAvailable = null;
const ES_RETRY_INTERVAL_MS = 30_000;

async function checkElasticsearch() {
  try {
    await client.ping();
    if (esAvailable !== true) {
      console.log("[Elasticsearch] Kết nối thành công");
    }
    esAvailable = true;
  } catch {
    if (esAvailable !== false) {
      console.warn("[Elasticsearch] Không kết nối được — sẽ dùng SQL fallback");
    }
    esAvailable = false;
    setTimeout(checkElasticsearch, ES_RETRY_INTERVAL_MS);
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

  const operations = stories.flatMap((story) => [
    { index: { _index: indexName, _id: String(story.id) } },
    story,
  ]);

  const result = await client.bulk({ refresh: true, operations });
  return { indexed: stories.length, errors: Boolean(result.errors) };
}

// ========== Search ==========
async function searchStoriesWithSqlFallback({ search, page = 1, limit = 12 }) {
  if (!search) return listStoriesFromSql({ page, limit });

  if (isEsUp()) {
    try {
      return await searchStoriesWithElasticsearch({ search, page, limit });
    } catch (err) {
      console.warn("[Elasticsearch] search error:", err.message || err.name);
      esAvailable = false;
      setTimeout(checkElasticsearch, ES_RETRY_INTERVAL_MS);
    }
  }

  return searchStoriesFromSql({ search, page, limit, fallback: true });
}

async function searchStoriesWithElasticsearch({ search, page, limit }) {
  const offset = (page - 1) * limit;
  const normalizedSearch = removeVietnameseTones(search.toLowerCase());

  let result = await client.search({
    index: indexName,
    from: offset,
    size: limit,
    track_total_hits: true,
    query: { match_phrase: { title: { query: search, slop: 1 } } },
  });

  if (getHitTotal(result) === 0) {
    result = await client.search({
      index: indexName,
      from: offset,
      size: limit,
      track_total_hits: true,
      query: {
        multi_match: {
          query: normalizedSearch,
          fields: ["title^3", "author^2", "genres", "description"],
          fuzziness: "AUTO",
          type: "best_fields",
        },
      },
    });
  }

  const total = getHitTotal(result);
  return {
    page,
    total,
    totalPages: Math.ceil(total / limit),
    stories: mapHits(result),
    source: "elasticsearch",
  };
}

async function listStoriesFromSql({ page, limit }) {
  const offset = (page - 1) * limit;
  const totalRes = await pool.query("SELECT COUNT(*) FROM stories;");
  const total = Number(totalRes.rows[0].count);
  const result = await pool.query(
    "SELECT * FROM stories ORDER BY id ASC LIMIT $1 OFFSET $2;",
    [limit, offset]
  );
  return {
    page,
    total,
    totalPages: Math.ceil(total / limit),
    stories: result.rows,
    source: "postgres",
  };
}

async function searchStoriesFromSql({ search, page, limit, fallback = false }) {
  const offset = (page - 1) * limit;
  const keyword = `%${search}%`;
  const where = `
    title ILIKE $1 OR author ILIKE $1
    OR description ILIKE $1
    OR array_to_string(genres, ' ') ILIKE $1
  `;
  const totalRes = await pool.query(`SELECT COUNT(*) FROM stories WHERE ${where};`, [keyword]);
  const total = Number(totalRes.rows[0].count);
  const result = await pool.query(
    `SELECT * FROM stories WHERE ${where} ORDER BY id ASC LIMIT $2 OFFSET $3;`,
    [keyword, limit, offset]
  );
  return {
    page,
    total,
    totalPages: Math.ceil(total / limit),
    stories: result.rows,
    source: fallback ? "postgres-fallback" : "postgres",
  };
}

// ========== Suggest (autocomplete) ==========
async function suggestStories(query) {
  if (!query) return [];

  if (isEsUp()) {
    try {
      return await suggestStoriesWithElasticsearch(query);
    } catch (err) {
      console.warn("[Elasticsearch] suggest error:", err.message || err.name);
      esAvailable = false;
      setTimeout(checkElasticsearch, ES_RETRY_INTERVAL_MS);
    }
  }

  return suggestStoriesFromSql(query);
}

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
    _source: ["id", "title", "author", "cover_url"],
  });

  return mapHits(result).map(({ id, title, author, cover_url }) => ({
    id,
    title,
    author,
    cover_url,
  }));
}

async function suggestStoriesFromSql(query) {
  const keyword = `%${query}%`;
  const result = await pool.query(
    `SELECT id, title, author, cover_url
     FROM stories
     WHERE title ILIKE $1 OR author ILIKE $1 OR array_to_string(genres, ' ') ILIKE $1
     ORDER BY view_count DESC NULLS LAST
     LIMIT 10;`,
    [keyword]
  );
  return result.rows;
}

// ========== Single story index/delete ==========
async function indexStory(story) {
  if (!isEsUp()) return false;
  try {
    await ensureStoriesIndex();
    await client.index({ index: indexName, id: String(story.id), document: story });
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
};
