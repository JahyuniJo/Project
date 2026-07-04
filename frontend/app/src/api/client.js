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
