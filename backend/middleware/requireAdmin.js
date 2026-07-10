/**
 * Middleware chặn quyền admin — LUÔN đứng SAU authMiddleware trong chuỗi
 * (cần `req.user.role` đã được authMiddleware nạp mới từ DB).
 * Role khác "admin" → 403; admin → đi tiếp.
 */
module.exports = function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
  }
  next();
};
