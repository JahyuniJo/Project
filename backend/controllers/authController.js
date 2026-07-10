const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const { randomInt } = require("crypto");
const authMiddleware = require("../middleware/authMiddleware");
const { EMAIL_REGEX } = require("../utils/validators");
const OTP_EXPIRY_MS = 2 * 60 * 1000; // 2 phút

// Transporter gửi mail OTP qua Gmail — dùng App Password (EMAIL_PASS trong .env),
// không phải mật khẩu Gmail thường.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─────────────────────────────────────────────
// PIPELINE QUÊN MẬT KHẨU
// Bước 1 → Bước 2 → Bước 3 (trong một request)
// ─────────────────────────────────────────────

/**
 * POST /api/auth/forgot-password { email } — Bước 1: gửi OTP về email.
 *
 * - Email không tồn tại vẫn trả CÙNG message thành công "Nếu email tồn tại..."
 *   → chống email enumeration (attacker không dò được email nào có tài khoản).
 * - OTP 6 số sinh bằng crypto.randomInt (an toàn hơn Math.random), hiệu lực
 *   2 phút, lưu vào users.otp/otp_expires — OTP mới ghi đè OTP cũ.
 * - Gửi mail HTML qua Gmail transporter.
 */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: "Email không hợp lệ" });
  }

  try {
    const userRes = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (userRes.rows.length === 0) {
      // Trả lời chung để tránh email enumeration
      return res.json({ message: "Nếu email tồn tại, mã OTP đã được gửi" });
    }

    const otp = randomInt(100000, 1000000).toString();
    const expires = new Date(Date.now() + OTP_EXPIRY_MS);

    await pool.query(
      "UPDATE users SET otp = $1, otp_expires = $2 WHERE email = $3",
      [otp, expires, email]
    );

    await transporter.sendMail({
      from: `"DH.story" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Mã khôi phục mật khẩu – DH.story",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2 style="color:#4f46e5">Khôi phục mật khẩu</h2>
          <p>Mã xác nhận của bạn là:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#4f46e5;margin:16px 0">
            ${otp}
          </div>
          <p style="color:#6b7280">Mã có hiệu lực trong <strong>2 phút</strong>.</p>
          <p style="color:#6b7280;font-size:12px">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
        </div>
      `,
    });

    res.json({ message: "Nếu email tồn tại, mã OTP đã được gửi" });
  } catch (err) {
    console.error("[authController] forgot-password:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

/**
 * POST /api/auth/verify-otp { email, otp } — Bước 2: kiểm tra OTP còn hạn không.
 * Chỉ để UX: frontend xác nhận OTP đúng rồi mới cho nhập mật khẩu mới.
 * KHÔNG tiêu hủy OTP ở bước này — bước 3 vẫn phải gửi lại OTP để verify lần cuối
 * (endpoint này không thay được bước 3).
 */
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Vui lòng nhập email và mã OTP" });
  }

  try {
    const result = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND otp = $2 AND otp_expires > NOW()",
      [email, otp]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Mã OTP không đúng hoặc đã hết hạn" });
    }

    res.json({ message: "Mã OTP hợp lệ" });
  } catch (err) {
    console.error("[authController] verify-otp:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

/**
 * POST /api/auth/reset-password { email, otp, newPassword } — Bước 3: đặt lại mật khẩu.
 *
 * Chạy trong TRANSACTION với FOR UPDATE trên row user: verify OTP lần cuối và
 * khóa row — 2 request reset đồng thời với cùng OTP thì chỉ 1 bên thành công
 * (chống race dùng lại OTP). Mật khẩu mới hash bcrypt; OTP bị xóa NGAY sau khi
 * dùng (nguyên tắc dùng 1 lần) trong cùng câu UPDATE.
 */
router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "Mật khẩu phải có ít nhất 6 ký tự" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify OTP và lock row để tránh race condition
    const result = await client.query(
      `SELECT id FROM users
       WHERE email = $1 AND otp = $2 AND otp_expires > NOW()
       FOR UPDATE`,
      [email, otp]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Mã OTP không đúng hoặc đã hết hạn" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Reset mật khẩu và xóa OTP ngay lập tức (dùng 1 lần)
    await client.query(
      "UPDATE users SET password = $1, otp = NULL, otp_expires = NULL WHERE email = $2",
      [hashedPassword, email]
    );

    await client.query("COMMIT");
    res.json({ message: "Đặt lại mật khẩu thành công" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[authController] reset-password:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/auth/change-password { currentPassword, newPassword } — Đổi mật khẩu
 * khi ĐÃ đăng nhập (khác luồng quên mật khẩu — không cần OTP).
 * Bắt buộc nhập đúng mật khẩu hiện tại (bcrypt.compare) trước khi đổi —
 * chặn kẻ chiếm được session đổi luôn mật khẩu; mật khẩu mới phải khác cũ.
 */
router.post("/change-password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Vui lòng nhập đầy đủ mật khẩu" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "Mật khẩu mới phải có ít nhất 6 ký tự" });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ message: "Mật khẩu mới không được trùng với mật khẩu hiện tại" });
  }

  try {
    const result = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    const match = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!match) {
      return res.status(400).json({ message: "Mật khẩu hiện tại không đúng" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password = $1 WHERE id = $2",
      [newHash, req.user.userId]
    );

    res.json({ message: "Đổi mật khẩu thành công" });
  } catch (err) {
    console.error("[authController] change-password:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = router;
