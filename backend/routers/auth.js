// Lấy dữ liệu xác thực người dùng từ token trong HttpOnly Cookie sử dụng cho các route API ở frontend
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

router.get("/me", authMiddleware, (req, res) => {
  const user = req.user; // được gắn bởi authMiddleware
  res.json({
    id: user.id,
    email: user.email,
    name: user.username || null
  });
});

module.exports = router;
