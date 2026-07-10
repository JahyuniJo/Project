import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getGenres, getPopularWeek, getStories } from '../../api/stories';
import { useAuth } from '../../context/AuthContext';
import StoryCard from '../../components/StoryCard';
import Pagination from '../../components/Pagination';
import useOutsideClick from '../../hooks/useOutsideClick';

const LIMIT = 12;

const STATUS_OPTS = [
  { value: '', label: 'Tất cả' },
  { value: 'ongoing', label: 'Đang tiến hành' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'stopped', label: 'Tạm ngưng' },
];
const LENGTH_OPTS = [
  { value: '', label: 'Tất cả' },
  { value: 'short', label: 'Ngắn (<50 chương)' },
  { value: 'medium', label: 'Vừa (50–200 chương)' },
  { value: 'long', label: 'Dài (>200 chương)' },
];
const SORT_OPTS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'views', label: 'Lượt đọc nhiều nhất' },
  { value: 'rating', label: 'Đánh giá cao nhất' },
  { value: 'az', label: 'Tên A–Z' },
];

// ── Hero Banner ───────────────────────────────────────────────────────────────
/**
 * HeroBanner — Carousel truyện hot tuần trên đầu trang chủ: tự chuyển slide
 * mỗi 4s, có nút trái/phải + dot điều hướng (bấm tay sẽ reset đồng hồ tự chạy
 * để slide không nhảy ngay sau thao tác).
 */
function HeroBanner({ stories }) {
  const { user } = useAuth();
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);

  const goto = useCallback((i) => {
    setIdx(((i % stories.length) + stories.length) % stories.length);
  }, [stories.length]);

  useEffect(() => {
    timerRef.current = setInterval(() => setIdx((i) => (i + 1) % stories.length), 4000);
    return () => clearInterval(timerRef.current);
  }, [stories.length]);

  const resetTimer = (dir) => {
    clearInterval(timerRef.current);
    goto(idx + dir);
    timerRef.current = setInterval(() => setIdx((i) => (i + 1) % stories.length), 4000);
  };

  const story = stories[idx];
  if (!story) return null;

  return (
    <section className="container mx-auto px-6 pt-8">
      <div className="relative w-full h-[22rem] md:h-[28rem] rounded-2xl overflow-hidden shadow-2xl bg-gray-900">
        {/* Blurred slides */}
        {stories.map((s, i) => (
          <div
            key={s.id}
            className="absolute inset-0 transition-opacity duration-700 pointer-events-none"
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

        {/* Gradient overlay */}
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
            <p className="text-sm text-gray-300 mb-6 italic">Tác giả: {story.author || 'Không rõ'}</p>
            <Link
              to={user ? `/read2?id=${story.id}` : `/read?id=${story.id}`}
              className="self-start px-6 py-3 bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white font-semibold rounded-xl shadow-lg transition text-sm"
            >
              📖 Đọc ngay
            </Link>
          </div>
          <div className="hidden md:flex flex-shrink-0 items-center justify-end pr-4">
            <img
              src={story.cover_url || '/assets/images/Logo.png'}
              alt={story.title}
              className="h-64 md:h-80 w-auto max-w-[11rem] object-cover rounded-2xl shadow-2xl ring-2 ring-white/25"
            />
          </div>
        </div>

        {/* Prev / Next */}
        <button
          onClick={() => resetTimer(-1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/65 text-white w-10 h-10 rounded-full flex items-center justify-center transition z-10"
        >
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        <button
          onClick={() => resetTimer(1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/65 text-white w-10 h-10 rounded-full flex items-center justify-center transition z-10"
        >
          <i className="fa-solid fa-chevron-right"></i>
        </button>

        {/* Dots */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {stories.map((_, i) => (
            <button
              key={i}
              onClick={() => { clearInterval(timerRef.current); goto(i); }}
              className="h-2 rounded-full transition-all duration-300 cursor-pointer"
              style={{
                width: i === idx ? '24px' : '8px',
                background: i === idx ? 'white' : 'rgba(255,255,255,0.45)',
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Single-select dropdown ────────────────────────────────────────────────────
function FilterSelect({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false));
  const current = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={ref} className="relative">
      <label className="text-sm font-medium text-gray-600 mb-1 block">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm text-gray-700 focus:outline-none transition bg-white ${open ? 'border-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.12)] bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'}`}
      >
        <span>{current.label}</span>
        <i className={`fa-solid fa-chevron-down text-xs text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl z-50 shadow-xl">
          <div className="p-1.5 space-y-0.5">
            {options.map((o) => (
              <div
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition ${value === o.value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'}`}
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

// ── Genre multi-select ────────────────────────────────────────────────────────
function GenreSelect({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false));
  const { data: genres = [] } = useQuery({ queryKey: ['genres'], queryFn: getGenres, staleTime: Infinity });

  const toggle = (g) => {
    onChange(selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g]);
  };

  const label = selected.length === 0 ? 'Tất cả thể loại'
    : selected.length === 1 ? selected[0]
    : `${selected.length} thể loại đã chọn`;

  return (
    <div ref={ref} className="relative">
      <label className="text-sm font-medium text-gray-600 mb-1.5 block">Thể loại</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm text-gray-700 focus:outline-none transition bg-white ${open ? 'border-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.12)] bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'}`}
      >
        <span>{label}</span>
        <i className={`fa-solid fa-chevron-down text-xs text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl z-50 shadow-xl">
          <div className="max-h-52 overflow-y-auto p-2 space-y-0.5">
            {genres.length === 0 ? (
              <p className="text-sm text-gray-400 italic px-2 py-1">Đang tải...</p>
            ) : (
              genres.map((g) => (
                <label key={g} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-indigo-50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-indigo-500"
                    checked={selected.includes(g)}
                    onChange={() => toggle(g)}
                  />
                  <span className="text-sm text-gray-700">{g}</span>
                </label>
              ))
            )}
          </div>
          <div className="border-t border-gray-100 px-3 py-2 flex justify-between items-center bg-gray-50 rounded-b-xl">
            <span className="text-xs text-gray-500">
              {selected.length === 0 ? 'Chưa chọn' : `Đã chọn ${selected.length} thể loại`}
            </span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-xs text-red-400 hover:text-red-600 transition">
                Xóa chọn
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Xây URLSearchParams từ object filter (dùng bên ngoài component để tránh tạo lại)
/**
 * Chuyển object filter thành query params cho URL — chỉ giữ giá trị khác
 * mặc định để URL luôn gọn (trang 1, sort newest... không xuất hiện trên URL).
 */
function buildSearchParams(f) {
  const p = {};
  if (f.page > 1)         p.page   = f.page;
  if (f.genres?.length)   p.genres = f.genres.join(',');
  if (f.status)           p.status = f.status;
  if (f.sort !== 'newest') p.sort  = f.sort;
  if (f.length)           p.length = f.length;
  if (f.search)           p.q      = f.search;
  return p;
}

// ── Main Home page ────────────────────────────────────────────────────────────
/**
 * Home (/) — Trang chủ công khai: HeroBanner truyện hot tuần + lưới truyện
 * 12 cuốn/trang với bộ lọc đầy đủ (đa thể loại, trạng thái, độ dài, sort, tìm kiếm).
 *
 * Điểm thiết kế chính: TOÀN BỘ trạng thái filter nằm trên URL query params
 * (?genres=...&status=...&q=...) chứ không trong state — nhờ đó share/bookmark/F5
 * giữ nguyên bộ lọc, và Header có thể điều hướng kèm filter mà trang tự phản ứng.
 * Dữ liệu qua React Query, `placeholderData` giữ trang cũ hiển thị trong lúc
 * fetch trang mới (không nháy trắng khi chuyển trang).
 */
export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);
  const listRef = useRef(null);

  // Derive tất cả filter trực tiếp từ URL — reactive với mọi thay đổi URL (kể cả từ Header)
  const genres = useMemo(() => {
    const multi = searchParams.get('genres')?.split(',').filter(Boolean);
    if (multi?.length) return multi;
    const single = searchParams.get('genre');
    return single ? [single] : [];
  }, [searchParams]);
  const status = searchParams.get('status') || '';
  const sort   = (['newest', 'views', 'rating', 'az'].includes(searchParams.get('sort'))
    ? searchParams.get('sort') : 'newest');
  const length = searchParams.get('length') || '';
  const search = searchParams.get('q') || '';
  const page   = parseInt(searchParams.get('page')) || 1;

  const filters = { genres, status, sort, length, search, page };

  const update = (patch) =>
    setSearchParams(buildSearchParams({ ...filters, page: 1, ...patch }), { replace: true });
  const resetFilters = () => setSearchParams({}, { replace: true });

  const { data, isFetching } = useQuery({
    queryKey: ['stories', { genres, status, sort, length, search, page }],
    queryFn: () => {
      const p = { page, limit: LIMIT };
      if (search)        p.search = search;
      if (genres.length) p.genres = genres.join(',');
      if (status)        p.status = status;
      if (sort !== 'newest') p.sort = sort;
      if (length)        p.length = length;
      return getStories(p);
    },
    placeholderData: (prev) => prev,
  });

  const { data: heroStories = [] } = useQuery({
    queryKey: ['popular-week'],
    queryFn: getPopularWeek,
    staleTime: 1000 * 60 * 5,
  });

  const stories = Array.isArray(data) ? data : (data?.stories ?? []);
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.page ?? page;

  const hasFilter = filters.genres.length || filters.status || filters.sort !== 'newest' || filters.length;

  const badgeCount = filters.genres.length
    + (filters.status ? 1 : 0)
    + (filters.sort !== 'newest' ? 1 : 0)
    + (filters.length ? 1 : 0);

  const listTitle = () => {
    if (filters.search) return `🔍 Kết quả: "${filters.search}"`;
    if (filters.genres.length === 1) return `📚 Thể loại: ${filters.genres[0]}`;
    if (filters.genres.length > 1) return `📚 ${filters.genres.length} thể loại`;
    if (filters.sort === 'rating') return '⭐ Xếp hạng cao nhất';
    if (filters.sort === 'views') return '🔥 Nhiều lượt đọc nhất';
    if (filters.sort === 'az') return '🔤 Tên A–Z';
    return 'Danh sách truyện';
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col font-sans">
      {/* Hero banner */}
      {heroStories.length > 0 && <HeroBanner stories={heroStories} />}

      <main className="flex-grow container mx-auto px-6 py-8">
        {/* List header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">{listTitle()}</h2>
          {hasFilter && (
            <button
              onClick={resetFilters}
              className="text-sm px-4 py-2 rounded-lg border border-indigo-600 text-indigo-600 hover:bg-indigo-50 transition"
            >
              ← Xem tất cả truyện
            </button>
          )}
        </div>

        {/* Filter panel */}
        <div ref={listRef} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-2 text-base font-semibold text-gray-700 hover:text-indigo-600 transition select-none"
            >
              <i className="fa-solid fa-sliders text-indigo-500"></i>
              Tìm kiếm nâng cao
              {badgeCount > 0 && (
                <span className="bg-indigo-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {badgeCount}
                </span>
              )}
              <i
                className="fa-solid fa-chevron-down text-sm text-gray-400 transition-transform duration-300"
                style={{ transform: filterOpen ? 'rotate(180deg)' : '' }}
              ></i>
            </button>

            {/* Active filter chips */}
            <div className="flex flex-wrap gap-1.5">
              {filters.genres.map((g) => (
                <span key={g} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">{g}</span>
              ))}
              {filters.status && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                {STATUS_OPTS.find(o => o.value === filters.status)?.label}
              </span>}
              {filters.sort !== 'newest' && <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                {SORT_OPTS.find(o => o.value === filters.sort)?.label}
              </span>}
              {filters.length && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                {LENGTH_OPTS.find(o => o.value === filters.length)?.label}
              </span>}
            </div>
          </div>

          {filterOpen && (
            <div className="border-t border-gray-100 mt-4 pt-4 space-y-4">
              <GenreSelect selected={filters.genres} onChange={(g) => update({ genres: g })} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FilterSelect label="Trạng thái" options={STATUS_OPTS} value={filters.status} onChange={(v) => update({ status: v })} />
                <FilterSelect label="Độ dài" options={LENGTH_OPTS} value={filters.length} onChange={(v) => update({ length: v })} />
                <FilterSelect label="Sắp xếp" options={SORT_OPTS} value={filters.sort} onChange={(v) => update({ sort: v })} />
              </div>
              <div className="flex justify-end">
                <button onClick={resetFilters} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 transition">
                  <i className="fa-solid fa-rotate-left text-xs"></i> Xóa bộ lọc
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Story grid */}
        {isFetching && stories.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: LIMIT }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-md overflow-hidden animate-pulse">
                <div className="w-full h-44 bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : stories.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Không tìm thấy truyện nào</p>
        ) : (
          <div className={`grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
            {stories.map((s) => <StoryCard key={s.id} story={s} />)}
          </div>
        )}

        <Pagination
          current={currentPage}
          total={totalPages}
          onPage={(p) => {
            setSearchParams(buildSearchParams({ ...filters, page: p }), { replace: true });
            listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      </main>
    </div>
  );
}
