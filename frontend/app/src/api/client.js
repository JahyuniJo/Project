/**
 * api/client.js — Axios instance dùng chung cho MỌI lời gọi API của frontend.
 *
 * - `withCredentials: true`: tự gửi kèm cookie JWT (authToken, HTTP-only) —
 *   frontend không bao giờ đụng trực tiếp vào token.
 * - Interceptor response xử lý lỗi tập trung:
 *   + 401 (hết phiên/chưa đăng nhập) → tự chuyển hướng về /login
 *     (trừ khi đang ở trang login — tránh redirect loop).
 *   + Mọi lỗi được chuẩn hóa thành Error với message từ server hoặc message
 *     chung tiếng Việt — component chỉ cần hiện err.message, không lo lộ chi tiết.
 */
import axios from 'axios';

const client = axios.create({ withCredentials: true });  // Gửi cookie cùng request

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Tránh redirect loop trên trang login
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    // Ẩn error.message gốc ra khỏi UI
    const message =
      err.response?.data?.message || 'Lỗi server, vui lòng thử lại';
    return Promise.reject(new Error(message));
  }
);

export default client;
