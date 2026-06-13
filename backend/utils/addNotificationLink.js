const pool = require('../config/pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS link TEXT
    `);
    console.log('[migration] Đã thêm cột link vào bảng notifications');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('[migration] Thất bại:', err);
  process.exit(1);
});
