import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const { login: setContextUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [msg, setMsg] = useState(null); // { text, ok }
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const data = await login(form);
      setMsg({ text: data.message, ok: true });
      setContextUser(); // re-fetch user info từ /api/import/me
      setTimeout(() => {
        navigate(data.role === 'admin' ? '/admin' : '/home', { replace: true });
      }, 800);
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-lg rounded-2xl w-full max-w-md p-8 border border-gray-100">
      <h2 className="text-center text-2xl font-bold text-indigo-600 mb-6">Đăng nhập vào tài khoản</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-700 font-medium mb-1">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Nhập email..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-gray-700 font-medium mb-1">Mật khẩu</label>
          <input
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Nhập mật khẩu..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
          />
        </div>
        <div className="flex justify-end">
          <Link to="/forgot" className="text-sm text-indigo-600 hover:underline">
            Quên mật khẩu?
          </Link>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-all disabled:opacity-60"
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng Nhập'}
        </button>
      </form>

      {msg && (
        <div className={`mt-4 text-center text-sm font-semibold ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
          {msg.text}
        </div>
      )}

      <div className="mt-6 text-center space-y-2">
        <p className="text-gray-600">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="text-indigo-600 font-medium hover:underline">
            Đăng ký
          </Link>
        </p>
        <Link to="/" className="text-gray-500 text-sm hover:underline">
          ← Quay lại trang chủ
        </Link>
      </div>
    </div>
  );
}
