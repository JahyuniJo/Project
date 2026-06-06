const path = require("path");
const express = require("express");
const multer = require("multer");
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/requireAdmin");

const upload = multer({ dest: path.join(__dirname, "../uploads") });

module.exports = (io) => {
  const router = express.Router();

  // 1. User gửi báo lỗi
  router.post("/report", authMiddleware, upload.single("screenshot"), async (req, res) => {
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

  // 2a. Admin lấy số lượng báo lỗi pending
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

  // 2. Admin lấy danh sách báo lỗi
  router.get("/admin/reports", authMiddleware, requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, title, story_url, message, screenshot_path, user_email,
                status, response, created_at, updated_at
         FROM reports ORDER BY created_at DESC`
      );
      res.json({ data: result.rows });
    } catch (err) {
      console.error("[report] admin list:", err);
      res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
    }
  });

  // 3. Admin phản hồi báo lỗi
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

  // 4. User lấy danh sách thông báo
  router.get("/notifications", authMiddleware, async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM notifications WHERE user_email=$1 ORDER BY created_at DESC",
        [req.user.email]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("[report] notifications:", err);
      res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
    }
  });

  // 4.5 User xem lịch sử báo lỗi của mình
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

  // 5. Đánh dấu thông báo đã đọc
  router.put("/notifications/:id/read", authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id);
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

  return router;
};
