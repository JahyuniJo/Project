import { useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { submitReport, getMyReports } from '../../api/reports';
import SelectDropdown from '../../components/SelectDropdown';

const ERROR_TYPES = [
  { value: 'display', label: 'Lỗi hiển thị / giao diện' },
  { value: 'chapter', label: 'Thiếu hoặc sai chapter' },
  { value: 'content', label: 'Nội dung sai / không đúng' },
  { value: 'image',   label: 'Ảnh bìa / hình ảnh lỗi' },
  { value: 'crash',   label: 'Trang bị crash / không load' },
  { value: 'other',   label: 'Khác' },
];

function StatusBadge({ status }) {
  const map = {
    pending:  { cls: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'Chờ xử lý',  icon: 'fa-clock' },
    resolved: { cls: 'bg-green-100 text-green-700 border-green-300',   label: 'Đã xử lý',   icon: 'fa-circle-check' },
    rejected: { cls: 'bg-red-100 text-red-700 border-red-300',         label: 'Từ chối',    icon: 'fa-circle-xmark' },
  };
  const s = map[status] || { cls: 'bg-gray-100 text-gray-600 border-gray-300', label: status, icon: 'fa-circle' };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${s.cls}`}>
      <i className={`fa-solid ${s.icon}`} /> {s.label}
    </span>
  );
}


export default function ErrorReport() {
  const { user } = useAuth();
  const { toast } = useAlert();

  const [form, setForm] = useState({ errorType: '', title: '', story: '', message: '' });
  const [screenshot, setScreenshot] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const screenshotRef = useRef(null);

  const { data: myReports = [], refetch: refetchReports, isLoading: loadingHistory } = useQuery({
    queryKey: ['my-reports'],
    queryFn: getMyReports,
    enabled: !!user,
  });

  const { mutate: doSubmit, isPending: submitting } = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('title', `[${form.errorType}] ${form.title}`);
      fd.append('story', form.story);
      fd.append('message', form.message);
      fd.append('email', user?.email || '');
      if (screenshot) fd.append('screenshot', screenshot);
      return submitReport(fd);
    },
    onSuccess: () => {
      toast('Đã gửi báo lỗi thành công! Chúng tôi sẽ phản hồi qua email của bạn.', 'success');
      setForm({ errorType: '', title: '', story: '', message: '' });
      setScreenshot(null);
      setPreviewUrl('');
      refetchReports();
    },
    onError: (err) => toast(err.message || 'Gửi báo lỗi thất bại. Vui lòng thử lại.', 'error'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.errorType) { toast('Vui lòng chọn loại lỗi!', 'warning'); return; }
    if (!form.title.trim()) { toast('Vui lòng nhập tên truyện!', 'warning'); return; }
    if (!form.message.trim()) { toast('Vui lòng mô tả lỗi bạn gặp!', 'warning'); return; }
    doSubmit();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshot(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    setPreviewUrl('');
    if (screenshotRef.current) screenshotRef.current.value = '';
  };

  const msgLen = form.message.length;

  return (
    <main className="flex-grow container mx-auto py-10 px-6">
      {/* Form card */}
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-8 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-gradient-to-tr from-indigo-300 to-purple-300 rounded-full opacity-30 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">Gửi báo lỗi đến hệ thống</h2>
          <p className="text-gray-500 text-center text-sm mb-6">
            Gặp trang lỗi, chapter không đọc được, nội dung sai, hay hình ảnh lỗi? Hãy báo cáo để chúng tôi xử lý nhanh nhất.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Error type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loại lỗi <span className="text-red-500">*</span>
              </label>
              <SelectDropdown
                options={ERROR_TYPES}
                value={form.errorType}
                onChange={(v) => setForm((f) => ({ ...f, errorType: v }))}
                placeholder="-- Chọn loại lỗi --"
              />
            </div>

            {/* Story name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tên truyện <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Nhập tên truyện gặp lỗi"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            {/* Email (auto-fill, disabled) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email nhận phản hồi <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>

            {/* Story URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL truyện (nếu có)</label>
              <input
                type="text"
                value={form.story}
                onChange={(e) => setForm((f) => ({ ...f, story: e.target.value }))}
                placeholder="https://..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mô tả chi tiết lỗi <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                maxLength={500}
                rows={5}
                placeholder="Mô tả chi tiết về lỗi bạn gặp phải..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
              <div className="flex justify-end mt-1">
                <span className={`text-xs ${msgLen > 450 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                  {msgLen} / 500
                </span>
              </div>
            </div>

            {/* Screenshot */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ảnh chụp màn hình (nếu có)</label>
              <label
                htmlFor="screenshot"
                className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-indigo-300 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition text-indigo-600 text-sm w-fit"
              >
                <i className="fa-solid fa-image" />
                <span>{screenshot ? screenshot.name : 'Chọn ảnh chụp màn hình'}</span>
              </label>
              <input
                type="file"
                id="screenshot"
                accept="image/*"
                ref={screenshotRef}
                onChange={handleFileChange}
                className="hidden"
              />
              {previewUrl && (
                <div className="mt-3">
                  <div className="relative inline-block">
                    <img src={previewUrl} alt="Preview" className="max-h-40 max-w-full rounded-lg border border-gray-200 shadow-sm" />
                    <button
                      type="button"
                      onClick={removeScreenshot}
                      title="Xóa ảnh"
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 shadow"
                    >
                      <i className="fa-solid fa-xmark text-xs" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting
                ? <><i className="fa-solid fa-spinner fa-spin" /><span>Đang gửi...</span></>
                : <><i className="fa-solid fa-paper-plane" /><span>Gửi báo lỗi</span></>
              }
            </button>
          </form>
        </div>
      </div>

      {/* History section */}
      {user && (
        <div className="max-w-3xl mx-auto mt-8">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <i className="fa-solid fa-clock-rotate-left text-indigo-500" />
              Báo lỗi trước đây của bạn
            </h3>
            {loadingHistory ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-400 border-t-transparent" />
              </div>
            ) : myReports.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center text-gray-400">
                <i className="fa-regular fa-folder-open text-3xl mb-2" />
                <p className="text-sm">Bạn chưa gửi báo lỗi nào.</p>
              </div>
            ) : (
              <div>
                {myReports.map((r) => (
                  <div key={r.id} className="border border-gray-100 rounded-xl p-4 mb-3 hover:shadow-sm transition bg-gray-50/50">
                    <div className="flex justify-between items-start gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{r.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <i className="fa-regular fa-clock" />
                          {new Date(r.created_at).toLocaleString('vi-VN')}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">{r.message}</p>
                    {r.story_url && (
                      <a
                        href={r.story_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline mt-1"
                      >
                        <i className="fa-solid fa-link" /> {r.story_url}
                      </a>
                    )}
                    {r.response && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-green-700 flex items-center gap-1 mb-1">
                          <i className="fa-solid fa-reply" /> Phản hồi từ Admin
                        </p>
                        <p className="text-sm text-green-700">{r.response}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
