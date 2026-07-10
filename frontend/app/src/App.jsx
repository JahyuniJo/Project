import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import AuthLayout from './components/AuthLayout';
import AdminLayout from './components/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';

// Phase 2 — public pages
import Home from './pages/public/Home';
import Login from './pages/public/Login';
import Register from './pages/public/Register';
import ForgotPassword from './pages/public/ForgotPassword';
import ResetPassword from './pages/public/ResetPassword';
import Read from './pages/public/Read';
import Chapter from './pages/public/Chapter';

// Phase 4 — private user pages
import Home2 from './pages/private/Home2';
import Info from './pages/private/Info';
import Read2 from './pages/private/Read2';
import Fav from './pages/private/Fav';
import ErrorReport from './pages/private/ErrorReport';

// Phase 5 — admin pages
import Dashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminStat from './pages/admin/Stat';
import AdminStories from './pages/admin/Stories';
import AdminReports from './pages/admin/Reports';
import AdminChat from './pages/admin/Chat';

/**
 * App — Khai báo TOÀN BỘ route của SPA, nhóm theo layout:
 *   - AuthLayout: các trang đăng nhập/đăng ký/quên mật khẩu (không header).
 *   - Layout (Header + Footer): trang public (Home, Read, Chapter) và trang
 *     cần đăng nhập — bọc trong ProtectedRoute (không role = chỉ cần đăng nhập,
 *     roles=['user'] = chặn cả admin vào trang thuần user).
 *   - AdminLayout (sidebar cố định): toàn bộ /admin/*, bọc ProtectedRoute
 *     roles=['admin'].
 * Route lạ → redirect về trang chủ. Lưu ý: guard ở đây chỉ là UX — bảo vệ
 * thật nằm ở API (authMiddleware/requireAdmin phía backend).
 */
export default function App() {
  return (
    <Routes>
      {/* ── Auth (không có header) ─────────────────────────── */}
      <Route element={<AuthLayout />}>
        <Route path="login"          element={<Login />} />
        <Route path="register"       element={<Register />} />
        <Route path="forgot"         element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
      </Route>

      {/* ── Chapter: layout riêng (không có footer padding) ── */}
      <Route element={<Layout />}>
        <Route path="chapter/:id" element={<Chapter />} />
      </Route>

      {/* ── Admin: layout riêng với fixed sidebar ── */}
      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route element={<AdminLayout />}>
          <Route path="admin"         element={<Dashboard />} />
          <Route path="admin/users"   element={<AdminUsers />} />
          <Route path="admin/stat"    element={<AdminStat />} />
          <Route path="admin/stories" element={<AdminStories />} />
          <Route path="admin/reports" element={<AdminReports />} />
          <Route path="admin/chat"    element={<AdminChat />} />
        </Route>
      </Route>

      {/* ── Các trang còn lại: dùng Layout có Header + Footer ── */}
      <Route element={<Layout />}>
        {/* Public */}
        <Route index element={<Home />} />
        <Route path="read"  element={<Read />} />

        {/* Cần đăng nhập */}
        <Route element={<ProtectedRoute />}>
          <Route path="home"  element={<Home2 />} />
          <Route path="info"  element={<Info />} />
          <Route path="read2" element={<Read2 />} />
        </Route>

        {/* Chỉ role user */}
        <Route element={<ProtectedRoute roles={['user']} />}>
          <Route path="fav"          element={<Fav />} />
          <Route path="error-report" element={<ErrorReport />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
