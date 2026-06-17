// Lấy dữ liệu xác thực người dùng từ token trong HttpOnly Cookie sử dụng cho các route API ở frontend
const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const authMiddleware = require("../middleware/authMiddleware");

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
