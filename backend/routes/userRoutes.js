const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const bcrypt = require("bcryptjs");
const path = require("path");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/authMiddleware");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads")),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Chỉ chấp nhận file ảnh (jpg, png, webp, gif)"));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Đăng ký
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
  }
  if (username.trim().length < 3 || username.trim().length > 50) {
    return res.status(400).json({ message: "Tên người dùng phải từ 3 đến 50 ký tự" });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: "Email không hợp lệ" });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự` });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Email đã được sử dụng" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
      [username.trim(), email, hashedPassword]
    );

    res.status(201).json({ message: "Đăng ký thành công" });
  } catch (err) {
    console.error("[userRoutes] register:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Đăng nhập
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Vui lòng nhập email và mật khẩu" });
  }

  const trimmedEmail = email.trim();

  try {
    const result = await pool.query(
      "SELECT id, username, email, role, password, locked_until FROM users WHERE email = $1",
      [trimmedEmail]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });
    }

    if (user.locked_until && user.locked_until > new Date()) {
      const d = user.locked_until;
      const pad = n => String(n).padStart(2, "0");
      const formatted = `${pad(d.getHours())}:${pad(d.getMinutes())} ngày ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      return res.status(403).json({
        message: `Tài khoản đã bị khóa đến ${formatted}. Vui lòng liên hệ quản trị viên.`,
      });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.cookie("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000, // khớp với JWT expiresIn: "24h"
    });

    res.json({ message: "Đăng nhập thành công", role: user.role });
  } catch (err) {
    console.error("[userRoutes] login:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Đăng xuất
router.get("/logout", (req, res) => {
  res.clearCookie("authToken", { httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ message: "Đăng xuất thành công" });
});

// Lấy thông tin người dùng
router.get("/info", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT username, email, avatar_url FROM users WHERE id = $1",
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[userRoutes] info:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Thống kê hoạt động của người dùng
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const [viewsRes, listsRes, reportsRes] = await Promise.all([
      pool.query(
        "SELECT COUNT(DISTINCT story_id) AS count FROM user_story_views WHERE user_id = $1",
        [req.user.userId]
      ),
      pool.query(
        "SELECT COUNT(*) AS count FROM favorite_lists WHERE iduser = $1",
        [req.user.userId]
      ),
      pool.query(
        "SELECT COUNT(*) AS count FROM reports WHERE user_email = $1",
        [req.user.email]
      ),
    ]);

    res.json({
      stories_read: parseInt(viewsRes.rows[0].count),
      fav_lists: parseInt(listsRes.rows[0].count),
      reports_sent: parseInt(reportsRes.rows[0].count),
    });
  } catch (err) {
    console.error("[userRoutes] stats:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

// Upload avatar
router.post("/upload-avatar", authMiddleware, (req, res, next) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File ảnh không được vượt quá 5MB" });
      }
      return res.status(400).json({ message: err.message || "Lỗi tải file" });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Vui lòng chọn file ảnh" });
  }

  try {
    const filePath = `/uploads/${req.file.filename}`;
    await pool.query("UPDATE users SET avatar_url = $1 WHERE id = $2", [filePath, req.user.userId]);
    res.json({ message: "Cập nhật ảnh đại diện thành công", avatar_url: filePath });
  } catch (err) {
    console.error("[userRoutes] upload-avatar:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = router;
