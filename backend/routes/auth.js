// Lấy dữ liệu xác thực người dùng từ token trong HttpOnly Cookie sử dụng cho các route API ở frontend
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * GET /api/import/me — Trả thông tin user đang đăng nhập cho frontend.
 *
 * Frontend không đọc được JWT (HTTP-only cookie) nên AuthContext gọi endpoint
 * này lúc app khởi động để biết ai đang đăng nhập: 401 → coi như khách,
 * 200 → có { id, email, username, role, avatar_url, created_at }.
 * Các field cơ bản lấy từ payload token; avatar_url/created_at query thêm từ DB
 * (không nằm trong token vì có thể đổi sau khi phát hành).
 */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT avatar_url, created_at FROM users WHERE id = $1",
      [req.user.userId]
    );
    res.json({
      id: req.user.userId,
      email: req.user.email,
      username: req.user.username || null,
      role: req.user.role,
      avatar_url: result.rows[0]?.avatar_url || null,
      created_at: result.rows[0]?.created_at || null,
    });
  } catch (err) {
    console.error("[auth] me:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});
module.exports = router;
