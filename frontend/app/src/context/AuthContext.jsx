import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import client from '../api/client';

const AuthContext = createContext(null);

/**
 * AuthProvider — Nguồn sự thật duy nhất về "ai đang đăng nhập" cho toàn SPA
 * (bọc ngoài App trong main.jsx).
 *
 * Vì JWT nằm trong HTTP-only cookie (JS không đọc được), cách duy nhất biết
 * trạng thái đăng nhập là hỏi server: khi app khởi động gọi GET /api/import/me —
 * 200 → set user, 401 → user = null (khách). Dùng axios THÔ thay vì client
 * chung để lỗi 401 lúc này không bị interceptor redirect về /login
 * (khách xem trang public là hợp lệ).
 *
 * Cung cấp qua useAuth():
 *   - user: { id, email, username, role, avatar_url } hoặc null.
 *   - loading: true khi chưa xác minh xong — ProtectedRoute chờ cờ này
 *     trước khi quyết định redirect.
 *   - login/refreshUser: gọi lại /me (sau khi login thành công / đổi avatar).
 *   - logout: gọi API xóa cookie rồi đưa về /login.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Dùng axios thô để tránh interceptor redirect khi user chưa đăng nhập
  const fetchUser = useCallback(async () => {
    try {
      const res = await axios.get('/api/import/me', { withCredentials: true });
      setUser(res.data);
      return res.data;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    fetchUser().finally(() => setLoading(false));
  }, [fetchUser]);

  // Gọi sau khi login thành công để load đầy đủ thông tin user từ server
  const login = fetchUser;

  // Gọi khi cần refresh thông tin user (vd: sau upload avatar)
  const refreshUser = fetchUser;

  const logout = async () => {
    try {
      await client.get('/api/users/logout');
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
