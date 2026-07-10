import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getRating } from '../api/stories';
import { useAuth } from '../context/AuthContext';

/**
 * StoryCard — Card truyện dùng chung cho mọi lưới truyện (Home, Fav, gợi ý...):
 * ảnh bìa lazy-load, badge 🔥 HOT khi view_count ≥ 100, tên/tác giả/thể loại,
 * điểm rating lấy qua React Query (cache 5 phút theo story.id).
 *
 * Đích của link tự chọn theo trạng thái đăng nhập: user → /read2 (trang đọc
 * đầy đủ tính năng), khách → /read; truyền prop `href` để override.
 */
export default function StoryCard({ story, href }) {
  const { user } = useAuth();
  const { data: rating } = useQuery({
    queryKey: ['rating', story.id],
    queryFn: () => getRating(story.id),
    staleTime: 1000 * 60 * 5,
  });

  const isHot = story.view_count >= 100;
  const to = href ?? (user ? `/read2?id=${story.id}` : `/read?id=${story.id}`);

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative">
      {isHot && (
        <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full z-10">
          🔥 HOT
        </span>
      )}
      <Link to={to}>
        <img
          src={story.cover_url || '/assets/images/Logo.png'}
          alt={story.title}
          className="w-full h-44 object-cover"
          loading="lazy"
        />
      </Link>
      <div className="p-3">
        <Link to={to}>
          <h3 className="text-sm font-semibold text-indigo-700 mb-1 truncate hover:underline">
            {story.title}
          </h3>
        </Link>
        <p className="text-xs text-gray-600">Tác giả: {story.author || 'Không rõ'}</p>
        <p className="text-xs text-gray-500 mb-1">
          Thể loại: {(story.genres || []).join(', ')}
        </p>
        <p className="text-yellow-600 text-xs font-semibold">
          ⭐ {rating?.avg?.toFixed(1) ?? '0.0'} / 5 ({rating?.total ?? 0})
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          <i className="fa-solid fa-eye mr-1"></i>
          {story.view_count} lượt đọc
        </p>
      </div>
    </div>
  );
}
