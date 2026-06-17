import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStory, getChapters, crawlChapters } from '../../api/stories';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import CommentTree from '../../components/CommentTree';

const CHAPTER_INIT = 30;

function ChapterList({ storyId }) {
  const { user } = useAuth();
  const { toast } = useAlert();
  const qc = useQueryClient();
  const [visible, setVisible] = useState(CHAPTER_INIT);

  const { data: chapters = [], isLoading } = useQuery({
    queryKey: ['chapters', storyId],
    queryFn: () => getChapters(storyId),
    enabled: !!storyId,
  });

  const { mutate: doSync, isPending: syncing } = useMutation({
    mutationFn: () => crawlChapters(storyId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['chapters', storyId] });
      setVisible(CHAPTER_INIT);
      toast(data.message || 'Sync thành công', 'success');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const shown = chapters.slice(0, visible);
  const remaining = chapters.length - visible;

  return (
    <div className="bg-white shadow-lg rounded-2xl p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <i className="fa-solid fa-book-open text-indigo-600"></i>
          Danh sách chương
          {chapters.length > 0 && (
            <span className="text-sm font-normal text-gray-400">({chapters.length} chương)</span>
          )}
        </h2>
        {user?.role === 'admin' && (
          <button
            onClick={() => doSync()}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition disabled:opacity-60"
          >
            <i className={`fa-solid fa-rotate ${syncing ? 'fa-spin' : ''}`}></i>
            {syncing ? 'Đang sync...' : 'Sync chương'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-6 text-center">
          <div className="inline-block w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : chapters.length === 0 ? (
        <p className="py-6 text-center text-gray-400 text-sm">Chưa có chương nào được đồng bộ</p>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {shown.map((ch) => (
              <Link
                key={ch.id}
                to={`/chapter/${ch.id}`}
                className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition truncate block"
              >
                Chương {ch.chapter_num}
              </Link>
            ))}
          </div>
          {remaining > 0 && (
            <div className="mt-3 text-center">
              <button
                onClick={() => setVisible((v) => Math.min(v + CHAPTER_INIT, chapters.length))}
                className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition"
              >
                Xem thêm ({remaining} chương)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Read() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const storyId = searchParams.get('id');

  // Đăng nhập rồi → chuyển sang trang đầy đủ tính năng (rating, yêu thích, chat, AI)
  useEffect(() => {
    if (!authLoading && user && storyId) {
      navigate(`/read2?id=${storyId}`, { replace: true });
    }
  }, [authLoading, user, storyId, navigate]);

  const { data: story, isLoading, isError } = useQuery({
    queryKey: ['story', storyId],
    queryFn: () => getStory(storyId),
    enabled: !!storyId,
  });

  if (!storyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-gray-500">Không có truyện được chọn.</p>
      <Link to="/" className="text-indigo-600 hover:underline">Về trang chủ</Link>
    </div>
  );

  if (isLoading) return (
    <div className="container mx-auto py-10 px-6 animate-pulse">
      <div className="bg-white rounded-2xl p-8 flex gap-8">
        <div className="w-56 h-80 bg-gray-200 rounded-xl shrink-0" />
        <div className="flex-1 space-y-4">
          <div className="h-7 bg-gray-200 rounded w-2/3" />
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-20 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  );

  if (isError || !story) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-red-500">Không tìm thấy truyện.</p>
      <Link to="/" className="text-indigo-600 hover:underline">Về trang chủ</Link>
    </div>
  );

  return (
    <main className="flex-1 container mx-auto py-10 px-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="mb-6 inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 transition"
      >
        <i className="fa-solid fa-arrow-left"></i> Quay lại
      </button>

      {/* Story detail */}
      <div className="bg-white shadow-lg rounded-2xl p-8 flex flex-col md:flex-row gap-8">
        <div className="flex-shrink-0 self-center">
          <img
            src={story.cover_url || '/assets/images/Logo.png'}
            alt="Bìa truyện"
            className="w-56 h-80 object-cover rounded-xl transition-transform hover:scale-[1.03]"
          />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800 mb-2 hover:text-indigo-700 transition">
            {story.title}
          </h1>
          <p className="text-gray-600 mb-4 italic">Tác giả: {story.author || 'Không rõ'}</p>
          <p className="text-sm text-gray-500 mb-6">
            Thể loại: {(story.genres || []).join(', ')}
          </p>
          {story.url && (
            <a
              href={story.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block bg-indigo-600 text-white font-semibold px-5 py-2 rounded-xl shadow-md hover:bg-indigo-700 transition duration-300 mb-6"
            >
              📖 Đọc truyện gốc
            </a>
          )}
          <div className="leading-relaxed text-gray-800 text-justify whitespace-pre-line">
            {story.description}
          </div>
        </div>
      </div>

      {/* Chapters */}
      <ChapterList storyId={storyId} />

      {/* Comments */}
      <CommentTree storyId={storyId} />
    </main>
  );
}
