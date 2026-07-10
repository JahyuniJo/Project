import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute — Guard client-side cho các nhánh route cần đăng nhập/đúng role.
 * Render <Outlet /> (các route con) khi đủ điều kiện; ngược lại:
 *   - Đang xác minh phiên (loading) → spinner, tránh redirect nhầm khi F5.
 *   - Chưa đăng nhập → <Navigate> về /login.
 *   - Sai role → màn 403 tại chỗ (không redirect, để user hiểu vì sao).
 * Chỉ là lớp UX — kiểm tra quyền thật vẫn ở API backend.
 *
 * Props:
 *   roles - string[] — nếu truyền, user.role phải nằm trong danh sách
 *           (bỏ trống = chỉ cần đăng nhập)
 */
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <i className="fa-solid fa-spinner fa-spin text-indigo-600 text-2xl"></i>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (roles?.length && !roles.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <i className="fa-solid fa-lock text-red-400 text-5xl"></i>
        <p className="text-lg text-gray-600">403 — Bạn không có quyền truy cập trang này</p>
        <a href="/" className="text-indigo-600 hover:underline">Về trang chủ</a>
      </div>
    );
  }

  return <Outlet />;
}
