const express = require("express");
const router = express.Router();
const multer = require("multer");
const pool = require("../config/db");
const upload = multer({ dest: "uploads/" });

// Export function nhận io và userSockets
module.exports = (io, userSockets) => {

  /* ======================================================================
     1. User gửi báo lỗi
  ====================================================================== */
  router.post("/report", upload.single("screenshot"), async (req, res) => {
    try {
      const { title, story, message, email } = req.body;
      const screenshot = req.file ? req.file.filename : null;

      await pool.query(
        `INSERT INTO reports (title, story_url, message, screenshot_path, user_email, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [title, story, message, screenshot, email]
      );

      res.json({ success: true, message: "Đã gửi báo lỗi thành công!" });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Lỗi server, gửi báo lỗi thất bại."
      });
    }
  });


  /* ======================================================================
     2. Admin lấy danh sách báo lỗi
  ====================================================================== */
  router.get("/admin/reports", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM reports ORDER BY created_at DESC"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Lỗi khi lấy danh sách báo lỗi:", err);
      res.status(500).json({ error: "Không thể lấy danh sách báo lỗi" });
    }
  });


  /* ======================================================================
     3. Admin phản hồi báo lỗi (có gửi notification + realtime)
  ====================================================================== */
  router.post("/admin/reports/:id/respond", async (req, res) => {
    const { response, status } = req.body;
    const { id } = req.params;

    try {
      // Cập nhật báo lỗi
      const reportRes = await pool.query(
        `UPDATE reports 
         SET response=$1, status=$2, updated_at=NOW()
         WHERE id=$3
         RETURNING *`,
        [response, status, id]
      );

      if (reportRes.rows.length === 0) {
        return res.status(404).json({ message: "Report không tồn tại" });
      }

      const report = reportRes.rows[0];
      const email = report.user_email;

      /* ➤ Tạo thông báo để user đọc sau */
      await pool.query(
        `INSERT INTO notifications (user_email, message)
         VALUES ($1, $2)`,
        [
          email,
          `Admin đã phản hồi báo lỗi của bạn: "${response}". Trạng thái: ${status}`
        ]
      );

      /* ➤ Gửi realtime nếu user đang online */
      if (email && userSockets[email]) {
        io.to(userSockets[email]).emit("reportResponse", {
          id,
          status,
          response,
          message: "Admin đã phản hồi báo lỗi của bạn!"
        });
      }

      res.json({ success: true, message: "Đã phản hồi thành công!" });
    } catch (err) {
      console.error("Lỗi phản hồi báo lỗi:", err);
      res.status(500).json({ success: false, message: "Có lỗi xảy ra!" });
    }
  });


  /* ======================================================================
     4. User lấy danh sách thông báo
  ====================================================================== */
  router.get("/notifications", async (req, res) => {
    const { email } = req.query;

    try {
      const result = await pool.query(
        `SELECT * FROM notifications 
         WHERE user_email=$1 
         ORDER BY created_at DESC`,
        [email]
      );

      res.json(result.rows);
    } catch (err) {
      console.error("Lỗi lấy thông báo:", err);
      res.status(500).json({ error: "Không thể lấy thông báo" });
    }
  });


  /* ======================================================================
     5. Đánh dấu thông báo đã đọc
  ====================================================================== */
  router.put("/notifications/:id/read", async (req, res) => {
    const { id } = req.params;

    try {
      await pool.query(
        `UPDATE notifications 
         SET is_read = TRUE 
         WHERE id=$1`,
        [id]
      );

      res.json({ success: true, message: "Đã đánh dấu đã đọc" });
    } catch (err) {
      console.error("Lỗi cập nhật thông báo:", err);
      res.status(500).json({ error: "Không thể cập nhật thông báo" });
    }
  });


  return router;
};
