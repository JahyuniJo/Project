import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStories, getGenres, getPopularWeek, getRating } from '../../api/stories';
import { getFavLists, createFavList, addToList } from '../../api/favorites';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import client from '../../api/client';
import useOutsideClick from '../../hooks/useOutsideClick';
import Pagination from '../../components/Pagination';

const LIMIT = 12;
const INIT_VISIBLE = 30;

// ── Hero Banner ───────────────────────────────────────────────────────────────
function HeroBanner({ stories }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setIdx((i) => (i + 1) % stories.length), 4000);
  }, [stories.length]);

  useEffect(() => {
    if (!stories.length) return;
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [stories.length, startTimer]);

  if (!stories.length) return null;
  const story = stories[idx];

  const goTo = (next) => {
    setIdx((next + stories.length) % stories.length);
    startTimer();
  };

  return (
    <section className="container mx-auto px-6 pt-8">
      <div className="relative w-full h-80 md:h-[28rem] rounded-2xl overflow-hidden shadow-2xl bg-gray-900">
        {/* Blurred backgrounds */}
        {stories.map((s, i) => (
          <div
            key={s.id}
            className="absolute inset-0 transition-opacity duration-700"
            style={{
              opacity: i === idx ? 1 : 0,
              backgroundImage: `url('${s.cover_url || '/assets/images/Logo.png'}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(8px) brightness(0.35)',
              transform: 'scale(1.07)',
            }}
          />
        ))}

        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/10 pointer-events-none" />

        {/* Content */}
        <div className="absolute inset-0 flex items-center px-8 md:px-14 gap-8 text-white">
          <div className="flex-1 flex flex-col justify-center min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-3">
              🔥 {story.view_count} lượt đọc tuần này
            </p>
            <h2 className="text-2xl md:text-4xl font-extrabold mb-3 drop-shadow leading-tight line-clamp-2">
              {story.title}
            </h2>
            <p className="text-sm text-gray-300 mb-6 italic">{story.author || ''}</p>
            <button
              onClick={() => navigate(`/read2?id=${story.id}`)}
              className="self-start px-6 py-3 bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white font-semibold rounded-xl shadow-lg transition text-sm"
            >
              📖 Đọc ngay
            </button>
          </div>
          <div className="hidden md:flex flex-shrink-0 items-center justify-end pr-4">
            <img
              src={story.cover_url || '/assets/images/Logo.png'}
              alt={story.title}
              className="h-64 md:h-80 w-auto max-w-[11rem] object-cover rounded-2xl shadow-2xl ring-2 ring-white/25"
            />
          </div>
        </div>

        {/* Prev/Next */}
        <button
          onClick={() => goTo(idx - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/65 text-white w-10 h-10 rounded-full flex items-center justify-center transition z-10"
        >
          <i className="fa-solid fa-chevron-left" />
        </button>
        <button
          onClick={() => goTo(idx + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/65 text-white w-10 h-10 rounded-full flex items-center justify-center transition z-10"
        >
          <i className="fa-solid fa-chevron-right" />
        </button>

        {/* Dots */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {stories.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: i === idx ? 24 : 8,
                background: i === idx ? 'white' : 'rgba(255,255,255,0.45)',
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Mini story card ───────────────────────────────────────────────────────────
function MiniCard({ story, color = 'indigo', badge }) {
  return (
    <Link
      to={`/read2?id=${story.id}`}
      className="story-card bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 block"
    >
      <img
        src={story.cover_url || '/assets/images/Logo.png'}
        alt={story.title}
        className="w-full h-48 object-cover hover:scale-105 transition-transform duration-500"
        onError={(e) => { e.currentTarget.src = '/assets/images/Logo.png'; }}
      />
      <div className="p-3">
        <h3 className={`font-semibold text-${color}-700 truncate`}>{story.title}</h3>
        <p className="text-xs text-gray-500 mt-1 truncate">
          {badge || (Array.isArray(story.genres) ? story.genres.join(', ') : story.genres || 'Chưa rõ')}
        </p>
        <div className="flex justify-between items-center mt-2 text-xs">
          <span className="text-gray-500"><i className="fa-solid fa-eye" /> {story.view_count}</span>
          {badge
            ? <span className={`text-${color}-600 font-semibold`}>🔥 HOT</span>
            : <span className="text-yellow-600 font-semibold">⭐ {story.avg_rating ? Number(story.avg_rating).toFixed(1) : '0.0'}</span>
          }
        </div>
      </div>
    </Link>
  );
}

// ── Favourite modal ───────────────────────────────────────────────────────────
function FavModal({ storyId, onClose }) {
  const { toast, showAlert } = useAlert();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const ref = useRef(null);

  const { data: lists = [], refetch } = useQuery({
    queryKey: ['favlists'],
    queryFn: getFavLists,
    enabled: !!storyId,
  });

  useOutsideClick(ref, onClose);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { toast('Vui lòng nhập tên danh sách', 'warning'); return; }
    setCreating(true);
    try {
      await createFavList(name);
      setNewName('');
      refetch();
      toast(`Đã tạo danh sách "${name}"`, 'success');
    } catch (err) {
      toast(err.message || 'Không thể tạo danh sách', 'error');
    } finally { setCreating(false); }
  };

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div ref={ref} className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md animate-fade-in">
        <h2 className="text-lg font-semibold text-indigo-700 mb-4">Thêm truyện vào danh sách yêu thích</h2>
        <div className="space-y-2 mb-4 text-sm max-h-56 overflow-y-auto">
          {lists.length === 0 ? (
            <p className="text-gray-500 italic">
              Bạn chưa có danh sách. Hãy tạo ở{' '}
              <Link to="/fav" className="text-indigo-600 hover:underline">trang Yêu thích</Link>.
            </p>
          ) : lists.map((l) => (
            <button
              key={l.id}
              onClick={() => handleAdd(l)}
              className="w-full text-left px-4 py-2 border border-gray-200 rounded hover:bg-indigo-50"
            >
              <i className="fa-solid fa-heart mr-2 text-pink-500" />{l.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Tạo danh sách mới..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 text-sm disabled:opacity-60"
          >
            Tạo
          </button>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-800">Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ── Genre dropdown ────────────────────────────────────────────────────────────
function GenreDropdown({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false));

  const { data: genres = [] } = useQuery({ queryKey: ['genres'], queryFn: getGenres });

  const label = selected.length === 0
    ? 'Tất cả thể loại'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} thể loại đã chọn`;

  const toggle = (g) => {
    if (selected.includes(g)) onChange(selected.filter((x) => x !== g));
    else onChange([...selected, g]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm text-gray-700 bg-white transition ${open ? 'border-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,.12)]' : 'border-gray-200 hover:border-indigo-300'}`}
      >
        <span>{label}</span>
        <i className={`fa-solid fa-chevron-down text-xs text-gray-400 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-indigo-100 rounded-xl z-50 shadow-xl">
          <div className="max-h-52 overflow-y-auto p-2 space-y-0.5">
            {genres.map((g) => (
              <label
                key={g}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-indigo-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(g)}
                  onChange={() => toggle(g)}
                  className="w-4 h-4 accent-indigo-500"
                />
                <span className="text-sm text-gray-700">{g}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-2 flex justify-between bg-gray-50 rounded-b-xl">
              <span className="text-xs text-gray-500">Đã chọn {selected.length}</span>
              <button onClick={() => onChange([])} className="text-xs text-red-400 hover:text-red-600">Xóa chọn</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Single-select dropdown ────────────────────────────────────────────────────
function SelectDropdown({ value, options, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false));
  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm text-gray-700 bg-white transition ${open ? 'border-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,.12)]' : 'border-gray-200 hover:border-indigo-300'}`}
      >
        <span>{current ? current.label : placeholder}</span>
        <i className={`fa-solid fa-chevron-down text-xs text-gray-400 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl z-50 shadow-xl">
          <div className="p-1.5 space-y-0.5">
            {options.map((o) => (
              <div
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition ${o.value === value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-indigo-50'}`}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'ongoing', label: 'Đang tiến hành' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'stopped', label: 'Tạm ngưng' },
];
const LENGTH_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'short', label: 'Ngắn (<50 chương)' },
  { value: 'medium', label: 'Vừa (50–200 chương)' },
  { value: 'long', label: 'Dài (>200 chương)' },
];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'views', label: 'Lượt đọc nhiều nhất' },
  { value: 'rating', label: 'Đánh giá cao nhất' },
  { value: 'az', label: 'Tên A–Z' },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Home2() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filterOpen, setFilterOpen] = useState(false);
  const [genres, setGenres] = useState(() => (searchParams.get('genres') || '').split(',').filter(Boolean));
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');
  const [length, setLength] = useState(searchParams.get('length') || '');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [favStoryId, setFavStoryId] = useState(null);
  const listRef = useRef(null);

  const hasFilter = genres.length > 0 || !!status || sort !== 'newest' || !!length;
  const showRecommend = !hasFilter;

  const storyParams = {
    page, limit: LIMIT,
    ...(genres.length && { genres: genres.join(',') }),
    ...(status && { status }),
    ...(sort !== 'newest' && { sort }),
    ...(length && { length }),
  };

  const { data: storiesData, isLoading: loadingStories } = useQuery({
    queryKey: ['stories', storyParams],
    queryFn: () => getStories(storyParams),
  });

  const { data: popular = [] } = useQuery({
    queryKey: ['popular-week'],
    queryFn: getPopularWeek,
  });

  const { data: recommend = [] } = useQuery({
    queryKey: ['recommend'],
    queryFn: () => client.get('/api/recommend').then((r) => r.data),
    enabled: !!user,
  });

  // Sync filters → URL
  useEffect(() => {
    const p = {};
    if (page > 1) p.page = page;
    if (genres.length) p.genres = genres.join(',');
    if (status) p.status = status;
    if (sort !== 'newest') p.sort = sort;
    if (length) p.length = length;
    setSearchParams(p, { replace: true });
  }, [page, genres, status, sort, length, setSearchParams]);

  const resetFilters = () => {
    setGenres([]); setStatus(''); setSort('newest'); setLength(''); setPage(1);
  };

  const stories = storiesData?.stories ?? [];
  const totalPages = storiesData?.totalPages ?? 1;

  const badgeCount = genres.length + (status ? 1 : 0) + (sort !== 'newest' ? 1 : 0) + (length ? 1 : 0);

  return (
    <div className="flex flex-col">
      {/* Hero banner */}
      {showRecommend && popular.length > 0 && <HeroBanner stories={popular} />}

      <main className="flex-grow container mx-auto px-6 py-10">

        {/* Recommend + Popular */}
        {showRecommend && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10">
              {recommend.length > 0 && (
                <section className="lg:col-span-3">
                  <h2 className="text-lg font-semibold text-gray-800 mb-1">✨ Gợi ý dành riêng cho bạn</h2>
                  <p className="text-sm text-gray-500 mb-4">Dựa trên lịch sử đọc và sở thích của bạn</p>
                  <div className="grid grid-cols-2 gap-4">
                    {recommend.map((s) => <MiniCard key={s.id} story={s} />)}
                  </div>
                </section>
              )}
              {popular.length > 0 && (
                <section className={recommend.length > 0 ? 'lg:col-span-2' : 'lg:col-span-5'}>
                  <h2 className="text-lg font-semibold text-gray-800 mb-1">🔥 Truyện được đọc nhiều nhất tuần</h2>
                  <p className="text-sm text-gray-500 mb-4">Tổng hợp từ lượt đọc trong 7 ngày gần nhất</p>
                  <div className="grid grid-cols-2 gap-4">
                    {popular.map((s) => <MiniCard key={s.id} story={s} color="red" badge />)}
                  </div>
                </section>
              )}
            </div>
            <div className="my-14">
              <div className="h-2 bg-gradient-to-r from-transparent via-gray-300 to-transparent rounded-full" />
            </div>
          </>
        )}

        {/* Filter panel */}
        <div ref={listRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-2 text-base font-semibold text-gray-700 hover:text-indigo-600 transition"
            >
              <i className="fa-solid fa-sliders text-indigo-500" />
              Tìm kiếm nâng cao
              {badgeCount > 0 && (
                <span className="bg-indigo-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {badgeCount}
                </span>
              )}
              <i className={`fa-solid fa-chevron-down text-sm text-gray-400 transition-transform duration-300 ${filterOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              {genres.length > 0 && genres.map((g) => (
                <span key={g} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">{g}</span>
              ))}
              {status && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">{{ ongoing: 'Đang tiến hành', completed: 'Hoàn thành', stopped: 'Tạm ngưng' }[status]}</span>}
              {sort !== 'newest' && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">{{ views: 'Lượt đọc', rating: 'Đánh giá', az: 'A–Z' }[sort]}</span>}
              {length && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{{ short: 'Ngắn', medium: 'Vừa', long: 'Dài' }[length]}</span>}
              {badgeCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="text-sm px-3 py-1.5 rounded-lg border border-indigo-400 text-indigo-600 hover:bg-indigo-50 transition"
                >
                  ← Tất cả truyện
                </button>
              )}
            </div>
          </div>

          {filterOpen && (
            <div className="border-t border-gray-100 mt-4 pt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Thể loại</label>
                <GenreDropdown selected={genres} onChange={(v) => { setGenres(v); setPage(1); }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1 block">Trạng thái</label>
                  <SelectDropdown value={status} options={STATUS_OPTIONS} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="Tất cả" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1 block">Độ dài</label>
                  <SelectDropdown value={length} options={LENGTH_OPTIONS} onChange={(v) => { setLength(v); setPage(1); }} placeholder="Tất cả" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1 block">Sắp xếp</label>
                  <SelectDropdown value={sort} options={SORT_OPTIONS} onChange={(v) => { setSort(v); setPage(1); }} placeholder="Mới nhất" />
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={resetFilters} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 transition">
                  <i className="fa-solid fa-rotate-left text-xs" /> Xóa bộ lọc
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Story grid */}
        {loadingStories ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: LIMIT }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-md overflow-hidden animate-pulse">
                <div className="w-full h-44 bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-4 bg-gray-200 rounded w-1/3 mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <StoryGrid stories={stories} onFav={setFavStoryId} />
        )}

        {totalPages > 1 && (
          <Pagination current={page} total={totalPages} onPage={(p) => { setPage(p); listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />
        )}
      </main>

      {favStoryId && (
        <FavModal storyId={favStoryId} onClose={() => setFavStoryId(null)} />
      )}
    </div>
  );
}

// ── Story Grid with per-card rating ──────────────────────────────────────────
function StoryCard({ story, onFav }) {
  const { data: rating } = useQuery({
    queryKey: ['rating', story.id],
    queryFn: () => getRating(story.id),
    staleTime: 60_000,
  });
  const isHot = story.view_count >= 100;
  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative">
      {isHot && (
        <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full z-10">
          🔥 HOT
        </span>
      )}
      <Link to={`/read2?id=${story.id}`}>
        <img
          src={story.cover_url || '/assets/images/Logo.png'}
          alt={story.title}
          className="w-full h-44 object-cover hover:scale-105 transition-transform duration-500"
          onError={(e) => { e.currentTarget.src = '/assets/images/Logo.png'; }}
        />
      </Link>
      <div className="p-3">
        <Link to={`/read2?id=${story.id}`}>
          <h3 className="text-sm font-semibold text-indigo-700 mb-1 truncate hover:underline">{story.title}</h3>
        </Link>
        <p className="text-xs text-gray-600 mb-1">Tác giả: {story.author || 'Không rõ'}</p>
        <p className="text-xs text-gray-500 mb-1">
          Thể loại: {(story.genres || []).join(', ') || 'Chưa rõ'}
        </p>
        <div className="flex items-center justify-between mt-1">
          <button
            onClick={() => onFav(story.id)}
            className="px-2 py-0.5 text-xs bg-pink-100 text-pink-700 rounded-full hover:bg-pink-200"
          >
            <i className="fa-solid fa-heart mr-1" />Yêu thích
          </button>
          <p className="text-yellow-600 text-xs font-semibold">
            ⭐ {rating?.avg ? Number(rating.avg).toFixed(1) : '0.0'}
          </p>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          <i className="fa-solid fa-eye" /> {story.view_count} lượt đọc
        </p>
      </div>
    </div>
  );
}

function StoryGrid({ stories, onFav }) {
  if (!stories.length) {
    return (
      <div className="flex flex-col items-center py-16 text-gray-400">
        <i className="fa-solid fa-book-open text-4xl mb-3" />
        <p>Không tìm thấy truyện phù hợp</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {stories.map((s) => <StoryCard key={s.id} story={s} onFav={onFav} />)}
    </div>
  );
}
