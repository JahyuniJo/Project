import { useEffect, useRef, useState } from 'react';
import SelectDropdown from '../../components/SelectDropdown';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAlert } from '../../context/AlertContext';
import { getStories, searchStories } from '../../api/stories';
import { getStatusCounts, syncStories, syncChapters, updateStory, deleteStory, getStoryDetail } from '../../api/admin';

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  ongoing:   { cls: 'bg-green-100 text-green-700',   label: 'Đang ra' },
  completed: { cls: 'bg-blue-100 text-blue-700',     label: 'Hoàn thành' },
  stopped:   { cls: 'bg-yellow-100 text-yellow-700', label: 'Tạm Ngưng' },
};
const STATUS_TO_DISPLAY = { ongoing: 'Đang ra', completed: 'Hoàn thành', stopped: 'Tạm Ngưng' };
const DISPLAY_TO_DB = { 'Đang ra': 'ongoing', 'Hoàn thành': 'completed', 'Tạm Ngưng': 'stopped' };

/** StatusBadge — Nhãn màu trạng thái truyện (Đang ra / Hoàn thành / Tạm ngưng). */
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { cls: 'bg-gray-100 text-gray-500', label: status || 'Không rõ' };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  const start = Math.max(1, page - 3);
  const end = Math.min(totalPages, start + 6);
  const btns = [];
  for (let i = start; i <= end; i++) btns.push(i);
  return (
    <nav className="flex flex-wrap gap-2 items-center justify-center mt-6">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className={`px-3 py-1 rounded text-sm ${page <= 1 ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 hover:bg-gray-300'}`}>← Trang trước</button>
      {start > 1 && <><button onClick={() => onChange(1)} className="px-3 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300">1</button>{start > 2 && <span className="px-2 text-sm text-gray-500">...</span>}</>}
      {btns.map(i => (
        <button key={i} onClick={() => onChange(i)} className={`px-3 py-1 rounded text-sm ${i === page ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>{i}</button>
      ))}
      {end < totalPages && <>{end < totalPages - 1 && <span className="px-2 text-sm text-gray-500">...</span>}<button onClick={() => onChange(totalPages)} className="px-3 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300">{totalPages}</button></>}
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className={`px-3 py-1 rounded text-sm ${page >= totalPages ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 hover:bg-gray-300'}`}>Trang sau →</button>
    </nav>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
/**
 * EditModal — Modal sửa truyện: load chi tiết theo storyId rồi cho sửa
 * title/author/cover/URL/mô tả/thể loại/trạng thái (nhãn tiếng Việt được map
 * ngược về giá trị DB qua DISPLAY_TO_DB trước khi gửi PUT).
 */
function EditModal({ storyId, onClose, onSaved }) {
  const { toast } = useAlert();
  const [form, setForm] = useState({ title: '', author: '', status: 'Đang ra', cover_url: '', url: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStoryDetail(storyId).then(s => {
      setForm({
        title: s.title || '',
        author: s.author || '',
        status: STATUS_TO_DISPLAY[s.status] || 'Đang ra',
        cover_url: s.cover_url || '',
        url: s.url || '',
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [storyId]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast('Vui lòng nhập tên truyện', 'warning'); return; }
    setSaving(true);
    try {
      await updateStory(storyId, { ...form, status: DISPLAY_TO_DB[form.status] || form.status });
      toast('Đã cập nhật truyện thành công', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast(err.message || 'Lỗi khi lưu thay đổi', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Chỉnh sửa truyện</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><i className="fa-solid fa-xmark" /></button>
        </div>
        {loading ? <div className="flex justify-center py-8"><div className="w-7 h-7 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /></div> : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-sm text-gray-600">Tên truyện</label>
              <input value={form.title} onChange={set('title')} required className="w-full border rounded px-3 py-2 mt-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600">Tác giả</label>
                <input value={form.author} onChange={set('author')} className="w-full border rounded px-3 py-2 mt-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="text-sm text-gray-600">Trạng thái</label>
                <SelectDropdown
                  options={[
                    { value: 'Đang ra', label: 'Đang ra' },
                    { value: 'Hoàn thành', label: 'Hoàn thành' },
                    { value: 'Tạm Ngưng', label: 'Tạm Ngưng' },
                  ]}
                  value={form.status}
                  onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  className="w-full mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600">Link ảnh bìa</label>
              <input value={form.cover_url} onChange={set('cover_url')} className="w-full border rounded px-3 py-2 mt-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Link nguồn (url)</label>
              <input value={form.url} onChange={set('url')} className="w-full border rounded px-3 py-2 mt-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={onClose} className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300">Hủy</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Sync All Chapters Modal (SSE) ─────────────────────────────────────────────
/**
 * SyncAllModal — Modal đồng bộ chương cho TOÀN BỘ truyện: mở kết nối SSE tới
 * /api/stories/crawl-all-chapters/stream và hiển thị tiến độ realtime từng
 * truyện (progress bar + log ok/failed), tổng kết khi xong. Đóng modal sẽ
 * ngắt kết nối SSE.
 */
function SyncAllModal({ onClose }) {
  const logRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('Đang kết nối...');
  const [count, setCount] = useState('');
  const [logs, setLogs] = useState([]);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState(null);
  const esRef = useRef(null);

  useEffect(() => {
    const es = new EventSource('/api/stories/crawl-all-chapters/stream', { withCredentials: true });
    esRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'start') {
        setLogs([{ text: `Bắt đầu đồng bộ ${data.total} truyện...`, cls: 'text-purple-600 font-medium' }]);
      } else if (data.type === 'progress') {
        const pct = Math.round((data.current / data.total) * 100);
        setProgress(pct);
        setLabel(`Đang xử lý: ${data.title}`);
        setCount(`${data.current}/${data.total}`);
      } else if (data.type === 'item') {
        const text = data.status === 'ok'
          ? `✓ [${data.id}] ${data.title} — ${data.count} chương`
          : `✗ [${data.id}] ${data.title} — ${data.message}`;
        const cls = data.status === 'ok' ? 'text-green-600' : data.status === 'failed' ? 'text-orange-500' : 'text-red-500';
        setLogs(prev => [...prev, { text, cls }]);
      } else if (data.type === 'done') {
        es.close(); esRef.current = null;
        setProgress(100); setLabel('Hoàn tất!'); setCount(`${data.total}/${data.total}`);
        setSummary({ text: `Hoàn tất: ${data.success} thành công, ${data.failed} thất bại / ${data.total} truyện`, ok: data.failed === 0 });
        setDone(true);
      } else if (data.type === 'error') {
        es.close(); esRef.current = null;
        setLogs(prev => [...prev, { text: `Lỗi server: ${data.message}`, cls: 'text-red-600 font-medium' }]);
        setDone(true);
      }
    };

    es.onerror = () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      setLogs(prev => [...prev, { text: 'Kết nối bị gián đoạn.', cls: 'text-red-500' }]);
      setDone(true);
    };

    return () => { if (esRef.current) { esRef.current.close(); } };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <i className="fa-solid fa-book-open text-purple-600" /> Đồng bộ chương toàn bộ truyện
          </h3>
          {done && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{label}</span>
            <span>{count}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-purple-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div ref={logRef} className="h-48 overflow-y-auto text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-0.5">
          {logs.length === 0 ? <p className="text-gray-400">Đang chờ bắt đầu...</p> : logs.map((l, i) => (
            <p key={i} className={l.cls}>{l.text}</p>
          ))}
        </div>
        {summary && (
          <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${summary.ok ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
            {summary.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const LIMIT_OPTIONS = [8, 12, 24, 48];

/**
 * AdminStories (/admin/stories) — Bảng quản lý truyện: tìm kiếm, lọc trạng thái
 * (kèm số đếm mỗi trạng thái), phân trang; thao tác: crawl toàn bộ truyện mới
 * (syncStories), đồng bộ chương từng truyện (syncChapters) hoặc tất cả
 * (SyncAllModal — SSE tiến độ realtime), sửa (EditModal) và xóa (confirm).
 */
export default function AdminStories() {
  const { toast, confirm } = useAlert();
  const qc = useQueryClient();

  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(12);
  const [page, setPage] = useState(1);
  const [editId, setEditId] = useState(null);
  const [showSyncAll, setShowSyncAll] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingChapters, setSyncingChapters] = useState({});
  const [showSuggest, setShowSuggest] = useState(false);
  const searchRef = useRef(null);

  // Debounce for autocomplete
  const [debouncedInput, setDebouncedInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInput(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: suggestions = [] } = useQuery({
    queryKey: ['admin-suggest', debouncedInput],
    queryFn: () => searchStories(debouncedInput),
    enabled: debouncedInput.length >= 2,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-stories', { page, appliedSearch, status, limit }],
    queryFn: () => getStories({ page, limit, search: appliedSearch || undefined, status: status || undefined }),
  });

  const { data: counts } = useQuery({ queryKey: ['status-counts'], queryFn: getStatusCounts });

  const stories = data?.data || data?.stories || data?.rows || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || data?.totalCount || 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-stories'] });
    qc.invalidateQueries({ queryKey: ['status-counts'] });
  };

  const { mutate: doDelete } = useMutation({
    mutationFn: deleteStory,
    onSuccess: () => { refresh(); toast('Đã xóa truyện thành công', 'success'); },
    onError: err => toast(err.message || 'Lỗi khi xóa truyện', 'error'),
  });

  const handleDelete = async (id, title) => {
    const ok = await confirm(`Bạn có chắc chắn muốn xóa truyện "${title}"?`, 'Xác nhận xóa');
    if (ok) doDelete(id);
  };

  const handleSync = async () => {
    const ok = await confirm('Đồng bộ từ nguồn sẽ thêm các truyện mới vào DB. Tiếp tục?', 'Xác nhận đồng bộ');
    if (!ok) return;
    setSyncing(true);
    try {
      const d = await syncStories();
      toast(d.message || 'Đồng bộ thành công', 'success');
      refresh();
    } catch (err) {
      toast(err.message || 'Đồng bộ thất bại', 'error');
    } finally { setSyncing(false); }
  };

  const handleSyncChapters = async (id) => {
    setSyncingChapters(p => ({ ...p, [id]: true }));
    try {
      const d = await syncChapters(id);
      toast(d.message || 'Đồng bộ chương thành công', 'success');
    } catch (err) {
      toast(err.message || 'Lỗi khi đồng bộ chương', 'error');
    } finally { setSyncingChapters(p => ({ ...p, [id]: false })); }
  };

  const handleSyncAll = async () => {
    const ok = await confirm('Đồng bộ chương toàn bộ truyện? Quá trình này có thể mất vài phút.', 'Xác nhận đồng bộ');
    if (ok) setShowSyncAll(true);
  };

  const applySearch = () => { setAppliedSearch(searchInput); setPage(1); };

  const STATUS_PILLS = [
    { value: '',          label: 'Tất cả',     badge: counts?.total,     dot: null           },
    { value: 'ongoing',   label: 'Đang ra',    badge: counts?.ongoing,   dot: 'bg-green-500' },
    { value: 'completed', label: 'Hoàn thành', badge: counts?.completed, dot: 'bg-blue-500'  },
    { value: 'stopped',   label: 'Tạm Ngưng',  badge: counts?.stopped,   dot: 'bg-yellow-400'},
  ];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Controls */}
      <div className="bg-white p-4 rounded-lg shadow mb-6 space-y-3">
        {/* Row 1: search + limit */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3 w-full md:w-2/3">
            <div className="relative flex-1" ref={searchRef}>
              <input
                type="text"
                placeholder="Tìm theo tên truyện..."
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value); setShowSuggest(true); }}
                onFocus={() => setShowSuggest(true)}
                onKeyDown={e => { if (e.key === 'Enter') { applySearch(); setShowSuggest(false); } if (e.key === 'Escape') setShowSuggest(false); }}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              {showSuggest && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-80 overflow-auto">
                  {suggestions.map(s => (
                    <div
                      key={s.id}
                      onClick={() => { setSearchInput(s.title); setAppliedSearch(s.title); setPage(1); setShowSuggest(false); }}
                      className="flex gap-3 items-center p-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <img src={s.cover_url || '/assets/images/Logo.png'} onError={e => { e.currentTarget.src='/assets/images/Logo.png'; }} className="w-10 h-12 object-cover rounded flex-shrink-0" alt="" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{s.title}</p>
                        <p className="text-xs text-gray-500 truncate">{s.author || ''}{s.status ? ` · ${s.status}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={applySearch} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 text-sm">Tìm</button>
            <button onClick={() => { setSearchInput(''); setAppliedSearch(''); setStatus(''); setPage(1); }} className="bg-gray-200 px-3 py-2 rounded hover:bg-gray-300 text-sm">Làm mới</button>
          </div>
          <div className="flex items-center gap-3 justify-end">
            <span className="text-sm text-gray-600">Hiển thị:</span>
            <SelectDropdown
              options={LIMIT_OPTIONS.map((v) => ({ value: v, label: `${v} / trang` }))}
              value={limit}
              onChange={(v) => { setLimit(v); setPage(1); }}
              size="sm"
              className="w-28"
            />
            <div className="text-xs text-gray-500">Tổng: <span className="font-medium">{total || '--'}</span></div>
            <button onClick={handleSync} disabled={syncing} className="px-3 py-2 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 text-sm disabled:opacity-60">
              <i className={`fa-solid ${syncing ? 'fa-spinner fa-spin' : 'fa-spider'} mr-2`} />{syncing ? 'Đang đồng bộ...' : 'Đồng bộ'}
            </button>
            <button onClick={handleSyncAll} className="px-3 py-2 bg-purple-100 text-purple-800 rounded hover:bg-purple-200 text-sm">
              <i className="fa-solid fa-book-open mr-2" />Sync tất cả chương
            </button>
          </div>
        </div>

        {/* Row 2: status filter */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 flex-wrap">
          <span className="text-sm text-gray-500 mr-1">Trạng thái:</span>
          {STATUS_PILLS.map(({ value, label, badge, dot }) => (
            <button
              key={value}
              onClick={() => { setStatus(value); setPage(1); }}
              className={`px-3 py-1 text-sm rounded-full transition flex items-center gap-1.5 ${status === value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot} ${status === value ? 'opacity-90' : ''}`} />}
              {label}
              {badge !== undefined && <span className="text-xs font-semibold opacity-75">{badge ?? '--'}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Grid + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <section className="lg:col-span-3">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Array(6).fill(0).map((_, i) => <div key={i} className="bg-white rounded-lg h-64 animate-pulse" />)}
            </div>
          ) : stories.length === 0 ? (
            <div className="bg-white p-6 rounded shadow text-center text-gray-500">Không tìm thấy truyện nào.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {stories.map(s => (
                <div key={s.id} className="bg-white rounded-lg overflow-hidden shadow hover:shadow-lg transition group">
                  <div className="w-full h-44 bg-gray-100 overflow-hidden">
                    <img
                      src={s.cover_url || '/assets/images/Logo.png'}
                      onError={e => { e.currentTarget.src='/assets/images/Logo.png'; }}
                      alt={s.title}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition"
                    />
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-1 mb-0.5">
                      <h3 className="text-sm font-semibold text-gray-800 truncate flex-1">{s.title}</h3>
                      {s.ai_summary
                        ? <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-600" title="Đã có AI Summary">AI</span>
                        : <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400">—</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate mb-2">{s.author || ''}</p>
                    <div className="flex items-center justify-between">
                      <StatusBadge status={s.status} />
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditId(s.id)} className="text-blue-600 text-xs hover:underline">Sửa</button>
                        <button onClick={() => handleDelete(s.id, s.title)} className="text-red-600 text-xs hover:underline">Xóa</button>
                        {s.url && <button onClick={() => window.open(s.url, '_blank')} className="text-gray-600 text-xs hover:underline">Mở</button>}
                        <button
                          disabled={!!syncingChapters[s.id]}
                          onClick={() => handleSyncChapters(s.id)}
                          className="text-indigo-600 text-xs hover:underline disabled:opacity-50"
                        >
                          {syncingChapters[s.id] ? '...' : 'Chương'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick list sidebar */}
        <aside className="hidden lg:block">
          <div className="bg-white p-4 rounded-lg shadow h-full overflow-auto">
            <h3 className="font-semibold mb-3 text-sm">Danh sách nhanh</h3>
            <p className="text-xs text-gray-500 mb-2">Click "Sửa" để edit / "Xóa" để remove</p>
            {stories.length === 0 ? (
              <p className="text-gray-400 text-sm">Không có mục nào</p>
            ) : (
              <div className="space-y-2">
                {stories.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 p-2 border rounded">
                    <div className="flex items-center gap-2 min-w-0">
                      <img src={s.cover_url || '/assets/images/Logo.png'} onError={e => { e.currentTarget.src='/assets/images/Logo.png'; }} className="w-10 h-12 object-cover rounded flex-shrink-0" alt="" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{s.title}</p>
                        <StatusBadge status={s.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => setEditId(s.id)} className="text-xs text-blue-600 hover:underline">Sửa</button>
                      <button onClick={() => handleDelete(s.id, s.title)} className="text-xs text-red-600 hover:underline">Xóa</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {editId && <EditModal storyId={editId} onClose={() => setEditId(null)} onSaved={refresh} />}
      {showSyncAll && <SyncAllModal onClose={() => setShowSyncAll(false)} />}
    </section>
  );
}
