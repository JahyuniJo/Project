import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAlert } from '../../context/AlertContext';
import { getAdminReports, respondReport } from '../../api/admin';
import SelectDropdown from '../../components/SelectDropdown';

const PAGE_SIZE = 10;

// [2] Status labels sang tiếng Việt
const STATUS_LABELS = {
  pending: { text: 'Chờ xử lý',  cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: 'fa-clock',        border: 'border-l-yellow-400' },
  fixing:  { text: 'Đang xử lý', cls: 'bg-blue-100 text-blue-700 border-blue-200',       icon: 'fa-wrench',       border: 'border-l-blue-400'   },
  done:    { text: 'Đã xử lý',   cls: 'bg-green-100 text-green-700 border-green-200',    icon: 'fa-circle-check', border: 'border-l-green-400'  },
  ignored: { text: 'Bỏ qua',     cls: 'bg-gray-100 text-gray-500 border-gray-200',       icon: 'fa-circle-minus', border: 'border-l-gray-300'   },
};

const STATUS_OPTIONS_LIST = Object.entries(STATUS_LABELS).map(([value, { text }]) => ({ value, label: text }));

const FILTERS = [{ value: '', label: 'Tất cả' }, ...STATUS_OPTIONS_LIST];

// ── Lightbox ──────────────────────────────────────────────────────────────────
/** Lightbox — Phóng to ảnh chụp màn hình đính kèm báo lỗi; click nền tối để đóng. */
function Lightbox({ src, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative">
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 bg-white text-gray-700 hover:bg-gray-200 shadow-lg w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold"
        >&times;</button>
        <img src={src} alt="Screenshot" className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl border-4 border-white" />
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex gap-2">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className={`px-3 py-1 rounded ${page <= 1 ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 hover:bg-gray-300'}`}>←</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((i) => (
        <button key={i} onClick={() => onChange(i)} className={`px-3 py-1 rounded ${i === page ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>{i}</button>
      ))}
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className={`px-3 py-1 rounded ${page >= totalPages ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 hover:bg-gray-300'}`}>→</button>
    </nav>
  );
}

// ── [1] Card thay thế table row ───────────────────────────────────────────────
/**
 * ReportCard — Card 1 báo lỗi: tiêu đề, người gửi, nội dung, ảnh screenshot
 * (bấm mở Lightbox), badge trạng thái; kèm form phản hồi inline cho admin
 * chọn trạng thái mới + viết phản hồi (gửi xong user được thông báo realtime).
 */
function ReportCard({ report, onResponded }) {
  const { toast, confirm } = useAlert();
  const [status, setStatus] = useState(report.status || 'pending');
  const [response, setResponse] = useState('');
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  // [9] Expand full message
  const [expanded, setExpanded] = useState(false);

  // Sync khi data refetch cập nhật props
  useEffect(() => { setStatus(report.status || 'pending'); }, [report.status]);

  const sl = STATUS_LABELS[report.status] || STATUS_LABELS.pending;
  const hasResponse = !!report.response;
  const isLong = (report.message?.length ?? 0) > 150;

  const screenshotPath = report.screenshot_path
    ? (report.screenshot_path.startsWith('/') ? report.screenshot_path : `/uploads/${report.screenshot_path}`)
    : null;

  const handleSend = async (quickStatus = null) => {
    const finalStatus = quickStatus || status;
    const finalResponse = response.trim();
    if (!quickStatus && !finalResponse) { toast('Vui lòng nhập nội dung phản hồi', 'warning'); return; }
    const ok = await confirm('Gửi phản hồi và cập nhật trạng thái?', 'Xác nhận');
    if (!ok) return;
    setSending(true);
    try {
      await respondReport(report.id, { status: finalStatus, response: finalResponse });
      toast('Đã cập nhật thành công', 'success');
      setResponse('');
      onResponded();
    } catch (err) {
      toast(err.message || 'Gửi phản hồi thất bại', 'error');
    } finally { setSending(false); }
  };

  return (
    // [5] Left border màu theo status
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${sl.border} shadow-sm hover:shadow-md transition`}>

      {/* ── Header: title + meta ── */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* [5] Badges trạng thái + đã phản hồi */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium border ${sl.cls}`}>
              <i className={`fa-solid ${sl.icon} text-[10px]`} />{sl.text}
            </span>
            {hasResponse && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">
                <i className="fa-solid fa-check text-[10px]" /> Đã phản hồi
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-800 truncate">{report.title || '—'}</p>
          {/* [6] Email + timestamp + URL */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-400">
            <span><i className="fa-solid fa-envelope mr-1" />{report.user_email || '—'}</span>
            <span><i className="fa-regular fa-clock mr-1" />{new Date(report.created_at).toLocaleString('vi-VN')}</span>
            {report.story_url && (
              <a href={report.story_url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">
                <i className="fa-solid fa-link mr-1" />Xem truyện
              </a>
            )}
          </div>
        </div>
        {/* Screenshot thumbnail */}
        {screenshotPath && (
          <img
            src={screenshotPath}
            alt="screenshot"
            className="h-16 w-24 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition flex-shrink-0"
            onClick={() => setLightbox(screenshotPath)}
          />
        )}
      </div>

      {/* ── Message body ── */}
      <div className="px-5 pb-3 border-t border-gray-50 pt-3">
        {/* [9] Expand/collapse message */}
        <p className={`text-sm text-gray-600 leading-relaxed whitespace-pre-line ${!expanded && isLong ? 'line-clamp-3' : ''}`}>
          {report.message}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 transition"
          >
            {expanded ? '▲ Thu gọn' : '▼ Xem đầy đủ'}
          </button>
        )}

        {/* [5] Phản hồi cũ nếu đã có */}
        {hasResponse && (
          <div className="mt-3 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <p className="text-xs font-semibold text-green-700 flex items-center gap-1 mb-0.5">
              <i className="fa-solid fa-reply" /> Phản hồi trước
            </p>
            <p className="text-sm text-green-700">{report.response}</p>
          </div>
        )}
      </div>

      {/* ── Action section ── */}
      <div className="px-5 py-3 bg-gray-50/60 rounded-b-xl border-t border-gray-100">
        <div className="flex flex-col gap-2">
          {/* [8] Quick actions + status select */}
          <div className="flex items-center gap-2 flex-wrap">
            <SelectDropdown
              options={STATUS_OPTIONS_LIST}
              value={status}
              onChange={setStatus}
              size="sm"
              className="w-36"
            />
            <button
              onClick={() => handleSend('done')}
              disabled={sending}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-green-100 text-green-700 border border-green-200 rounded-lg hover:bg-green-200 transition font-medium disabled:opacity-60"
            >
              <i className="fa-solid fa-check" /> Đã xử lý
            </button>
            <button
              onClick={() => handleSend('ignored')}
              disabled={sending}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-gray-100 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-200 transition font-medium disabled:opacity-60"
            >
              <i className="fa-solid fa-ban" /> Bỏ qua
            </button>
          </div>
          {/* [4] Textarea thay input 1 dòng */}
          <div className="flex gap-2">
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder={hasResponse ? 'Nhập phản hồi mới...' : 'Nhập phản hồi cho người dùng...'}
              rows={2}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
            <button
              onClick={() => handleSend()}
              disabled={sending}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition disabled:opacity-60 self-start"
            >
              {sending
                ? <i className="fa-solid fa-spinner fa-spin" />
                : <><i className="fa-solid fa-paper-plane mr-1" />Gửi</>}
            </button>
          </div>
        </div>
      </div>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
/**
 * AdminReports (/admin/reports) — Trang xử lý báo lỗi: lọc theo trạng thái,
 * phân trang 10 báo lỗi/trang, mỗi báo lỗi là 1 ReportCard có form phản hồi.
 */
export default function AdminReports() {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: raw, refetch } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: getAdminReports,
  });

  const all = raw?.data || raw || [];
  const filtered = filter ? all.filter((r) => r.status === filter) : all;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // [7] Đếm pending để hiện header summary
  const pendingCount = all.filter((r) => r.status === 'pending').length;

  // [3] Đếm theo từng status cho filter badge
  const counts = FILTERS.reduce((acc, f) => {
    acc[f.value] = f.value === '' ? all.length : all.filter((r) => r.status === f.value).length;
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">

      {/* [7] Header + summary pending */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation text-yellow-500" /> Báo lỗi
        </h2>
        {pendingCount > 0 && (
          <span className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm font-medium px-3 py-1.5 rounded-xl">
            <i className="fa-solid fa-clock" />
            {pendingCount} báo lỗi chờ xử lý
          </span>
        )}
      </div>

      {/* [3] Filter + count badge */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-2">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setFilter(value); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition
              ${filter === value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
              ${filter === value ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {counts[value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* [1] Cards */}
      {pageData.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-gray-400">
          <i className="fa-regular fa-folder-open text-4xl mb-3" />
          <p>Không có báo lỗi nào.</p>
        </div>
      ) : (
        <div className="space-y-4 mb-6">
          {pageData.map((r) => (
            <ReportCard key={r.id} report={r} onResponded={refetch} />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{filtered.length > 0 ? `Trang ${page}/${totalPages} — ${filtered.length} mục` : ''}</span>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
