const express = require("express");
const pool = require("../config/pool");
const { crawlChapterImages } = require("../crawlers/crawlChapterList");

const router = express.Router();

// GET /api/chapters/:id/content — lấy ảnh chương (lazy crawl + cache DB)
router.get("/:id/content", async (req, res) => {
  const chapterId = parseInt(req.params.id);
  if (!chapterId || chapterId <= 0) {
    return res.status(400).json({ message: "ID chương không hợp lệ" });
  }

  try {
    // Kiểm tra cache trong DB
    const cached = await pool.query(
      `SELECT cc.images, c.id, c.story_id, c.chapter_num, c.title
       FROM chapter_contents cc
       JOIN chapters c ON c.id = cc.chapter_id
       WHERE cc.chapter_id = $1`,
      [chapterId]
    );

    if (cached.rows.length) {
      const r = cached.rows[0];
      return res.json({
        images: r.images,
        chapter: { id: r.id, story_id: r.story_id, chapter_num: r.chapter_num, title: r.title },
      });
    }

    // Chưa có → lấy source_url rồi crawl
    const chRow = await pool.query(
      "SELECT id, story_id, chapter_num, title, source_url FROM chapters WHERE id = $1",
      [chapterId]
    );
    if (!chRow.rows.length) {
      return res.status(404).json({ message: "Không tìm thấy chương" });
    }

    const ch = chRow.rows[0];
    const { images, blocked } = await crawlChapterImages(ch.source_url);
    if (blocked) {
      return res.status(403).json({
        message: "Chương này yêu cầu đăng nhập tài khoản comi.mobi để đọc",
      });
    }
    if (!images.length) {
      console.error(`[chapterRoutes] 0 ảnh từ: ${ch.source_url}`);
      return res.status(404).json({ message: "Không tìm thấy ảnh trong chương này" });
    }

    await pool.query(
      "INSERT INTO chapter_contents (chapter_id, images) VALUES ($1, $2::jsonb) ON CONFLICT (chapter_id) DO NOTHING",
      [chapterId, JSON.stringify(images)]
    );

    res.json({
      images,
      chapter: { id: ch.id, story_id: ch.story_id, chapter_num: ch.chapter_num, title: ch.title },
    });
  } catch (err) {
    console.error("[chapterRoutes] content:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = router;
