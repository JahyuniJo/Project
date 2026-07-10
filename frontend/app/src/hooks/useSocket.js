import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

// Singleton socket — tạo một lần duy nhất, dùng chung toàn app
let _socket = null;

/**
 * Trả về Socket.io client singleton (khởi tạo lười ở lần gọi đầu).
 * Toàn app dùng chung 1 kết nối cho cả notification lẫn chatbot —
 * tránh mỗi component tự mở 1 socket riêng.
 */
export function getSocket() {
  if (!_socket) {
    _socket = io({ transports: ['websocket', 'polling'] });
  }
  return _socket;
}

/**
 * Hook lấy socket dùng chung, đồng thời đăng ký nhận thông báo realtime:
 * khi có user đăng nhập, emit `registerEmail` để server cho socket join room
 * theo email (kênh nhận `newNotification`). Đăng ký lại mỗi lần socket
 * reconnect (listener trên event `connect`) vì server quên room sau khi đứt
 * kết nối.
 * @returns {import("socket.io-client").Socket}
 */
export function useSocket() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.email) return;
    const socket = getSocket();

    const register = () => socket.emit('registerEmail', user.email);
    if (socket.connected) {
      register();
    }
    socket.on('connect', register);
    return () => socket.off('connect', register);
  }, [user?.email]);

  return getSocket();
}
