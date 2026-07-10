const jwt = require("jsonwebtoken");

/**
 * Middleware đăng nhập KHÔNG bắt buộc — dùng cho API phục vụ cả khách lẫn user
 * (vd: GET /api/comments cần biết user để đánh dấu comment nào mình đã like).
 *
 * Khác authMiddleware: không bao giờ chặn request. Có token hợp lệ → gắn payload
 * vào `req.user`; không có token hoặc token hỏng → `req.user = null` và đi tiếp.
 * Không đối chiếu DB — route phía sau tự quyết định làm gì khi req.user là null.
 */
module.exports = function optionalAuth(req, res, next) {
  const token = req.cookies?.authToken;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    req.user = null;
  }

  next();
};
