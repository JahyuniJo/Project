import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { changePassword, getUserStats, uploadAvatar } from '../../api/auth';

const STAT_COLORS = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-600' },
  pink:   { bg: 'bg-pink-50',   border: 'border-pink-100',   text: 'text-pink-600'   },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-600'  },
};

const ROLE_BADGE = {
  admin: { label: 'Quản trị viên', cls: 'bg-red-100 text-red-700 border border-red-200' },
  user:  { label: 'Người dùng',    cls: 'bg-indigo-100 text-indigo-700 border border-indigo-200' },
};

/** StatCard — Ô thống kê nhỏ (số truyện đã đọc, danh sách yêu thích, báo lỗi đã gửi). */
function StatCard({ value, label, icon, color }) {
  const c = STAT_COLORS[color];
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-4 text-center`}>
      <p className={`text-2xl font-bold ${c.text}`}>{value ?? '—'}</p>
      <p className="text-xs text-gray-500 mt-1">
        <i className={`${icon} mr-1`} />{label}
      </p>
    </div>
  );
}

/** PasswordField — Ô nhập mật khẩu có nút con mắt ẩn/hiện nội dung. */
function PasswordField({ id, placeholder, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-4 py-2 pr-10 border rounded-lg focus:outline-none focus:ring focus:ring-indigo-300"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        <i className={`fa-solid ${show ? 'fa-eye-slash' : 'fa-eye'}`} />
      </button>
    </div>
  );
}

/**
 * Info (/info) — Trang thông tin cá nhân: hồ sơ (username/email/role badge),
 * thống kê hoạt động, đổi avatar (upload ảnh → refreshUser cập nhật Header ngay)
 * và form đổi mật khẩu (yêu cầu mật khẩu hiện tại, xác nhận mật khẩu mới).
 */
export default function Info() {
  const { user, refreshUser } = useAuth();
  const { toast } = useAlert();
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const previewUrlRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [pwd, setPwd] = useState({ current: '', new: '', confirm: '' });

  const setPreview = (url) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  };

  const { data: stats } = useQuery({
    queryKey: ['user-stats'],
    queryFn: getUserStats,
    enabled: !!user,
  });

  const { mutate: doUpload, isPending: uploading } = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('avatar', file);
      return uploadAvatar(fd);
    },
    onSuccess: () => {
      toast('Ảnh đại diện đã được cập nhật!', 'success');
      setPreview(null);
      refreshUser?.();
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => {
      toast(err.message || 'Tải ảnh thất bại', 'error');
      setPreview(null);
    },
  });

  const { mutate: doChangePwd, isPending: changingPwd } = useMutation({
    mutationFn: () => changePassword({ currentPassword: pwd.current, newPassword: pwd.new }),
    onSuccess: (data) => {
      toast(data.message || 'Đổi mật khẩu thành công!', 'success');
      setPwd({ current: '', new: '', confirm: '' });
      setShowPwdForm(false);
    },
    onError: (err) => toast(err.message || 'Đổi mật khẩu thất bại', 'error'),
  });

  const handlePwdSubmit = (e) => {
    e.preventDefault();
    if (!pwd.current || !pwd.new || !pwd.confirm) { toast('Vui lòng điền đầy đủ các trường!', 'warning'); return; }
    if (pwd.new.length < 6) { toast('Mật khẩu mới phải có ít nhất 6 ký tự!', 'warning'); return; }
    if (pwd.new !== pwd.confirm) { toast('Mật khẩu nhập lại không khớp!', 'warning'); return; }
    doChangePwd();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      doUpload(file);
    }
    e.target.value = '';
  };

  if (!user) return null;

  const badge = ROLE_BADGE[user.role] || ROLE_BADGE.user;
  const joinDate = user.created_at
    ? new Intl.DateTimeFormat('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(user.created_at))
    : null;

  return (
    <main className="flex-grow container mx-auto py-10 px-6">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-8 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-gradient-to-tr from-indigo-300 to-purple-300 rounded-full opacity-30 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col items-center gap-3 z-10">
          {/* Avatar */}
          <div className="relative group">
            <img
              src={previewUrl || user.avatar_url || '/assets/images/Logo.png'}
              alt="Avatar"
              className={`w-28 h-28 rounded-full border-4 border-indigo-500 object-cover shadow-md transition-all duration-200 ${uploading ? 'opacity-50 scale-95' : 'hover:scale-105'}`}
              onError={(e) => { e.currentTarget.src = '/assets/images/Logo.png'; }}
            />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full">
                <i className="fa-solid fa-spinner fa-spin text-indigo-600 text-2xl drop-shadow" />
              </div>
            )}
            <label
              htmlFor="uploadAvatar"
              className={`absolute bottom-0 right-0 bg-indigo-600 text-white rounded-full p-2 shadow transition ${uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-indigo-700'}`}
              title="Thay ảnh đại diện"
            >
              <i className="fa-solid fa-camera text-sm" />
            </label>
            <input
              type="file"
              id="uploadAvatar"
              accept="image/*"
              ref={fileRef}
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mt-1">{user.username}</h2>

          {/* Role badge + email + join date */}
          <div className="flex flex-col items-center gap-1">
            <span className={`text-xs px-3 py-0.5 rounded-full font-medium ${badge.cls}`}>
              {badge.label}
            </span>
            <p className="text-gray-500 text-sm">{user.email}</p>
            {joinDate && (
              <p className="text-xs text-gray-400">
                <i className="fa-solid fa-calendar-days mr-1" />
                Tham gia {joinDate}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <StatCard value={stats?.stories_read} label="Truyện đã đọc" icon="fa-solid fa-book-open text-indigo-400" color="indigo" />
            <StatCard value={stats?.fav_lists} label="Danh sách YT" icon="fa-solid fa-heart text-pink-400" color="pink" />
            <StatCard value={stats?.reports_sent} label="Báo lỗi đã gửi" icon="fa-solid fa-flag text-amber-400" color="amber" />
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/fav"
              className="flex items-center justify-center gap-2 px-5 py-2 bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-200 transition"
            >
              <i className="fa-solid fa-heart text-indigo-500" /> Danh sách yêu thích
            </Link>
            <button
              onClick={() => setShowPwdForm((v) => !v)}
              className="flex items-center justify-center gap-2 px-5 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
            >
              <i className="fa-solid fa-key" /> Đổi mật khẩu
            </button>
            <Link
              to="/home"
              className="flex items-center justify-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              <i className="fa-solid fa-arrow-left" /> Quay lại
            </Link>
          </div>

          {/* Change password form */}
          {showPwdForm && (
            <form
              onSubmit={handlePwdSubmit}
              className="w-full mt-2"
            >
              <div className="rounded-2xl border border-gray-100 shadow-sm bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-100">
                  <i className="fa-solid fa-lock text-indigo-500 text-sm" />
                  <span className="text-sm font-semibold text-gray-700">Đổi mật khẩu</span>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3">
                  <PasswordField
                    id="currentPassword"
                    placeholder="Mật khẩu hiện tại"
                    value={pwd.current}
                    onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
                  />
                  <PasswordField
                    id="newPassword"
                    placeholder="Mật khẩu mới"
                    value={pwd.new}
                    onChange={(e) => setPwd((p) => ({ ...p, new: e.target.value }))}
                  />
                  <PasswordField
                    id="confirmPassword"
                    placeholder="Nhập lại mật khẩu mới"
                    value={pwd.confirm}
                    onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
                  />
                  <button
                    type="submit"
                    disabled={changingPwd}
                    className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition disabled:opacity-60 mt-1"
                  >
                    {changingPwd ? (
                      <><i className="fa-solid fa-spinner fa-spin mr-2" />Đang xử lý...</>
                    ) : 'Xác nhận đổi mật khẩu'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
