import { useState } from 'react';
import SelectDropdown from '../../components/SelectDropdown';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { getUsers, createUser, updateUser, deleteUser, lockUser } from '../../api/admin';

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Định dạng ISO date thành dd/mm/yyyy kiểu Việt Nam; rỗng → "—". */
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Định dạng thời điểm hết khóa thành "dd/mm/yyyy hh:mm" để hiện tooltip/badge. */
function formatLocked(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Tài khoản có đang bị khóa không (locked_until còn ở tương lai). */
function isLocked(locked_until) { return locked_until && new Date(locked_until) > new Date(); }

const LOCK_OPTIONS = [
  { value: 1, label: '1 giờ' }, { value: 12, label: '12 giờ' },
  { value: 24, label: '1 ngày (24 giờ)' }, { value: 72, label: '3 ngày' },
  { value: 168, label: '7 ngày' }, { value: 720, label: '30 ngày' },
];

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <nav className="flex gap-2">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={`px-3 py-1 rounded ${page <= 1 ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 hover:bg-gray-300'}`}
      >←</button>
      {pages.map(i => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={`px-3 py-1 rounded ${i === page ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
        >{i}</button>
      ))}
      <button
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className={`px-3 py-1 rounded ${page >= totalPages ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 hover:bg-gray-300'}`}
      >→</button>
    </nav>
  );
}

// ── User Add/Edit Modal ───────────────────────────────────────────────────────
/**
 * UserModal — Modal thêm/sửa user dùng chung: `editing` null → form tạo mới
 * (bắt buộc mật khẩu), có giá trị → form sửa (username/email/role, không đổi
 * mật khẩu).
 */
function UserModal({ editing, onClose, onSave }) {
  const { toast } = useAlert();
  const [form, setForm] = useState({
    username: editing?.username || '',
    email: editing?.email || '',
    password: '',
    role: editing?.role || 'user',
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editing && !form.password) { toast('Vui lòng nhập mật khẩu khi tạo người dùng mới', 'error'); return; }
    if (!editing && form.password.length < 6) { toast('Mật khẩu phải có ít nhất 6 ký tự', 'error'); return; }
    setSaving(true);
    try {
      const body = { username: form.username.trim(), email: form.email.trim(), role: form.role };
      if (!editing) body.password = form.password;
      await onSave(body);
      onClose();
    } catch (err) {
      toast(err.message || 'Thao tác thất bại', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-96 p-6 rounded-xl shadow-2xl">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">
          {editing ? 'Chỉnh sửa người dùng' : 'Thêm người dùng'}
        </h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text" placeholder="Tên người dùng" required
            value={form.username} onChange={set('username')}
            className="border px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="email" placeholder="Email" required
            value={form.email} onChange={set('email')}
            className="border px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {!editing && (
            <input
              type="password" placeholder="Mật khẩu"
              value={form.password} onChange={set('password')}
              className="border px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          )}
          <SelectDropdown
            options={[{ value: 'user', label: 'Người dùng' }, { value: 'admin', label: 'Quản trị viên' }]}
            value={form.role}
            onChange={(v) => setForm((f) => ({ ...f, role: v }))}
          />
          <div className="flex justify-end gap-3 mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Hủy</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Lock Modal ────────────────────────────────────────────────────────────────
/**
 * LockModal — Modal chọn thời hạn khóa tài khoản (1 giờ → 30 ngày, theo
 * LOCK_OPTIONS) trước khi gọi API PATCH /lock.
 */
function LockModal({ userId, username, onClose, onConfirm }) {
  const { toast } = useAlert();
  const [duration, setDuration] = useState(24);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(duration); onClose(); }
    catch (err) { toast(err.message || 'Khóa thất bại', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-96 p-6 rounded-xl shadow-2xl">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Khóa tài khoản: {username}</h3>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Thời hạn khóa</label>
          <SelectDropdown
            options={LOCK_OPTIONS}
            value={duration}
            onChange={(v) => setDuration(v)}
            className="w-full"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Hủy</button>
          <button onClick={handleConfirm} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
            {loading ? 'Đang xử lý...' : 'Xác nhận khóa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
/**
 * AdminUsers (/admin/users) — Bảng quản lý người dùng: tìm kiếm theo tên/email,
 * lọc role, phân trang; thao tác thêm/sửa (UserModal), khóa/mở khóa có thời hạn
 * (LockModal) và xóa (confirm trước). Mọi thay đổi xong đều invalidate query
 * danh sách để bảng tự refetch.
 */
export default function AdminUsers() {
  const { user: me } = useAuth();
  const { toast, confirm } = useAlert();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);    // null | { editing: null | user }
  const [lockModal, setLockModal] = useState(null); // null | { userId, username }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', { page, search, role }],
    queryFn: () => getUsers({ page, limit: 10, search: search || undefined, role: role || undefined }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-users'] });

  const { mutateAsync: doCreate } = useMutation({
    mutationFn: createUser,
    onSuccess: () => { refresh(); toast('Đã thêm người dùng mới', 'success'); },
  });
  const { mutateAsync: doUpdate } = useMutation({
    mutationFn: ({ id, data }) => updateUser(id, data),
    onSuccess: () => { refresh(); toast('Đã cập nhật người dùng', 'success'); },
  });
  const { mutate: doDelete } = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => { refresh(); toast('Đã xóa người dùng', 'success'); },
    onError: err => toast(err.message || 'Xóa thất bại', 'error'),
  });
  const { mutateAsync: doLock } = useMutation({
    mutationFn: ({ id, hours }) => lockUser(id, hours),
    onSuccess: (data) => { refresh(); toast(data?.message || 'Cập nhật trạng thái khóa thành công', 'success'); },
  });

  const handleDelete = async (id) => {
    const ok = await confirm('Bạn có chắc chắn muốn xóa người dùng này?', 'Xác nhận xóa');
    if (ok) doDelete(id);
  };

  const handleUnlock = async (id) => {
    const ok = await confirm('Bạn có chắc muốn mở khóa tài khoản này?', 'Xác nhận');
    if (!ok) return;
    try { await doLock({ id, hours: 0 }); }
    catch (err) { toast(err.message || 'Mở khóa thất bại', 'error'); }
  };

  const users = data?.users || [];

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      {/* Title + Add */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 sm:mb-0">Quản lý người dùng</h2>
        <button
          onClick={() => setModal({ editing: null })}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg shadow-md transition"
        >
          <i className="fa fa-plus" /> Thêm người dùng
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 mb-6">
        <form
          onSubmit={e => { e.preventDefault(); setPage(1); }}
          className="flex flex-col md:flex-row items-center gap-4"
        >
          <input
            type="text"
            placeholder="Tìm kiếm theo tên hoặc email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <SelectDropdown
            options={[
              { value: '', label: 'Tất cả vai trò' },
              { value: 'user', label: 'Người dùng' },
              { value: 'admin', label: 'Quản trị viên' },
            ]}
            value={role}
            onChange={(v) => { setRole(v); setPage(1); }}
          />
          <div className="flex gap-3">
            <button type="submit" className="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 font-medium">Tìm</button>
            <button
              type="button"
              onClick={() => { setSearch(''); setRole(''); setPage(1); }}
              className="bg-gray-200 px-5 py-2 rounded-lg hover:bg-gray-300 font-medium"
            >Làm mới</button>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <table className="min-w-full">
          <thead className="bg-indigo-50 text-indigo-700 text-sm uppercase font-semibold">
            <tr>
              <th className="py-3 px-4 text-left">ID</th>
              <th className="py-3 px-4 text-left">Tên người dùng</th>
              <th className="py-3 px-4 text-left">Email</th>
              <th className="py-3 px-4 text-left">Vai trò</th>
              <th className="py-3 px-4 text-left">Ngày đăng ký</th>
              <th className="py-3 px-4 text-center">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-gray-700 text-sm">
            {isLoading ? (
              <tr><td colSpan={6} className="py-10 text-center">
                <div className="inline-block w-7 h-7 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              </td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">Không tìm thấy người dùng nào.</td></tr>
            ) : users.map(u => {
              const isSelf = u.id === me?.id;
              const locked = isLocked(u.locked_until);
              return (
                <tr key={u.id}>
                  <td className="py-3 px-4">{u.id}</td>
                  <td className="py-3 px-4">{u.username}</td>
                  <td className="py-3 px-4">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {u.role === 'admin' ? 'Admin' : 'Người dùng'}
                    </span>
                    {locked && (
                      <span className="ml-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700"
                        title={`Khóa đến ${formatLocked(u.locked_until)}`}
                      >
                        🔒 đến {formatLocked(u.locked_until)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-500">{formatDate(u.created_at)}</td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <button
                      onClick={() => setModal({ editing: u })}
                      className="text-blue-600 hover:text-blue-800 mx-1" title="Chỉnh sửa"
                    >
                      <i className="fa fa-edit" />
                    </button>
                    {!isSelf && (<>
                      {locked ? (
                        <button onClick={() => handleUnlock(u.id)} className="text-green-600 hover:text-green-800 mx-1" title="Mở khóa">
                          <i className="fa fa-lock-open" />
                        </button>
                      ) : (
                        <button onClick={() => setLockModal({ userId: u.id, username: u.username })} className="text-orange-400 hover:text-orange-600 mx-1" title="Khóa tài khoản">
                          <i className="fa fa-lock" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:text-red-800 mx-1" title="Xóa">
                        <i className="fa fa-trash" />
                      </button>
                    </>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Tổng {data?.total || 0} người dùng — Trang {data?.page || 1}/{data?.totalPages || 1}</span>
        <Pagination page={page} totalPages={data?.totalPages || 1} onChange={setPage} />
      </div>

      {/* Modals */}
      {modal && (
        <UserModal
          editing={modal.editing}
          onClose={() => setModal(null)}
          onSave={async (body) => {
            if (modal.editing) await doUpdate({ id: modal.editing.id, data: body });
            else await doCreate(body);
          }}
        />
      )}
      {lockModal && (
        <LockModal
          userId={lockModal.userId}
          username={lockModal.username}
          onClose={() => setLockModal(null)}
          onConfirm={(hours) => doLock({ id: lockModal.userId, hours })}
        />
      )}
    </div>
  );
}
