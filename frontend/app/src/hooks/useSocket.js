import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

// Singleton socket — tạo một lần duy nhất, dùng chung toàn app
let _socket = null;

export function getSocket() {
  if (!_socket) {
    _socket = io({ transports: ['websocket', 'polling'] });
  }
  return _socket;
}

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
