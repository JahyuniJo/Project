import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';
import { useAuth } from '../context/AuthContext';
import useOutsideClick from '../hooks/useOutsideClick';

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAllRead } = useNotifications(!!user);
  const ref = useRef(null);
  const navigate = useNavigate();

  useOutsideClick(ref, () => setOpen(false));

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) markAllRead();
  };

  return (
    <div ref={ref} className="relative cursor-pointer">
      <button
        onClick={handleOpen}
        className="relative hover:text-indigo-600 transition focus:outline-none"
        aria-label="Thông báo"
      >
        <i className="fa-solid fa-bell text-2xl text-gray-600 hover:text-indigo-600 transition"></i>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 w-80 bg-white shadow-xl rounded-xl overflow-hidden border border-gray-100 z-[60]">
          <div className="px-4 py-2 bg-indigo-600 text-white font-semibold">Thông báo</div>
          <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100">
            {notifications.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400 italic">Chưa có thông báo</li>
            ) : (
              notifications.map((n, i) => (
                <li
                  key={n.id ?? i}
                  onClick={() => { if (n.link) { setOpen(false); navigate(n.link); } }}
                  className={`px-4 py-3 hover:bg-indigo-50 transition ${n.link ? 'cursor-pointer' : ''}`}
                >
                  <p className="text-sm text-gray-700">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(n.created_at).toLocaleString('vi-VN')}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
