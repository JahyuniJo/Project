import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStory, getChapters } from '../../api/stories';
import { getRating, postRating } from '../../api/ratings';
import { getFavLists, createFavList, addToList } from '../../api/favorites';
import { recordView, summarize } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import useOutsideClick from '../../hooks/useOutsideClick';
import CommentTree from '../../components/CommentTree';
import ChatWidget from '../../components/ChatWidget';
import client from '../../api/client';

const CHAPTER_INIT = 30;

// ── Rating modal ──────────────────────────────────────────────────────────────
/**
 * RatingModal — Modal chấm sao 1-5: chọn sao rồi gửi qua postRating (đánh giá
 * lại ghi đè điểm cũ), xong invalidate cache rating để điểm trung bình cập nhật.
 */
function RatingModal({ storyId, onClose }) {
  const { toast } = useAlert();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(0);
  const ref = useRef(null);
  useOutsideClick(ref, onClose);

  const { mutate: doRate } = useMutation({
    mutationFn: () => postRating(storyId, selected),
    onSuccess: () => {
      toast('Đánh giá thành công!', 'success');
      qc.invalidateQueries({ queryKey: ['rating', storyId] });
      onClose();
    },
    onError: (err) => toast(err.message || 'Lỗi gửi đánh giá', 'error'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div ref={ref} className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-yellow-600 mb-4">Đánh giá truyện</h2>
        <div className="flex justify-center gap-2 text-3xl text-gray-300 mb-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setSelected(n)}
              className={`fa-solid fa-star transition ${n <= selected ? 'text-yellow-400' : 'hover:text-yellow-300'}`}
            />
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={() => { if (!selected) { toast('Vui lòng chọn số sao!', 'warning'); return; } doRate(); }}
            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
          >
            Gửi đánh giá
          </button>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-800">Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ── Favourite modal ───────────────────────────────────────────────────────────
/**
 * FavModal — Modal "Thêm vào yêu thích": chọn danh sách có sẵn hoặc tạo nhanh
 * danh sách mới ngay trong modal; truyện đã có sẵn trong list được báo riêng.
 */
function FavModal({ storyId, onClose }) {
  const { toast, showAlert } = useAlert();
  const [newName, setNewName] = useState('');
  const ref = useRef(null);
  useOutsideClick(ref, onClose);

  const { data: lists = [], refetch } = useQuery({
    queryKey: ['favlists'],
    queryFn: getFavLists,
  });

  const handleAdd = async (list) => {
    try {
      await addToList(list.id, storyId);
      toast(`Đã thêm vào "${list.name}"`, 'success');
      onClose();
    } catch (err) {
      const msg = err.message || 'Lỗi';
      if (msg.toLowerCase().includes('đã có') || msg.toLowerCase().includes('already')) {
        showAlert('info', 'Truyện đã có trong danh sách này!', 'Thông báo');
      } else {
        toast(msg, 'error');
      }
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { toast('Vui lòng nhập tên danh sách', 'warning'); return; }
    try {
      await createFavList(name);
      setNewName('');
      refetch();
      toast(`Đã tạo danh sách "${name}"`, 'success');
    } catch (err) { toast(err.message || 'Không thể tạo', 'error'); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div ref={ref} className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-indigo-700 mb-4">Thêm truyện vào danh sách yêu thích</h2>
        <div className="space-y-2 mb-4 text-sm max-h-56 overflow-y-auto">
          {lists.length === 0
            ? <p className="text-gray-500 italic">Bạn chưa có danh sách nào.</p>
            : lists.map((l) => (
              <button key={l.id} onClick={() => handleAdd(l)} className="w-full text-left border border-gray-200 rounded-lg px-3 py-2 hover:bg-indigo-50">
                <i className="fa-solid fa-heart text-pink-500 mr-2" />{l.name}
              </button>
            ))
          }
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Tạo danh sách mới..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
          />
          <button onClick={handleCreate} className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 text-sm">Tạo</button>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-800">Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ── Chapter list ──────────────────────────────────────────────────────────────
/**
 * ChapterList — Lưới link chương của truyện, hiện 30 chương đầu + nút
 * "Xem thêm" mở dần theo lô 30.
 */
function ChapterList({ storyId }) {
  const [visible, setVisible] = useState(CHAPTER_INIT);
  const { data: chapters = [], isLoading } = useQuery({
    queryKey: ['chapters', storyId],
    queryFn: () => getChapters(storyId),
    enabled: !!storyId,
  });

  return (
    <div className="bg-white shadow-lg rounded-2xl p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <i className="fa-solid fa-book-open text-indigo-600" />
          Danh sách chương
          {chapters.length > 0 && <span className="text-sm font-normal text-gray-400">({chapters.length} chương)</span>}
        </h2>
      </div>
      {isLoading ? (
        <div className="py-6 text-center"><div className="inline-block w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : chapters.length === 0 ? (
        <p className="py-6 text-center text-gray-400 text-sm">Chưa có chương nào được đồng bộ</p>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {chapters.slice(0, visible).map((ch) => (
              <Link
                key={ch.id}
                to={`/chapter/${ch.id}`}
                className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition truncate block"
              >
                Chương {ch.chapter_num}
              </Link>
            ))}
          </div>
          {chapters.length > visible && (
            <div className="mt-3 text-center">
              <button
                onClick={() => setVisible((v) => Math.min(v + CHAPTER_INIT, chapters.length))}
                className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition"
              >
                Xem thêm ({chapters.length - visible} chương)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── AI Summary ────────────────────────────────────────────────────────────────
/**
 * AISummary — Nút "Tóm tắt bằng AI": bấm lần đầu gọi POST /api/ai/summarize
 * (backend ưu tiên summary vision từ chương thật, cache vào ai_summary nên
 * các lần sau trả ngay); đã có text thì nút chỉ toggle ẩn/hiện, không gọi lại.
 */
function AISummary({ storyId }) {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');

  const handleLoad = async () => {
    if (text) { setShow((v) => !v); return; }
    setShow(true);
    setLoading(true);
    try {
      const data = await summarize(storyId);
      setText(data.summary || '');
    } catch {
      setText('Không thể tạo tóm tắt, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      <button
        onClick={handleLoad}
        className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition text-sm"
      >
        🤖 {show ? 'Ẩn tóm tắt AI' : 'Tóm tắt bằng AI'}
      </button>
      {show && (
        <div className="mt-3 p-4 bg-indigo-50 rounded-lg text-gray-800 text-sm leading-relaxed">
          {loading ? '⏳ Đang tạo tóm tắt bằng AI...' : text}
        </div>
      )}
    </div>
  );
}

// ── Recommend section ─────────────────────────────────────────────────────────
/**
 * RecommendSection — Cột "Gợi ý cho bạn" (sidebar): 6 truyện từ /api/recommend
 * chấm điểm theo lịch sử đọc; user mới chưa có gợi ý thì ẩn cả khối.
 */
function RecommendSection() {
  const { user } = useAuth();
  const { data = [] } = useQuery({
    queryKey: ['recommend'],
    queryFn: () => client.get('/api/recommend').then((r) => r.data),
    enabled: !!user,
  });
  if (!data.length) return null;
  return (
    <div className="mt-10 bg-white p-6 rounded-xl shadow">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">📌 Gợi ý cho bạn</h3>
      <div className="space-y-3">
        {data.map((story) => (
          <Link key={story.id} to={`/read2?id=${story.id}`} className="flex gap-3 hover:bg-indigo-50 p-2 rounded transition">
            <img
              src={story.cover_url || '/assets/images/Logo.png'}
              className="w-14 h-20 object-cover rounded"
              onError={(e) => { e.currentTarget.src = '/assets/images/Logo.png'; }}
              alt={story.title}
            />
            <div>
              <p className="font-semibold text-indigo-700">{story.title}</p>
              <p className="text-xs text-gray-500">{Array.isArray(story.genres) ? story.genres.join(', ') : story.genres}</p>
              <p className="text-xs text-gray-500 italic">Lượt xem: {story.view_count}</p>
              <p className="text-xs text-yellow-600">
                ⭐ {story.avg_rating ? Number(story.avg_rating).toFixed(1) : 'Chưa có đánh giá'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
/**
 * Read2 (/read2?id=N) — Trang chi tiết truyện BẢN ĐẦY ĐỦ cho user đã đăng nhập:
 * thông tin truyện + rating (RatingModal) + thêm yêu thích (FavModal) +
 * tóm tắt AI + danh sách chương + gợi ý cá nhân hóa + bình luận (CommentTree) +
 * ChatWidget story mode. Vào trang lần đầu tự ghi lịch sử xem (recordView,
 * chặn gọi trùng bằng viewedRef) — dữ liệu nuôi gợi ý và thống kê tuần.
 */
export default function Read2() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const storyId = searchParams.get('id');
  const [showFav, setShowFav] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const viewedRef = useRef(false);

  const { data: story, isLoading, isError } = useQuery({
    queryKey: ['story', storyId],
    queryFn: async () => {
      const data = await getStory(storyId);
      if (!viewedRef.current) {
        viewedRef.current = true;
        try { await recordView(storyId); } catch { /* ignore */ }
      }
      return data;
    },
    enabled: !!storyId,
  });

  const { data: rating } = useQuery({
    queryKey: ['rating', storyId],
    queryFn: () => getRating(storyId),
    enabled: !!storyId,
  });

  if (!storyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-gray-500">Không có truyện được chọn.</p>
      <Link to="/home" className="text-indigo-600 hover:underline">Về trang chủ</Link>
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
      <Link to="/home" className="text-indigo-600 hover:underline">Về trang chủ</Link>
    </div>
  );

  return (
    <main className="flex-1 container mx-auto py-10 px-6">
      <button onClick={() => navigate(-1)} className="mb-6 inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 transition">
        <i className="fa-solid fa-arrow-left" /> Quay lại
      </button>

      {/* Story detail */}
      <div className="bg-white shadow-lg rounded-2xl p-8 flex flex-col md:flex-row gap-8">
        <div className="flex-shrink-0 self-center">
          <img
            src={story.cover_url || '/assets/images/Logo.png'}
            alt="Bìa truyện"
            className="w-56 h-80 object-cover rounded-xl transition-transform hover:scale-[1.03]"
            onError={(e) => { e.currentTarget.src = '/assets/images/Logo.png'; }}
          />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800 mb-2 hover:text-indigo-700 transition">{story.title}</h1>
          {rating?.avg > 0 && (
            <p className="text-yellow-600 font-semibold mb-4">
              ⭐ {Number(rating.avg).toFixed(1)} / 5 ({rating.total} đánh giá)
            </p>
          )}
          <p className="text-gray-600 mb-4 italic">Tác giả: {story.author || 'Không rõ'}</p>
          <p className="text-sm text-gray-500 mb-6">Thể loại: {(story.genres || []).join(', ')}</p>

          <div className="flex flex-wrap gap-3 mb-6">
            {story.url && (
              <a href={story.url} target="_blank" rel="noreferrer"
                className="inline-block bg-indigo-600 text-white font-semibold px-5 py-2 rounded-xl shadow-md hover:bg-indigo-700 transition duration-300">
                📖 Đọc truyện gốc
              </a>
            )}
            {user && (
              <>
                <button
                  onClick={() => setShowFav(true)}
                  className="inline-flex items-center gap-2 bg-pink-500 text-white font-semibold px-5 py-2 rounded-xl shadow-md hover:bg-pink-600 transition"
                >
                  <i className="fa-solid fa-heart" /> Yêu thích
                </button>
                <button
                  onClick={() => setShowRate(true)}
                  className="inline-flex items-center gap-2 bg-yellow-500 text-white font-semibold px-5 py-2 rounded-xl shadow-md hover:bg-yellow-600 transition"
                >
                  <i className="fa-solid fa-star" /> Đánh giá
                </button>
              </>
            )}
          </div>

          <div className="leading-relaxed text-gray-800 text-justify whitespace-pre-line">{story.description}</div>
        </div>
      </div>

      {/* Chapters */}
      <ChapterList storyId={storyId} />

      {/* AI Summary */}
      <AISummary storyId={storyId} />

      {/* Recommend */}
      <RecommendSection />

      {/* Comments */}
      <CommentTree storyId={storyId} />

      {/* Chat */}
      {user && <ChatWidget storyId={Number(storyId)} storyTitle={story?.title} />}

      {/* Modals */}
      {showFav  && <FavModal  storyId={storyId} onClose={() => setShowFav(false)} />}
      {showRate && <RatingModal storyId={storyId} onClose={() => setShowRate(false)} />}
    </main>
  );
}
