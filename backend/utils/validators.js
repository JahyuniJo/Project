/**
 * utils/validators.js — Hằng số validate dùng chung giữa các route
 * (đăng ký, đổi mật khẩu, admin tạo user...) để quy tắc chỉ định nghĩa 1 nơi.
 *   - EMAIL_REGEX: dạng cơ bản "gì-đó@gì-đó.gì-đó", không chứa khoảng trắng.
 *   - MIN_PASSWORD_LENGTH: độ dài mật khẩu tối thiểu (6 ký tự).
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

module.exports = { EMAIL_REGEX, MIN_PASSWORD_LENGTH };
