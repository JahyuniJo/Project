import { useRef, useEffect, useState } from 'react';
import SelectDropdown from '../../components/SelectDropdown';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Chart } from 'chart.js/auto';
import { useAlert } from '../../context/AlertContext';
import { getChatStats, getChatLogs, deleteChatMessage } from '../../api/admin';

// ── Activity chart (2 lines: user + AI) ──────────────────────────────────────
/**
 * ActivityChart — Biểu đồ đường Chart.js 2 series: số tin nhắn người dùng vs
 * tin AI trả lời theo ngày (7 ngày). Destroy instance cũ trước khi vẽ lại.
 */
function ActivityChart({ daily }) {
  const ref = useRef(null);
  const inst = useRef(null);

  useEffect(() => {
    if (!daily?.length || !ref.current) return;
    if (inst.current) inst.current.destroy();

    const labels = daily.map(d => {
      const date = new Date(d.day);
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    });

    inst.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Người dùng',
            data: daily.map(d => d.user_msgs),
            borderColor: 'rgba(99,102,241,0.9)',
            backgroundColor: 'rgba(99,102,241,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
          },
          {
            label: 'AI',
            data: daily.map(d => d.ai_msgs),
            borderColor: 'rgba(16,185,129,0.9)',
            backgroundColor: 'rgba(16,185,129,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });

    return () => { if (inst.current) { inst.current.destroy(); inst.current = null; } };
  }, [daily]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-base font-semibold text-gray-700 mb-4">Hoạt động 7 ngày gần đây</h3>
      <div className="h-60">
        <canvas ref={ref} />
      </div>
    </div>
  );
}

// ── Stat cards ────────────────────────────────────────────────────────────────
/** StatCard — Ô số liệu chatbot (tổng tin, hôm nay, 7 ngày, user hoạt động). */
function StatCard({ icon, bg, color, label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full ${bg} flex items-center justify-center ${color}`}>
        <i className={`fa-solid ${icon} fa-lg`} />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-800">{value ?? '—'}</p>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, from + 4);
  const pages = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <nav className="flex gap-2">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className={`px-3 py-1 rounded ${page <= 1 ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 hover:bg-gray-300'}`}>←</button>
      {pages.map(i => (
        <button key={i} onClick={() => onChange(i)} className={`px-3 py-1 rounded ${i === page ? 'bg-indigo-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>{i}</button>
      ))}
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className={`px-3 py-1 rounded ${page >= totalPages ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 hover:bg-gray-300'}`}>→</button>
    </nav>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
/**
 * AdminChat (/admin/chat) — Trang giám sát chatbot AI: các ô thống kê +
 * ActivityChart (từ /api/admin/chat/stats), và bảng log hội thoại toàn hệ thống
 * (lọc theo mode story/library, user, truyện; phân trang) kèm nút xóa tin nhắn
 * vi phạm (confirm trước).
 */
export default function AdminChat() {
  const { toast, confirm } = useAlert();
  const qc = useQueryClient();
  const [mode, setMode] = useState('all');
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery({
    queryKey: ['chat-stats'],
    queryFn: getChatStats,
    refetchInterval: 60_000,
  });

  const { data: logsData, isFetching } = useQuery({
    queryKey: ['chat-logs', { page, limit, mode }],
    queryFn: () => getChatLogs({ page, limit, mode }),
    keepPreviousData: true,
  });

  const messages = logsData?.messages || [];
  const totalPages = logsData?.totalPages || 1;
  const total = logsData?.total || 0;

  const handleDelete = async (id) => {
    const ok = await confirm('Xóa tin nhắn này? Hành động không thể hoàn tác.', 'Xác nhận xóa');
    if (!ok) return;
    try {
      await deleteChatMessage(id);
      toast('Đã xóa tin nhắn', 'success');
      qc.invalidateQueries(['chat-logs']);
    } catch (err) {
      toast(err.message || 'Xóa thất bại', 'error');
    }
  };

  const MODE_OPTIONS = [
    { value: 'all',     label: 'Tất cả' },
    { value: 'story',   label: 'Theo truyện' },
    { value: 'library', label: 'Thư viện' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <i className="fa-solid fa-robot" /> Giám sát Chat AI
      </h2>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon="fa-message" bg="bg-indigo-100" color="text-indigo-600" label="Tổng tin nhắn" value={stats?.totalMessages} />
        <StatCard icon="fa-calendar-day" bg="bg-green-100" color="text-green-600" label="Hôm nay" value={stats?.todayMessages} />
        <StatCard icon="fa-calendar-week" bg="bg-sky-100" color="text-sky-600" label="Tuần này" value={stats?.weekMessages} />
        <StatCard icon="fa-users" bg="bg-purple-100" color="text-purple-600" label="Người dùng hoạt động" value={stats?.activeUsers} />
      </div>

      {/* Activity chart */}
      <div className="mb-6">
        <ActivityChart daily={stats?.dailyActivity} />
      </div>

      {/* Log table controls */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-600">Chế độ:</span>
          {MODE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setMode(value); setPage(1); }}
              className={`px-3 py-1 rounded-full text-sm font-medium transition ${mode === value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-500">Hiển thị:</span>
            <SelectDropdown
              options={[{ value: 20, label: '20' }, { value: 50, label: '50' }]}
              value={limit}
              onChange={(v) => { setLimit(v); setPage(1); }}
              size="sm"
              className="w-20"
            />
          </div>
          {isFetching && <i className="fa-solid fa-spinner fa-spin text-indigo-400" />}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-semibold">
              <tr>
                <th className="p-4">ID</th>
                <th className="p-4">Người dùng</th>
                <th className="p-4">Vai trò</th>
                <th className="p-4">Nội dung</th>
                <th className="p-4">Truyện</th>
                <th className="p-4">Thời gian</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="text-gray-700 divide-y divide-gray-100">
              {messages.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">Không có tin nhắn nào.</td></tr>
              ) : messages.map(msg => (
                <tr key={msg.id} className="hover:bg-gray-50">
                  <td className="p-4 text-gray-400 text-xs">#{msg.id}</td>
                  <td className="p-4 max-w-[120px]">
                    <div className="font-medium truncate">{msg.username || msg.email || `#${msg.user_id}`}</div>
                    {msg.email && <div className="text-xs text-gray-400 truncate">{msg.email}</div>}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${msg.role === 'user' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {msg.role === 'user' ? 'User' : 'AI'}
                    </span>
                  </td>
                  <td className="p-4 max-w-[260px]">
                    <p className="line-clamp-2">{msg.content}</p>
                  </td>
                  <td className="p-4 text-gray-500 text-xs">{msg.story_title || (msg.story_id ? `#${msg.story_id}` : 'Chung')}</td>
                  <td className="p-4 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(msg.created_at).toLocaleString('vi-VN')}
                  </td>
                  <td className="p-4">
                    <button onClick={() => handleDelete(msg.id)} className="text-red-400 hover:text-red-600 transition p-1" title="Xóa">
                      <i className="fa-solid fa-trash-can" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <span className="text-sm text-gray-500">{total > 0 ? `${total} tin nhắn · trang ${page}/${totalPages}` : ''}</span>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>
    </div>
  );
}
