import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { useSocket } from './useSocket';

/**
 * Hook quản lý chuông thông báo (NotificationBell) — kết hợp 2 nguồn:
 *   - Load lần đầu qua GET /api/notifications (thông báo bền trong DB).
 *   - Realtime: nghe event `newNotification` từ socket, prepend vào danh sách
 *     và tăng unreadCount ngay lập tức.
 *
 * @param {boolean} enabled - Chỉ hoạt động khi user đã đăng nhập (tránh gọi API 401).
 * @returns {{ notifications: Array, unreadCount: number, markAllRead: Function }}
 *   markAllRead: gọi API đánh dấu tất cả đã đọc + cập nhật state lạc quan.
 */
export function useNotifications(enabled) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const socket = useSocket();

  const load = useCallback(async () => {
    try {
      const res = await client.get('/api/notifications');
      const data = Array.isArray(res.data) ? res.data : [];
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    } catch {}
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled || !socket) return;

    const handler = (data) => {
      const item = { ...data, created_at: new Date().toISOString(), is_read: false };
      setNotifications((prev) => [item, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    socket.on('newNotification', handler);
    return () => socket.off('newNotification', handler);
  }, [enabled, socket]);

  const markAllRead = useCallback(async () => {
    try {
      await client.put('/api/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  }, []);

  return { notifications, unreadCount, markAllRead };
}
