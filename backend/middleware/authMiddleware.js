const jwt = require("jsonwebtoken");
const pool = require("../config/pool");
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware BẮT BUỘC đăng nhập — gắn trước mọi API cần user.
 *
 * Quy trình kiểm tra:
 *   1. Lấy JWT từ HTTP-only cookie `authToken` — không có → 401.
 *   2. Verify chữ ký + hạn token — hỏng/hết hạn → 401.
 *   3. Đối chiếu DB (khác optionalAuth ở điểm này): user phải còn tồn tại,
 *      và không đang bị khóa (`locked_until` trong tương lai → 403).
 *      Nhờ bước này, xóa user / khóa tài khoản có hiệu lực NGAY cả khi
 *      token cũ chưa hết hạn.
 *   4. Hợp lệ → gắn `req.user = { userId, ..., role }` (role lấy mới từ DB,
 *      không tin role trong token) rồi cho request đi tiếp.
 */
module.exports = async function authMiddleware(req, res, next) {
  const token = req.cookies.authToken;

  if (!token) {
    return res.status(401).json({ message: "Bạn chưa đăng nhập" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Phiên đăng nhập hết hạn, vui lòng đăng nhập lại" });
  }

  try {
    const result = await pool.query(
      "SELECT id, role, locked_until FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Tài khoản không tồn tại" });
    }

    const user = result.rows[0];

    if (user.locked_until && user.locked_until > new Date()) {
      return res.status(403).json({ message: "Tài khoản đã bị khóa" });
    }

    req.user = { ...decoded, role: user.role };
    next();
  } catch (err) {
    console.error("[authMiddleware]:", err);
    return res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
};
