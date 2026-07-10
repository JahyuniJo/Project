/**
 * Chuyển chuỗi tiếng Việt có dấu về dạng không dấu để so khớp tìm kiếm
 * ("Truyện Tranh" → "Truyen Tranh") — dùng trước khi gửi query fuzzy lên
 * Elasticsearch (khớp với asciifolding filter trong analyzer của index).
 *
 * Các bước: tách dấu bằng Unicode NFD → xóa các ký tự dấu kết hợp (U+0300–U+036F)
 * → thay riêng đ/Đ (không phải dấu kết hợp nên NFD không tách được) → bỏ ký tự
 * đặc biệt còn lại → gộp khoảng trắng thừa.
 *
 * @param {string} str
 * @returns {string} Chuỗi không dấu, chỉ còn chữ + số + khoảng trắng đơn.
 */
function removeVietnameseTones(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { removeVietnameseTones };
