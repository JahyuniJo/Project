import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import client from '../api/client';

const AuthContext = createContext(null);

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
