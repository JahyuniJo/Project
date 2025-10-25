const client = require('../config/elasticsearch');

async function createStoriesIndex() {
  const indexName = 'stories';

  const exists = await client.indices.exists({ index: indexName });
  if (exists) {
    console.log('Index stories đã tồn tại');
    return;
  }

  await client.indices.create({
    index: indexName,
    body: {
      settings: {
        analysis: {
          analyzer: {
            vietnamese_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'asciifolding'] // bỏ dấu tiếng Việt
            }
          }
        }
      },
      mappings: {
        properties: {
          id: { type: 'integer' },
          title: { type: 'text', analyzer: 'vietnamese_analyzer' },
          author: { type: 'text', analyzer: 'vietnamese_analyzer' },
          genres: { type: 'text', analyzer: 'vietnamese_analyzer' },
          description: { type: 'text', analyzer: 'vietnamese_analyzer' },
          cover_url: { type: 'keyword' },
          created_at: { type: 'date' }
        }
      }
    }
  });

  console.log('✅ Đã tạo index stories');
}

createStoriesIndex().catch(console.error);
