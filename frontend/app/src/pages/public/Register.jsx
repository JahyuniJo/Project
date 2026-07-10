import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../../api/auth';

/**
 * Register (/register) — Form đăng ký: username/email/mật khẩu + xác nhận
 * mật khẩu (so khớp phía client trước khi gọi API; validate chi tiết còn lại
 * do backend đảm nhiệm). Thành công → tự chuyển về /login sau 2s.
 */
export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm_password: '' });
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm_password) {
      setMsg({ text: 'Mật khẩu xác nhận không khớp', ok: false });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const data = await register(form);
      setMsg({ text: data.message, ok: true });
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  const field = (label, key, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-gray-700 font-medium mb-1">{label}</label>
      <input
        type={type}
        required
        value={form[key]}
        onChange={set(key)}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
      />
    </div>
  );

  return (
    <div className="bg-white shadow-lg rounded-2xl w-full max-w-md p-8 border border-gray-100">
      <h2 className="text-center text-2xl font-bold text-indigo-600 mb-6">Tạo tài khoản mới</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {field('Tên đăng nhập', 'username', 'text', 'Nhập tên đăng nhập...')}
        {field('Email', 'email', 'email', 'Nhập email...')}
        {field('Mật khẩu', 'password', 'password', 'Tối thiểu 6 ký tự...')}
        {field('Xác nhận mật khẩu', 'confirm_password', 'password', 'Nhập lại mật khẩu...')}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-all disabled:opacity-60"
        >
          {loading ? 'Đang đăng ký...' : 'Đăng Ký'}
        </button>
      </form>

      {msg && (
        <div className={`mt-4 text-center text-sm font-semibold ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
          {msg.text}
        </div>
      )}

      <div className="mt-6 text-center space-y-2">
        <p className="text-gray-600">
          Đã có tài khoản?{' '}
          <Link to="/login" className="text-indigo-600 font-medium hover:underline">
            Đăng nhập
          </Link>
        </p>
        <Link to="/" className="text-gray-500 text-sm hover:underline">
          ← Quay lại trang chủ
        </Link>
      </div>
    </div>
  );
}
