const express = require("express");
const router = express.Router();
const pool = require("../config/pool");
const bcrypt = require("bcryptjs");
const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/requireAdmin");
const { EMAIL_REGEX } = require("../utils/validators");

/**
 * GET /api/usercontroll — Danh sách user cho trang quản lý admin (Admin only).
 * Hỗ trợ: phân trang (page/limit), tìm kiếm ILIKE trên username/email,
 * lọc theo role (chỉ nhận "user"/"admin", giá trị khác bị bỏ qua).
 * Không trả cột password; kèm locked_until để UI hiển thị trạng thái khóa.
 */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search ? `%${req.query.search.trim()}%` : "%%";
  const role =
    req.query.role && ["user", "admin"].includes(req.query.role)
      ? req.query.role
      : null;

  try {
    const baseParams = [search];
    const roleCondition = role ? "AND role = $2" : "";
    if (role) baseParams.push(role);

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM users WHERE (username ILIKE $1 OR email ILIKE $1) ${roleCondition}`,
      baseParams
    );
    const total = parseInt(countRes.rows[0].count);

    const limitIdx = baseParams.length + 1;
    const offsetIdx = baseParams.length + 2;
    const listParams = [...baseParams, limit, offset];

    const result = await pool.query(
      `SELECT id, username, email, role, created_at, locked_until FROM users
       WHERE (username ILIKE $1 OR email ILIKE $1) ${roleCondition}
       ORDER BY id ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      listParams
    );

    res.json({
      page,
      totalPages: Math.ceil(total / limit),
      total,
      users: result.rows,
    });
  } catch (err) {
    console.error("[usercontrollRoutes] list:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

/**
 * POST /api/usercontroll — Admin tạo user mới trực tiếp (không qua đăng ký).
 * Validate như /register + được chọn role (mặc định "user"); mật khẩu vẫn
 * hash bcrypt như luồng đăng ký thường. Thành công → 201.
 */
router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: "Email không hợp lệ" });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Mật khẩu phải có ít nhất 6 ký tự" });
  }
  if (role && !["user", "admin"].includes(role)) {
    return res.status(400).json({ message: "Role không hợp lệ" });
  }

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Email đã được sử dụng" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)",
      [username.trim(), email, hashedPassword, role || "user"]
    );

    res.status(201).json({ message: "Thêm người dùng thành công" });
  } catch (err) {
    console.error("[usercontrollRoutes] create:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

/**
 * PUT /api/usercontroll/:id — Admin sửa username/email/role của 1 user.
 * Kiểm tra email mới không trùng với tài khoản KHÁC (loại trừ chính user đang sửa).
 * Không đụng tới mật khẩu — đổi mật khẩu đi qua luồng riêng của user.
 */
router.put("/:id", authMiddleware, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "ID người dùng không hợp lệ" });
  }

  const { username, email, role } = req.body;

  if (!username || !email) {
    return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin" });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: "Email không hợp lệ" });
  }
  if (role && !["user", "admin"].includes(role)) {
    return res.status(400).json({ message: "Role không hợp lệ" });
  }

  try {
    const emailConflict = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND id != $2",
      [email, id]
    );
    if (emailConflict.rows.length > 0) {
      return res.status(400).json({ message: "Email đã được sử dụng bởi tài khoản khác" });
    }

    const result = await pool.query(
      "UPDATE users SET username=$1, email=$2, role=$3 WHERE id=$4 RETURNING id",
      [username.trim(), email, role || "user", id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    res.json({ message: "Cập nhật người dùng thành công" });
  } catch (err) {
    console.error("[usercontrollRoutes] update:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

/**
 * PATCH /api/usercontroll/:id/lock — Khóa hoặc mở khóa tài khoản có thời hạn.
 *
 * Body { duration_hours }: số nguyên 0–8760 (tối đa 1 năm).
 *   - > 0: set `locked_until = NOW() + N giờ` — user bị chặn ở cả login lẫn
 *     authMiddleware cho tới khi hết hạn.
 *   - = 0: mở khóa (locked_until = NULL).
 * Admin không thể tự khóa chính mình (chống tự khóa mất quyền quản trị).
 */
router.patch("/:id/lock", authMiddleware, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "ID người dùng không hợp lệ" });
  }

  if (id === req.user.userId) {
    return res.status(400).json({ message: "Bạn không thể khóa tài khoản của chính mình" });
  }

  const durationHours = req.body.duration_hours;
  if (!Number.isInteger(durationHours) || durationHours < 0 || durationHours > 8760) {
    return res.status(400).json({ message: "Thời hạn khóa không hợp lệ (0–8760 giờ)" });
  }

  try {
    let lockedUntil = null;

    if (durationHours > 0) {
      const result = await pool.query(
        "UPDATE users SET locked_until = NOW() + ($1 * INTERVAL '1 hour') WHERE id = $2 RETURNING locked_until",
        [durationHours, id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Không tìm thấy người dùng" });
      }
      lockedUntil = result.rows[0].locked_until;
    } else {
      const result = await pool.query(
        "UPDATE users SET locked_until = NULL WHERE id = $1 RETURNING id",
        [id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Không tìm thấy người dùng" });
      }
    }

    const message = durationHours > 0 ? "Khóa tài khoản thành công" : "Mở khóa tài khoản thành công";
    res.json({ message, locked_until: lockedUntil ? lockedUntil.toISOString() : null });
  } catch (err) {
    console.error("[usercontrollRoutes] lock:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

/**
 * DELETE /api/usercontroll/:id — Admin xóa user. Không thể tự xóa chính mình.
 * Dữ liệu liên quan (chat, comment, favorite...) tự dọn nhờ FK ON DELETE CASCADE.
 */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id <= 0) {
    return res.status(400).json({ message: "ID người dùng không hợp lệ" });
  }

  if (id === req.user.userId) {
    return res.status(400).json({ message: "Bạn không thể tự xóa tài khoản của chính mình" });
  }

  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    res.json({ message: "Xóa người dùng thành công" });
  } catch (err) {
    console.error("[usercontrollRoutes] delete:", err);
    res.status(500).json({ message: "Lỗi server, vui lòng thử lại" });
  }
});

module.exports = router;
