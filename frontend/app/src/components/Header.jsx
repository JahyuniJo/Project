import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/AlertContext';
import NotificationBell from './NotificationBell';
import useOutsideClick from '../hooks/useOutsideClick';
import client from '../api/client';

/**
 * Header — Thanh điều hướng chính của khu người đọc: logo, menu sort/thể loại,
 * ô tìm kiếm có autocomplete (debounce 350ms, tối thiểu 2 ký tự — gọi
 * /api/stories/search rồi hiện dropdown gợi ý), chuông thông báo và menu user
 * (avatar, đăng xuất có confirm).
 *
 * Hai chế độ dùng lại: các callback onSort/onGenre/onSearch nếu ĐƯỢC truyền
 * (trang Home tự lọc tại chỗ) thì render button gọi callback; không truyền
 * thì render link điều hướng kèm query param.
 *
 * Props:
 *   mode       - 'full' (default) | 'simple'
 *   pageTitle  - hiển thị ở simple mode
 *   onSort     - (type: 'rating'|'newest') => void  — nếu truyền thì render button, không thì link
 *   onGenre    - (genre: string) => void
 *   onSearch   - (q: string) => void
 */
export default function Header({ mode = 'full', pageTitle = '', onSort, onGenre, onSearch }) {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [avatarUrl, setAvatarUrl] = useState('/assets/images/Logo.png');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [genreOpen, setGenreOpen] = useState(false);
  const [genres, setGenres] = useState([]);
  const [genresLoaded, setGenresLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);

  const dropdownRef = useRef(null);
  const genreRef = useRef(null);
  const sugRef = useRef(null);
  const searchTimer = useRef(null);

  useOutsideClick(dropdownRef, () => setDropdownOpen(false));
  useOutsideClick(genreRef, () => setGenreOpen(false));
  useOutsideClick(sugRef, () => setShowSug(false));

  const homeUrl = user ? '/home' : '/';

  // Tải avatar
  useEffect(() => {
    if (!user) return;
    client
      .get('/api/users/info')
      .then((res) => { if (res.data?.avatar_url) setAvatarUrl(res.data.avatar_url); })
      .catch(() => {});
  }, [user]);

  // Autocomplete search — debounce 350ms, min 2 ký tự
  const handleSearchInput = useCallback((q) => {
    setSearchQuery(q);  // Cập nhật giá trị ô input
    clearTimeout(searchTimer.current); // Hủy timer trước đó
    if (q.trim().length < 2) { setSuggestions([]); setShowSug(false); return; }
    searchTimer.current = setTimeout(async () => {  // Thực hiện call api sau 350ms
      try {
        const res = await client.get(`/api/stories/search?q=${encodeURIComponent(q)}`);
        setSuggestions(Array.isArray(res.data) ? res.data : []);
        setShowSug(true); // Bật hiển thị dropdown gợi ý
      } catch {}
    }, 350);
  }, []);

  const doSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    setShowSug(false);
    if (onSearch) { onSearch(searchQuery); return; }
    navigate(`/?q=${encodeURIComponent(searchQuery)}`);
  }, [searchQuery, onSearch, navigate]);

  // Tải thể loại khi mở dropdown
  const handleGenreOpen = useCallback(async () => {
    setGenreOpen((v) => !v);
    if (!genresLoaded) {
      try {
        const res = await client.get('/api/stories/genres');
        setGenres(Array.isArray(res.data) ? res.data : []);
        setGenresLoaded(true);
      } catch {}
    }
  }, [genresLoaded]);

  const handleLogout = async () => {
    const ok = await confirm('Bạn có chắc chắn muốn đăng xuất không?', 'Xác nhận đăng xuất');
    if (ok) logout();
  };

  // ── Simple mode ──────────────────────────────────────────────────────────
  if (mode === 'simple') {
    return (
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          <Link to={homeUrl} className="flex items-center gap-2 hover:opacity-80 transition">
            <img src="/assets/images/Logo.png" alt="Logo" className="w-8 h-8 rounded-full" />
            <span className="font-bold text-indigo-600">DH.story</span>
          </Link>
          {pageTitle && <h1 className="text-lg font-semibold text-gray-700">{pageTitle}</h1>}
          <div className="flex items-center gap-4">
            {user && <NotificationBell />}
            <Link
              to={homeUrl}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition"
            >
              <i className="fa-solid fa-home mr-1"></i> Trang chủ
            </Link>
          </div>
        </div>
      </header>
    );
  }

  // ── Full mode ────────────────────────────────────────────────────────────
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="container mx-auto flex flex-col lg:flex-row items-center justify-between py-4 px-6">

        {/* Logo */}
        <Link to={homeUrl} className="flex items-center gap-2">
          <img src="/assets/images/Logo.png" alt="Logo" className="w-8 h-8 rounded-full" />
          <span className="font-bold text-indigo-600">DH.story</span>
        </Link>

        <p className="italic text-gray-500 text-sm lg:text-base mt-2 lg:mt-0">
          Chúc các bạn đọc truyện vui vẻ!
        </p>

        {/* Search + Genre + Sort */}
        <div className="flex flex-col lg:flex-row items-center gap-4 mt-4 lg:mt-0">

          {/* Search */}
          <div ref={sugRef} className="relative">
            <div className="flex items-center bg-gray-100 rounded-full overflow-hidden shadow-inner">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
                placeholder="Tìm kiếm truyện..."
                className="px-4 py-2 bg-transparent focus:outline-none w-48 md:w-64 text-gray-700"
              />
              <button onClick={doSearch} className="px-3 text-indigo-600 hover:text-indigo-800" aria-label="Tìm kiếm">
                <i className="fa-solid fa-magnifying-glass"></i>
              </button>
            </div>
            {showSug && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 bg-white shadow-lg rounded-lg mt-1 max-h-64 overflow-y-auto z-50 border border-gray-200">
                {suggestions.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => { setShowSug(false); navigate(`/read?id=${item.id}`); }}
                    className="flex items-center p-2 hover:bg-indigo-50 cursor-pointer"
                  >
                    <img
                      src={item.cover_url || '/assets/images/Logo.png'}
                      className="w-10 h-14 object-cover rounded mr-3"
                      alt={item.title}
                    />
                    <div>
                      <p className="font-medium text-indigo-700">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.author || 'Không rõ tác giả'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {showSug && suggestions.length === 0 && searchQuery && (
              <div className="absolute left-0 right-0 bg-white shadow-lg rounded-lg mt-1 z-50 border border-gray-200">
                <p className="p-3 text-gray-500 text-sm">Không tìm thấy...</p>
              </div>
            )}
          </div>

          {/* Genre + Sort */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Genre dropdown */}
            <div ref={genreRef} className="relative">
              <button
                onClick={handleGenreOpen}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition text-sm font-medium"
              >
                <i className="fa-solid fa-layer-group"></i> Thể loại
                <i
                  className="fa-solid fa-chevron-down text-xs transition-transform duration-200"
                  style={{ transform: genreOpen ? 'rotate(180deg)' : '' }}
                ></i>
              </button>
              {genreOpen && (
                <div className="absolute left-0 top-full mt-2 bg-white shadow-xl rounded-2xl border border-gray-100 z-50 w-96 max-h-80 overflow-y-auto">
                  <div className="p-3 grid grid-cols-2 gap-1 text-sm">
                    {genres.length === 0 ? (
                      <p className="col-span-2 text-gray-400 italic px-2 py-1 text-xs">Đang tải...</p>
                    ) : (
                      genres.map((g) =>
                        onGenre ? (
                          <button
                            key={g}
                            onClick={() => { onGenre(g); setGenreOpen(false); }}
                            className="px-3 py-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition text-gray-700 text-sm text-left"
                          >
                            {g}
                          </button>
                        ) : (
                          <Link
                            key={g}
                            to={`/?genre=${encodeURIComponent(g)}`}
                            onClick={() => setGenreOpen(false)}
                            className="px-3 py-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition text-gray-700 text-sm"
                          >
                            {g}
                          </Link>
                        )
                      )
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sort: rating */}
            {onSort ? (
              <button
                onClick={() => onSort('rating')}
                className="flex items-center gap-1.5 px-4 py-2 bg-yellow-50 text-yellow-700 rounded-full hover:bg-yellow-100 transition text-sm font-medium whitespace-nowrap"
              >
                <i className="fa-solid fa-star"></i> Xếp hạng
              </button>
            ) : (
              <Link
                to="/?sort=rating"
                className="flex items-center gap-1.5 px-4 py-2 bg-yellow-50 text-yellow-700 rounded-full hover:bg-yellow-100 transition text-sm font-medium whitespace-nowrap"
              >
                <i className="fa-solid fa-star"></i> Xếp hạng
              </Link>
            )}

            {/* Sort: newest */}
            {onSort ? (
              <button
                onClick={() => onSort('newest')}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-700 rounded-full hover:bg-green-100 transition text-sm font-medium whitespace-nowrap"
              >
                <i className="fa-solid fa-clock-rotate-left"></i> Truyện mới
              </button>
            ) : (
              <Link
                to="/?sort=newest"
                className="flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-700 rounded-full hover:bg-green-100 transition text-sm font-medium whitespace-nowrap"
              >
                <i className="fa-solid fa-clock-rotate-left"></i> Truyện mới
              </Link>
            )}
          </div>
        </div>

        {/* User area */}
        <div className="flex items-center gap-3 mt-4 lg:mt-0">
          {user ? (
            <>
              <NotificationBell />
              <div ref={dropdownRef} className="relative">
                <button onClick={() => setDropdownOpen((v) => !v)} className="focus:outline-none">
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="w-10 h-10 rounded-full border-2 border-indigo-500 object-cover cursor-pointer hover:scale-110 transition-transform"
                  />
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-3 w-52 bg-white rounded-xl shadow-lg py-2 border border-gray-100 z-50">
                    <div className="px-4 py-2 text-sm font-medium text-indigo-700 border-b border-gray-100 truncate">
                      {user.email}
                    </div>
                    <Link
                      to="/info"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50"
                    >
                      <i className="fa-solid fa-user mr-2 text-indigo-500"></i>Thông tin cá nhân
                    </Link>
                    <Link
                      to="/fav"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50"
                    >
                      <i className="fa-solid fa-heart mr-2 text-pink-500"></i>Yêu thích
                    </Link>
                    <Link
                      to="/error-report"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50"
                    >
                      <i className="fa-solid fa-triangle-exclamation mr-2 text-yellow-500"></i>Báo lỗi
                    </Link>
                    <button
                      onClick={() => { setDropdownOpen(false); handleLogout(); }}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <i className="fa-solid fa-right-from-bracket mr-2"></i>Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
                Đăng nhập
              </Link>
              <Link to="/register" className="px-4 py-2 bg-white text-indigo-600 border border-indigo-600 rounded-lg hover:bg-indigo-50 transition">
                Đăng ký
              </Link>
            </>
          )}
        </div>

      </div>
    </header>
  );
}
