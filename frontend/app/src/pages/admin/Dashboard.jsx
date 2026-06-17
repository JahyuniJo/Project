import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPendingCount } from '../../api/admin';
import { useAlert } from '../../context/AlertContext';

const CARDS = [
  {
    to: '/admin/users', icon: 'fa-users', bg: 'bg-indigo-100', color: 'text-indigo-600',
    btnCls: 'bg-indigo-600 hover:bg-indigo-700', label: 'Quản lý người dùng',
    desc: 'Xem, sửa, hoặc xóa tài khoản người dùng.',
  },
  {
    to: '/admin/stat', icon: 'fa-chart-column', bg: 'bg-green-100', color: 'text-green-600',
    btnCls: 'bg-green-600 hover:bg-green-700', label: 'Thống kê',
    desc: 'Theo dõi số lượng người dùng, truyện và lượt đọc.',
  },
  {
    to: '/admin/stories', icon: 'fa-book', bg: 'bg-purple-100', color: 'text-purple-600',
    btnCls: 'bg-purple-600 hover:bg-purple-700', label: 'Quản lý truyện',
    desc: 'Thêm, sửa hoặc gỡ bỏ các truyện trong hệ thống.',
  },
  {
    to: '/admin/reports', icon: 'fa-triangle-exclamation', bg: 'bg-red-100', color: 'text-red-600',
    btnCls: 'bg-red-600 hover:bg-red-700', label: 'Báo lỗi',
    desc: 'Kiểm tra và xử lý các phản hồi, lỗi hệ thống.',
  },
  {
    to: '/admin/chat', icon: 'fa-robot', bg: 'bg-sky-100', color: 'text-sky-600',
    btnCls: 'bg-sky-600 hover:bg-sky-700', label: 'Giám sát Chat AI',
    desc: 'Xem log hội thoại, kiểm duyệt nội dung và thống kê sử dụng chatbot AI.',
    wide: true,
  },
];

export default function Dashboard() {
  const { toast } = useAlert();

  const { data: countData } = useQuery({
    queryKey: ['admin-pending-count'],
    queryFn: getPendingCount,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (countData?.count > 0) {
      toast(`Có ${countData.count} báo lỗi chưa được xử lý`, 'warning', 8000);
    }
  }, [countData, toast]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-8 text-center">Bảng điều khiển Admin</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        {CARDS.map(({ to, icon, bg, color, btnCls, label, desc, wide }) => (
          <div
            key={to}
            className={`bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition${wide ? ' col-span-1 sm:col-span-2' : ''}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-3 ${bg} rounded-full ${color}`}>
                <i className={`fa-solid ${icon} fa-lg`} />
              </div>
              <h2 className="text-lg font-semibold text-gray-700">{label}</h2>
            </div>
            <p className="text-gray-500 text-sm mb-4">{desc}</p>
            <Link to={to}>
              <button className={`px-4 py-2 ${btnCls} text-white rounded-lg text-sm transition`}>
                Truy cập
              </button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
