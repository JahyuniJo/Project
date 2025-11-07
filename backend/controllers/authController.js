const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'dieu002016';
// Tạo transporter Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "dieu300504@gmail.com",
    pass: "wpnm hepl gixm bgvv" // dùng App Password, không dùng mật khẩu gmail trực tiếp
  }
});

// 1. Gửi OTP
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  // Tạo mã OTP ngẫu nhiên 6 số
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 2 * 60 * 1000); // hết hạn sau 5 phút

  await pool.query(
    "UPDATE users SET otp = $1, otp_expires = $2 WHERE email = $3",
    [otp, expires, email]
  );

  // Gửi email
  await transporter.sendMail({
    from: "dieu300504@gmail.com",
    to: email,
    subject: "Mã khôi phục mật khẩu",
    text: `Mã xác nhận của bạn là: ${otp}. Có hiệu lực trong 2 phút.`
  });

  res.json({ message: "OTP đã được gửi đến email của bạn" });
});

// 2. Xác nhận OTP
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1 AND otp = $2 AND otp_expires > NOW()",
    [email, otp]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ message: "OTP sai hoặc đã hết hạn" });
  }

  res.json({ message: "OTP hợp lệ, cho phép đổi mật khẩu" });
});

// 3. Đổi mật khẩu
router.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
    const hashed = await bcrypt.hash(newPassword, 10);
  await pool.query(
    "UPDATE users SET password = $1, otp = NULL, otp_expires = NULL WHERE email = $2",
    [hashed, email]
  );

  res.json({ message: "Đổi mật khẩu thành công" });
});



// 4. Đổi mật khẩu khi đã đăng nhập
function authenticateToken(req, res, next) {
  const token = req.cookies.authToken;
  if (!token) return res.status(401).json({ message: "Thiếu token đăng nhập" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Token không hợp lệ" });
    req.user = user;
    next();
  });
}
router.post("/change-password", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { currentPassword, newPassword } = req.body;

  if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Thiếu thông tin mật khẩu" });
  }

  try {
    // Lấy user
    const result = await pool.query("SELECT password FROM users WHERE id = $1", [userId]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Không tìm thấy tài khoản" });

    const hashedPassword = result.rows[0].password;

    // So sánh mật khẩu hiện tại
    const match = await bcrypt.compare(currentPassword, hashedPassword);
    if (!match) return res.status(400).json({ message: "Mật khẩu hiện tại không đúng" });

    // Hash mật khẩu mới
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [newHash, userId]);

    res.json({ message: "Đổi mật khẩu thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;
