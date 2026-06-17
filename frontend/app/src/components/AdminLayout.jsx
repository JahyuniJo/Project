import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

const NAV = [
  { to: '/admin/users',   icon: 'fa-users',                label: 'Quản lý người dùng' },
  { to: '/admin/stat',    icon: 'fa-chart-column',         label: 'Thống kê' },
  { to: '/admin/stories', icon: 'fa-book',                 label: 'Quản lý truyện' },
  { to: '/admin/reports', icon: 'fa-triangle-exclamation', label: 'Quản lý báo lỗi' },
  { to: '/admin/chat',    icon: 'fa-robot',                label: 'Giám sát Chat AI' },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const logout = async () => {
    await client.get('/api/users/logout').catch(() => {});
    navigate('/');
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 z-50 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <Link to="/admin" className="font-bold text-indigo-600">Bảng điều khiển</Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1 text-sm">
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition text-sm ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'
                }`
              }
            >
              <i className={`fa-solid ${icon} w-4`} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Header */}
      <header className="ml-64 bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
          <Link to="/admin" className="flex items-center gap-2">
            <img src="/assets/images/Logo.png" alt="Logo" className="w-8 h-8 rounded-full" />
            <span className="font-bold text-indigo-600">DH.story Admin</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Xin chào, {user?.username || 'Admin'}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition"
            >
              <i className="fa-solid fa-right-from-bracket" /> Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Content + Footer */}
      <div className="ml-64 flex flex-col min-h-screen">
        <main className="flex-1">
          <Outlet />
        </main>
        <footer className="bg-white border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-4 text-xs text-gray-400 text-center">
            © 2025 DH.story — Admin Panel
          </div>
        </footer>
      </div>
    </div>
  );
}
