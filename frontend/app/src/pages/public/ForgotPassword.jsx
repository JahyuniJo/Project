import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { forgotPassword } from '../../api/auth';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setMsg({ text: 'Vui lòng nhập email', ok: false }); return; }
    setLoading(true);
    setMsg(null);
    try {
      const data = await forgotPassword(email.trim());
      setMsg({ text: data.message, ok: true });
      setTimeout(() => navigate(`/reset-password?email=${encodeURIComponent(email.trim())}`), 1500);
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-lg rounded-2xl w-full max-w-md p-8 border border-gray-100">
      <h2 className="text-center text-2xl font-bold text-indigo-600 mb-2">Khôi phục mật khẩu</h2>
      <p className="text-center text-gray-500 text-sm mb-6">
        Nhập email đã đăng ký. Chúng tôi sẽ gửi mã xác nhận về hộp thư của bạn.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-700 font-medium mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Nhập email đã đăng ký..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-all disabled:opacity-60"
        >
          {loading ? 'Đang gửi...' : 'Gửi mã xác nhận'}
        </button>
      </form>

      {msg && (
        <div className={`mt-4 text-center text-sm font-medium ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
          {msg.text}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link to="/login" className="text-gray-500 text-sm hover:underline">
          ← Quay lại đăng nhập
        </Link>
      </div>
    </div>
  );
}
