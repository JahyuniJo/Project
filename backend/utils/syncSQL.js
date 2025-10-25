const pool = require('../config/db');
const client = require('../config/elasticsearch');

async function syncStories() {
  const res = await pool.query('SELECT * FROM stories;');
  const stories = res.rows;

  const body = stories.flatMap(story => [
    { index: { _index: 'stories', _id: story.id } },
    story
  ]);

  await client.bulk({ refresh: true, body });

  console.log(`✅ Đã sync ${stories.length} truyện lên Elasticsearch`);
}

syncStories().catch(console.error);
