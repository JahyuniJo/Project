// routes/interaction.js
const express = require('express');
const router = express.Router();
const pool = require('..config/db'); // pool = new Pool({...})

// --- Middleware gợi ý: lấy userId từ session/JWT ---
// Mình giả sử req.user?.id tồn tại khi user đã login.
// Nếu bạn chưa có auth, frontend có thể gửi user_id trong body (không an toàn).
function getUserId(req) {
  // try: req.user.id (passport/session) or req.auth?.id
  if (req.user && req.user.id) return req.user.id;
  if (req.body && req.body.user_id) return req.body.user_id; // fallback (not recommended)
  return null;
}

/* -----------------------
   FAVORITES
   POST /api/favorite        -> thêm vào yêu thích
   DELETE /api/favorite     -> xóa khỏi yêu thích (gửi body {story_id})
   GET /api/favorite/:userId -> lấy favorites của user
   GET /api/favorite/story/:storyId -> kiểm tra có bao nhiêu người thích (tùy chọn)
   ----------------------- */

// Thêm favorite
router.post('/favorite', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { story_id } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!story_id) return res.status(400).json({ error: 'story_id required' });

    await pool.query(
      `INSERT INTO favorites (user_id, story_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [userId, story_id]
    );
    res.json({ ok: true, message: 'Added to favorites' });
  } catch (err) {
    console.error('fav add error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Xóa favorite
router.delete('/favorite', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { story_id } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!story_id) return res.status(400).json({ error: 'story_id required' });

    await pool.query(
      `DELETE FROM favorites WHERE user_id=$1 AND story_id=$2`,
      [userId, story_id]
    );
    res.json({ ok: true, message: 'Removed from favorites' });
  } catch (err) {
    console.error('fav delete error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lấy favorites của user
router.get('/favorite/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `SELECT f.story_id, s.title, s.cover_url, s.author
       FROM favorites f
       JOIN stories s ON s.id = f.story_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('fav list error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Số người thích 1 truyện (tùy chọn)
router.get('/favorite/story/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;
    const r = await pool.query(`SELECT COUNT(*) AS cnt FROM favorites WHERE story_id=$1`, [storyId]);
    res.json({ count: parseInt(r.rows[0].cnt, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* -----------------------
   RATINGS
   POST /api/rate          -> thêm hoặc cập nhật rating (body: story_id, stars)
   GET  /api/rate/:storyId -> lấy avg rating + count + userRating (nếu user login)
   ----------------------- */

router.post('/rate', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { story_id, rating, stars } = req.body;
    // accept either rating or stars key
    const starsVal = rating || stars;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!story_id || !starsVal) return res.status(400).json({ error: 'story_id and stars required' });
    const starsInt = parseInt(starsVal, 10);
    if (isNaN(starsInt) || starsInt < 1 || starsInt > 5) return res.status(400).json({ error: 'stars must be 1-5' });

    // Upsert (insert or update)
    await pool.query(
      `INSERT INTO ratings (user_id, story_id, stars)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, story_id)
       DO UPDATE SET stars = EXCLUDED.stars, updated_at = NOW()`,
      [userId, story_id, starsInt]
    );

    // trả về avg & count
    const agg = await pool.query(
      `SELECT AVG(stars)::numeric(10,2) AS avg_rating, COUNT(*) AS cnt FROM ratings WHERE story_id=$1`,
      [story_id]
    );
    res.json({ ok: true, avg: parseFloat(agg.rows[0].avg_rating || 0), count: parseInt(agg.rows[0].cnt, 10) });
  } catch (err) {
    console.error('rating error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/rate/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = getUserId(req); // optional
    const agg = await pool.query(
      `SELECT AVG(stars)::numeric(10,2) AS avg_rating, COUNT(*) AS cnt FROM ratings WHERE story_id=$1`,
      [storyId]
    );
    let userRating = null;
    if (userId) {
      const r = await pool.query(`SELECT stars FROM ratings WHERE story_id=$1 AND user_id=$2`, [storyId, userId]);
      if (r.rows[0]) userRating = r.rows[0].stars;
    }
    res.json({
      avg: parseFloat(agg.rows[0].avg_rating || 0),
      count: parseInt(agg.rows[0].cnt, 10),
      userRating
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* -----------------------
   COMMENTS
   POST /api/comments      -> thêm bình luận (body: story_id, content)
   GET  /api/comments/:storyId -> lấy danh sách bình luận
   DELETE /api/comments/:id -> xóa bình luận (chỉ owner hoặc admin) - cần auth
   ----------------------- */

// Tạo bình luận
router.post('/comments', async (req, res) => {
  try {
    const userId = getUserId(req); // may be null -> anonymous
    const { story_id, content } = req.body;
    if (!story_id || !content) return res.status(400).json({ error: 'story_id and content required' });

    const r = await pool.query(
      `INSERT INTO comments (user_id, story_id, content) VALUES ($1,$2,$3) RETURNING id, user_id, story_id, content, created_at`,
      [userId, story_id, content]
    );
    res.json({ ok: true, comment: r.rows[0] });
  } catch (err) {
    console.error('comment create error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lấy bình luận của 1 truyện (mới nhất trước hoặc sau tuỳ bạn)
router.get('/comments/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;
    const r = await pool.query(
      `SELECT c.id, c.user_id, u.username, c.content, c.created_at
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.story_id = $1
       ORDER BY c.created_at DESC
       LIMIT 200`,
      [storyId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('comment list error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Xóa bình luận (chỉ owner hoặc admin) - đơn giản: owner only
router.delete('/comments/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    // kiểm tra owner
    const check = await pool.query(`SELECT user_id FROM comments WHERE id=$1`, [id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (check.rows[0].user_id !== userId) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(`DELETE FROM comments WHERE id=$1`, [id]);
    res.json({ ok: true, message: 'Deleted' });
  } catch (err) {
    console.error('comment delete error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
