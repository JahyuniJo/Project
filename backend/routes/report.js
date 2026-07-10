const path = require("path");
const express = require("express");
const multer = require("multer");
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/requireAdmin");

// Cấu hình multer cho ảnh chụp màn hình đính kèm báo lỗi: lưu vào backend/uploads/,
// tên file = timestamp + đuôi gốc, chỉ nhận MIME ảnh, tối đa 5MB.
const ALLOWED_SCREENSHOT_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const screenshotStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, "../uploads")),
  filename: (_req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({
  storage: screenshotStorage,
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_SCREENSHOT_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * Router báo lỗi + thông báo. Export là FACTORY nhận `io` (Socket.io server)
 * từ app.js — vì route "admin phản hồi" cần emit realtime tới user,
 * mà io chỉ tồn tại sau khi HTTP server khởi tạo.
 */
module.exports = (io) => {
  const router = express.Router();

  /**
   * POST /api/report — User gửi báo lỗi (multipart, screenshot tùy chọn).
   * Middleware đầu bọc multer để dịch lỗi file (quá 5MB / sai định dạng) thành
   * message tiếng Việt. Lưu với status 'pending', email lấy từ JWT (không tin body).
   */
  router.post("/report", authMiddleware, (req, res, next) => {
    upload.single("screenshot")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File ảnh không được vượt quá 5MB" });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({ message: "Chỉ chấp nhận ảnh (jpg, png, webp, gif)" });
        }
      }
      if (err) return res.status(400).json({ message: "Lỗi tải file" });
      next();
    });
  }, async (req, res) => {
    const { title, story, message } = req.body;
    const email = req.user.email;

    if (!title || !message) {
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin báo lỗi" });
    }

    try {
      const screenshot = req.file ? req.file.filename : null;
      await pool.query(
        `INSERT INTO reports (title, story_url, message, screenshot_path, user_email, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [title, story || null, message, screenshot, email]
      );

      res.status(201).json({ message: "Đã gửi báo lỗi thành công" });
    } catch (err) {
      console.error("[report] submit:", err);
      res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
    }
  });

  /**
   * GET /api/admin/reports/pending-count — Số báo lỗi chưa xử lý (Admin only).
   * Dùng cho badge đếm trên sidebar admin, gọi nhẹ hơn nhiều so với tải cả danh sách.
   */
  router.get("/admin/reports/pending-count", authMiddleware, requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT COUNT(*) FROM reports WHERE status = 'pending'"
      );
      res.json({ count: parseInt(result.rows[0].count, 10) });
    } catch (err) {
      console.error("[report] pending-count:", err);
      res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
    }
  });

  /**
   * GET /api/admin/reports — Danh sách báo lỗi cho admin, phân trang
   * (limit chặn trần 50), lọc theo status tùy chọn, mới nhất trước.
   * COUNT và SELECT data chạy song song.
   */
  router.get("/admin/reports", authMiddleware, requireAdmin, async (req, res) => {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status || null;

    const conditions = status ? "WHERE status = $1" : "";
    const params     = status ? [status] : [];

    try {
      const [countRes, dataRes] = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM reports ${conditions}`, params),
        pool.query(
          `SELECT id, title, story_url, message, screenshot_path, user_email,
                  status, response, created_at, updated_at
           FROM reports ${conditions}
           ORDER BY created_at DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset]
        ),
      ]);

      const total = parseInt(countRes.rows[0].count, 10);
      res.json({
        data: dataRes.rows,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (err) {
      console.error("[report] admin list:", err);
      res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
    }
  });

  /**
   * POST /api/admin/reports/:id/respond { response, status } — Admin phản hồi báo lỗi.
   * Làm 3 việc liên hoàn:
   *   1. UPDATE reports: ghi phản hồi + trạng thái mới + updated_at.
   *   2. INSERT notifications: tạo thông báo bền cho user (hiện ở chuông khi login lại).
   *   3. Emit Socket.io `newNotification` tới room theo email — user đang online
   *      thấy thông báo NGAY không cần refresh.
   */
  router.post("/admin/reports/:id/respond", authMiddleware, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { response, status } = req.body;

    if (!id || id <= 0) {
      return res.status(400).json({ message: "ID báo lỗi không hợp lệ" });
    }
    if (!response || !status) {
      return res.status(400).json({ message: "Vui lòng nhập phản hồi và trạng thái" });
    }

    try {
      const reportRes = await pool.query(
        "UPDATE reports SET response=$1, status=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
        [response, status, id]
      );

      if (reportRes.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy báo lỗi" });
      }

      const userEmail = reportRes.rows[0].user_email;
      const notificationMessage = `Admin đã phản hồi báo lỗi của bạn: "${response}". Trạng thái: ${status}`;

      await pool.query(
        "INSERT INTO notifications (user_email, message) VALUES ($1, $2)",
        [userEmail, notificationMessage]
      );

      io.to(userEmail).emit("newNotification", {
        type: "report_response",
        reportId: id,
        status,
        response,
        message: notificationMessage,
      });

      res.json({ message: "Đã phản hồi báo lỗi thành công" });
    } catch (err) {
      console.error("[report] admin respond:", err);
      res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
    }
  });

  /**
   * GET /api/notifications — 50 thông báo gần nhất của user (mới nhất trước),
   * kèm is_read để UI phân biệt đã đọc/chưa đọc và link đích khi bấm vào.
   */
  router.get("/notifications", authMiddleware, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, user_email, message, link, is_read, created_at
         FROM notifications
         WHERE user_email = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.user.email]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[report] notifications:", err);
      res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
    }
  });

  /**
   * GET /api/reports/my — 20 báo lỗi gần nhất user đã gửi, kèm status và
   * phản hồi của admin (nếu có) — hiển thị ở trang Báo lỗi của user.
   */
  router.get("/reports/my", authMiddleware, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, title, story_url, message, status, response, created_at, updated_at
         FROM reports WHERE user_email = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.user.email]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[report] my reports:", err);
      res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
    }
  });

  /**
   * PUT /api/notifications/:id/read — Đánh dấu 1 thông báo đã đọc.
   * UPDATE có điều kiện user_email từ JWT — không đánh dấu hộ được thông báo
   * của người khác.
   */
  router.put("/notifications/:id/read", authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id || id <= 0) {
      return res.status(400).json({ message: "ID thông báo không hợp lệ" });
    }

    try {
      const result = await pool.query(
        "UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_email=$2 RETURNING id",
        [id, req.user.email]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Không tìm thấy thông báo" });
      }

      res.json({ message: "Đã đánh dấu đã đọc" });
    } catch (err) {
      console.error("[report] mark read:", err);
      res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
    }
  });

  /**
   * PUT /api/notifications/read-all — Đánh dấu TẤT CẢ thông báo chưa đọc của user
   * thành đã đọc (nút "đọc tất cả" trên chuông thông báo).
   */
  router.put("/notifications/read-all", authMiddleware, async (req, res) => {
    try {
      await pool.query(
        "UPDATE notifications SET is_read=TRUE WHERE user_email=$1 AND is_read=FALSE",
        [req.user.email]
      );
      res.json({ message: "Đã đánh dấu tất cả đã đọc" });
    } catch (err) {
      console.error("[report] mark all read:", err);
      res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
    }
  });

  return router;
};
