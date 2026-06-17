import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Chart from 'chart.js/auto';
import { getAdminStats, getAdminPopularWeek } from '../../api/admin';

const STATUS_MAP = {
  ongoing:   { label: 'Đang ra',    color: 'rgba(99,102,241,0.85)' },
  completed: { label: 'Hoàn thành', color: 'rgba(34,197,94,0.85)'  },
  stopped:   { label: 'Tạm ngưng',  color: 'rgba(234,179,8,0.85)'  },
  dropped:   { label: 'Đã drop',    color: 'rgba(239,68,68,0.85)'  },
};

// ── Weekly line chart ─────────────────────────────────────────────────────────
function WeeklyChart({ weeklyViews = [] }) {
  const ref = useRef(null);
  const inst = useRef(null);

  useEffect(() => {
    if (!ref.current) return;

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const dataMap = {};
    weeklyViews.forEach(r => { dataMap[r.day] = parseInt(r.views); });
    const values = days.map(d => dataMap[d] || 0);
    const total = values.reduce((a, b) => a + b, 0);

    if (inst.current) inst.current.destroy();
    inst.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          data: values,
          borderColor: 'rgba(99,102,241,1)',
          backgroundColor: (ctx) => {
            const { chartArea, ctx: c } = ctx.chart;
            if (!chartArea) return 'transparent';
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, 'rgba(99,102,241,0.15)');
            g.addColorStop(1, 'rgba(99,102,241,0)');
            return g;
          },
          borderWidth: 2, fill: true, tension: 0.4,
          pointBackgroundColor: '#fff', pointBorderColor: 'rgba(99,102,241,1)',
          pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2937', titleColor: '#9ca3af', bodyColor: '#fff', padding: 10,
            callbacks: { label: ctx => ` ${ctx.parsed.y.toLocaleString()} lượt đọc` },
          },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, color: '#9ca3af', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.05)' }, border: { display: false } },
          x: { ticks: { color: '#9ca3af', font: { size: 11 } }, grid: { display: false }, border: { display: false } },
        },
      },
    });
    return () => { if (inst.current) { inst.current.destroy(); inst.current = null; } };
  }, [weeklyViews]);

  const total = weeklyViews.reduce((a, b) => a + parseInt(b.views || 0), 0);

  return (
    <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-gray-800">Lượt đọc 7 ngày gần nhất</h3>
          <p className="text-xs text-gray-400 mt-0.5">Dựa trên lịch sử đọc của người dùng</p>
        </div>
        <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
          {total.toLocaleString()} lượt / tuần
        </span>
      </div>
      <canvas ref={ref} height={120} />
    </div>
  );
}

// ── Doughnut chart ────────────────────────────────────────────────────────────
function StatusChart({ breakdown = [] }) {
  const ref = useRef(null);
  const inst = useRef(null);

  const colors = breakdown.map(r => (STATUS_MAP[r.status] || { color: 'rgba(156,163,175,0.8)' }).color);
  const labels = breakdown.map(r => (STATUS_MAP[r.status] || { label: r.status }).label);
  const values = breakdown.map(r => parseInt(r.count));
  const total = values.reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (!ref.current || !breakdown.length) return;
    if (inst.current) inst.current.destroy();
    inst.current = new Chart(ref.current, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 3, borderColor: '#fff', hoverOffset: 4 }] },
      options: {
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2937',
            callbacks: { label: c => ` ${c.label}: ${c.raw.toLocaleString()} (${total > 0 ? Math.round(c.raw / total * 100) : 0}%)` },
          },
        },
      },
    });
    return () => { if (inst.current) { inst.current.destroy(); inst.current = null; } };
  }, [breakdown]);

  return (
    <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
      <div className="mb-5">
        <h3 className="font-semibold text-gray-800">Trạng thái truyện</h3>
        <p className="text-xs text-gray-400 mt-0.5">Phân bố theo trạng thái hiện tại</p>
      </div>
      {breakdown.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-400">Chưa có dữ liệu</p>
        </div>
      ) : (
        <div className="flex flex-col items-center flex-1 justify-center">
          <div style={{ width: 160, height: 160, position: 'relative' }}>
            <canvas ref={ref} />
          </div>
          <div className="mt-5 w-full space-y-2.5 text-sm">
            {breakdown.map((r, i) => {
              const cfg = STATUS_MAP[r.status] || { label: r.status };
              const pct = total > 0 ? Math.round(parseInt(r.count) / total * 100) : 0;
              return (
                <div key={r.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colors[i] }} />
                    <span className="text-gray-600">{cfg.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800">{parseInt(r.count).toLocaleString()}</span>
                    <span className="text-xs text-gray-400 w-7 text-right">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminStat() {
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, isLoading: loadingStats, refetch: refetchStats, dataUpdatedAt } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getAdminStats,
  });
  const { data: popular = [], refetch: refetchPopular } = useQuery({
    queryKey: ['admin-popular'],
    queryFn: getAdminPopularWeek,
  });

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('vi-VN') : '';

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchPopular()]);
    setRefreshing(false);
  };

  const coverage = stats?.totalStories > 0
    ? Math.round(stats.storiesWithChapters / stats.totalStories * 100) : 0;

  const kpiCards = stats ? [
    { icon: 'fa-users',     bg: 'bg-indigo-50', color: 'text-indigo-600', label: 'Người dùng',           value: stats.totalUsers?.toLocaleString() },
    { icon: 'fa-book',      bg: 'bg-green-50',  color: 'text-green-600',  label: 'Truyện',               value: stats.totalStories?.toLocaleString() },
    { icon: 'fa-list-ol',   bg: 'bg-purple-50', color: 'text-purple-600', label: 'Chương đã sync',       value: stats.totalChapters?.toLocaleString(),
      sub: `${stats.storiesWithChapters}/${stats.totalStories} truyện · ${coverage}%`,
      subCls: coverage >= 80 ? 'text-green-500' : coverage >= 40 ? 'text-yellow-500' : 'text-red-400' },
    { icon: 'fa-eye',       bg: 'bg-yellow-50', color: 'text-yellow-500', label: 'Tổng lượt đọc',        value: stats.totalViews?.toLocaleString() },
    { icon: 'fa-comments',  bg: 'bg-cyan-50',   color: 'text-cyan-600',   label: 'Bình luận',            value: stats.totalComments?.toLocaleString() },
    {
      icon: 'fa-triangle-exclamation',
      bg: stats.pendingReports > 0 ? 'bg-red-50' : 'bg-gray-50',
      color: stats.pendingReports > 0 ? 'text-red-500' : 'text-gray-400',
      label: 'Báo lỗi chờ xử lý', value: stats.pendingReports?.toLocaleString(),
      sub: stats.pendingReports > 0 ? 'Cần xử lý ngay' : 'Không có',
      subCls: stats.pendingReports > 0 ? 'text-red-500' : 'text-gray-400',
      to: stats.pendingReports > 0 ? '/admin/reports' : null,
    },
    { icon: 'fa-robot', bg: 'bg-sky-50', color: 'text-sky-500', label: 'Tin nhắn Chat AI', value: (stats.totalChatMessages ?? 0).toLocaleString(), to: '/admin/chat' },
    { icon: 'fa-wand-magic-sparkles', bg: 'bg-violet-50', color: 'text-violet-500', label: 'Truyện có AI Summary',
      value: (stats.storiesWithSummary ?? 0).toLocaleString(),
      sub: stats.totalStories > 0 ? `${Math.round((stats.storiesWithSummary ?? 0) / stats.totalStories * 100)}% đã tóm tắt` : null,
      subCls: 'text-violet-400' },
  ] : [];

  const medals = ['text-yellow-400', 'text-gray-400', 'text-orange-400'];
  const maxViews = popular.length > 0 ? Math.max(...popular.map(s => parseInt(s.view_count))) : 1;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Thống kê hệ thống</h1>
          {lastUpdated && <p className="text-xs text-gray-400 mt-0.5">Cập nhật lúc {lastUpdated}</p>}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-sm font-medium transition disabled:opacity-60"
        >
          <i className={`fa-solid fa-rotate${refreshing ? ' fa-spin' : ''}`} />
          {refreshing ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      {/* KPI Cards */}
      {loadingStats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array(8).fill(0).map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {kpiCards.map((c, i) => {
            const inner = (
              <div className={`bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 transition ${c.to ? 'hover:shadow-sm cursor-pointer hover:border-indigo-300' : ''}`}>
                <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
                  <i className={`fa-solid ${c.icon} text-xl ${c.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide leading-none mb-1">{c.label}</p>
                  <p className="text-2xl font-bold text-gray-800 leading-tight">{c.value}</p>
                  {c.sub && <p className={`text-xs ${c.subCls || 'text-gray-400'} mt-0.5`}>{c.sub}</p>}
                </div>
              </div>
            );
            return c.to ? <Link key={i} to={c.to}>{inner}</Link> : <div key={i}>{inner}</div>;
          })}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        <WeeklyChart weeklyViews={stats?.weeklyViews || []} />
        <StatusChart breakdown={stats?.storyStatusBreakdown || []} />
      </div>

      {/* Top Stories */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800">Top truyện hot tuần này</h3>
            <p className="text-xs text-gray-400 mt-0.5">Lượt đọc trong 7 ngày gần nhất</p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">Top 5</span>
        </div>
        {popular.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Chưa có dữ liệu tuần này</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {popular.slice(0, 5).map((s, i) => {
              const views = parseInt(s.view_count);
              const pct = maxViews > 0 ? Math.round(views / maxViews * 100) : 0;
              return (
                <div key={s.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition">
                  <span className={`w-7 text-center font-bold text-lg ${medals[i] || 'text-gray-300'} flex-shrink-0`}>{i + 1}</span>
                  <img
                    src={s.cover_url || '/assets/images/Logo.png'}
                    onError={e => { e.currentTarget.src = '/assets/images/Logo.png'; }}
                    className="w-10 rounded-lg object-cover flex-shrink-0"
                    style={{ height: 52 }}
                    alt=""
                  />
                  <div className="flex-1 min-w-0">
                    <Link to={`/read?id=${s.id}`} className="text-sm font-semibold text-gray-800 hover:text-indigo-600 transition truncate block">
                      {s.title}
                    </Link>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{s.author || 'Không rõ tác giả'}</p>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden w-full max-w-xs">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'rgba(99,102,241,0.7)' }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-base font-bold text-gray-800">{views.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">lượt / tuần</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
