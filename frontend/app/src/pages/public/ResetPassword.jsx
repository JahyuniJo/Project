import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { forgotPassword, resetPassword, verifyOtp } from '../../api/auth';

const COUNTDOWN = 60;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');
  const navigate = useNavigate();

  const [step, setStep] = useState('otp'); // 'otp' | 'password'
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(COUNTDOWN);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { clearInterval(timerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  if (!email) return <Navigate to="/forgot" replace />;

  const handleResend = async () => {
    setLoading(true);
    try {
      await forgotPassword(email);
      setMsg({ text: 'Đã gửi lại mã OTP', ok: true });
      setSeconds(COUNTDOWN);
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSeconds((s) => { if (s <= 1) { clearInterval(timerRef.current); return 0; } return s - 1; });
      }, 1000);
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setMsg({ text: 'Mã OTP gồm đúng 6 chữ số', ok: false }); return; }
    setLoading(true);
    setMsg(null);
    try {
      await verifyOtp({ email, otp });
      setMsg(null);
      setStep('password');
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) { setMsg({ text: 'Mật khẩu phải có ít nhất 6 ký tự', ok: false }); return; }
    if (newPassword !== confirmPassword) { setMsg({ text: 'Mật khẩu xác nhận không khớp', ok: false }); return; }
    setLoading(true);
    setMsg(null);
    try {
      await resetPassword({ email, otp, newPassword });
      setMsg({ text: 'Đặt lại mật khẩu thành công! Đang chuyển hướng...', ok: true });
      setTimeout(() => navigate('/login', { replace: true }), 1800);
    } catch (err) {
      setMsg({ text: err.message, ok: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-lg rounded-2xl w-full max-w-md p-8 border border-gray-100">
      <h2 className="text-center text-2xl font-bold text-indigo-600 mb-2">Đặt lại mật khẩu</h2>
      <p className="text-center text-gray-500 text-sm mb-6">Mã OTP đã được gửi đến: {email}</p>

      {step === 'otp' && (
        <>
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-gray-700 font-medium mb-1">Mã xác nhận (OTP)</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="Nhập mã 6 chữ số..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none tracking-widest text-center text-lg font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-all disabled:opacity-60"
            >
              {loading ? 'Đang xác nhận...' : 'Xác nhận OTP'}
            </button>
          </form>

          <div className="mt-3 text-center">
            {seconds > 0 ? (
              <span className="text-indigo-400 text-sm">Gửi lại mã ({seconds}s)</span>
            ) : (
              <button
                onClick={handleResend}
                disabled={loading}
                className="text-indigo-500 text-sm hover:underline disabled:opacity-50"
              >
                Gửi lại mã
              </button>
            )}
          </div>
        </>
      )}

      {step === 'password' && (
        <>
          <div className="flex items-center gap-2 mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <i className="fa-solid fa-circle-check text-green-500"></i>
            <span className="text-green-700 text-sm font-medium">OTP hợp lệ — vui lòng nhập mật khẩu mới</span>
          </div>
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-gray-700 font-medium mb-1">Mật khẩu mới</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-1">Xác nhận mật khẩu</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-all disabled:opacity-60"
            >
              {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
            </button>
          </form>
        </>
      )}

      {msg && (
        <div className={`mt-4 text-center text-sm font-medium ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
          {msg.text}
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-500">
        <Link to="/forgot" className="hover:underline">← Gửi lại OTP</Link>
        <span className="mx-2">·</span>
        <Link to="/login" className="hover:underline">Đăng nhập</Link>
      </div>
    </div>
  );
}
