/**
 * Shared header component — renders into <div id="app-header"></div>
 *
 * Config (set BEFORE loading this script):
 *   window.HEADER_CONFIG = {
 *     mode: 'full' | 'simple',  // default: 'full'
 *     pageTitle: 'string',       // simple mode only
 *   };
 *   window.HEADER_CALLBACKS = {
 *     onSort:   (type) => { ... },   // 'rating'|'newest' — omit to use <a> links
 *     onGenre:  (genre) => { ... },  // omit to use <a> links
 *     onSearch: (q) => { ... },      // omit to navigate to index page
 *   };
 *
 * Exposes after init:
 *   window.HEADER_STATE = { loggedIn, user, indexPage, storyPage }
 */
(async function initHeader() {
  const cfg  = window.HEADER_CONFIG    || {};
  const cbs  = window.HEADER_CALLBACKS || {};
  const mode = cfg.mode || 'full';
  const root = document.getElementById('app-header');
  if (!root) return;

  // ── Auth ─────────────────────────────────────────────────────────────────
  let user = null;
  try {
    const r = await fetch('/api/import/me', { credentials: 'include' });
    if (r.ok) user = await r.json();
  } catch {}

  const loggedIn  = !!user;
  const indexPage = loggedIn ? '/index2.html' : '/index.html';
  const storyPage = loggedIn ? '/read2.html'  : '/read.html';

  window.HEADER_STATE = { loggedIn, user, indexPage, storyPage };

  // ── Render ────────────────────────────────────────────────────────────────
  root.innerHTML = mode === 'simple'
    ? buildSimple(cfg.pageTitle || '', loggedIn)
    : buildFull(loggedIn, user, indexPage, cbs);

  injectNotifyOverlays();
  if (mode === 'full' && loggedIn) injectLogoutModal();

  // ── Wire events ───────────────────────────────────────────────────────────
  if (mode === 'full') {
    wireSearch(indexPage, storyPage, cbs.onSearch);
    wireGenre(indexPage, cbs.onGenre);
    wireSort(cbs.onSort);
    if (loggedIn) {
      wireAvatarDropdown();
      wireLogout();
      loadAvatar();
    }
  }

  if (loggedIn) initNotifications(user.email);

  // ── HTML builders ─────────────────────────────────────────────────────────

  function buildFull(loggedIn, user, indexPage, cbs) {
    const hasSort = typeof cbs.onSort === 'function';

    const sortRating = hasSort
      ? `<button id="btnRating" class="flex items-center gap-1.5 px-4 py-2 bg-yellow-50 text-yellow-700 rounded-full hover:bg-yellow-100 transition text-sm font-medium whitespace-nowrap">
           <i class="fa-solid fa-star"></i> Xếp hạng
         </button>`
      : `<a id="btnRating" href="${indexPage}?sort=rating" class="flex items-center gap-1.5 px-4 py-2 bg-yellow-50 text-yellow-700 rounded-full hover:bg-yellow-100 transition text-sm font-medium whitespace-nowrap">
           <i class="fa-solid fa-star"></i> Xếp hạng
         </a>`;

    const sortNewest = hasSort
      ? `<button id="btnNewest" class="flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-700 rounded-full hover:bg-green-100 transition text-sm font-medium whitespace-nowrap">
           <i class="fa-solid fa-clock-rotate-left"></i> Truyện mới
         </button>`
      : `<a id="btnNewest" href="${indexPage}?sort=newest" class="flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-700 rounded-full hover:bg-green-100 transition text-sm font-medium whitespace-nowrap">
           <i class="fa-solid fa-clock-rotate-left"></i> Truyện mới
         </a>`;

    const userArea = loggedIn
      ? `<div id="notifyBell" class="relative cursor-pointer hover:text-indigo-600 transition">
           <i class="fa-solid fa-bell text-2xl"></i>
           <span id="notifyCount" class="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center hidden">0</span>
         </div>
         <div class="relative">
           <button id="avatarButton" class="focus:outline-none">
             <img id="avatarImage" src="/assets/images/Logo.png" alt="Avatar"
               class="w-10 h-10 rounded-full border-2 border-indigo-500 object-cover cursor-pointer hover:scale-110 transition-transform">
           </button>
           <div id="dropdownMenu" class="hidden absolute right-0 mt-3 w-52 bg-white rounded-xl shadow-lg py-2 border border-gray-100 z-50">
             <div class="px-4 py-2 text-sm font-medium text-indigo-700 border-b border-gray-100 truncate">${user.email}</div>
             <a href="/info.html" class="block px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50">
               <i class="fa-solid fa-user mr-2 text-indigo-500"></i>Thông tin cá nhân
             </a>
             <a href="/fav.html" class="block px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50">
               <i class="fa-solid fa-heart mr-2 text-pink-500"></i>Yêu thích
             </a>
             <a href="/error-report.html" class="block px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50">
               <i class="fa-solid fa-triangle-exclamation mr-2 text-yellow-500"></i>Báo lỗi
             </a>
             <div id="openLogoutModal" class="block px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer">
               <i class="fa-solid fa-right-from-bracket mr-2"></i>Đăng xuất
             </div>
           </div>
         </div>`
      : `<a href="/login.html" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">Đăng nhập</a>
         <a href="/register.html" class="px-4 py-2 bg-white text-indigo-600 border border-indigo-600 rounded-lg hover:bg-indigo-50 transition">Đăng ký</a>`;

    return `
      <header class="bg-white border-b border-gray-200">
        <div class="container mx-auto flex flex-col md:flex-row items-center justify-between py-4 px-6">
          <a href="${indexPage}" class="flex items-center gap-2">
            <img src="/assets/images/Logo.png" alt="Logo" class="w-8 h-8 rounded-full">
            <span class="font-bold text-indigo-600">DH.story</span>
          </a>
          <p class="italic text-gray-500 text-sm md:text-base mt-2 md:mt-0">Chúc các bạn đọc truyện vui vẻ!</p>
          <div class="flex flex-col md:flex-row items-center gap-4 mt-4 md:mt-0">
            <div class="relative">
              <div class="flex items-center bg-gray-100 rounded-full overflow-hidden shadow-inner">
                <input id="searchBox" type="text" placeholder="Tìm kiếm truyện..."
                  class="px-4 py-2 bg-transparent focus:outline-none w-48 md:w-64 text-gray-700">
                <button id="searchBtn" class="px-3 text-indigo-600 hover:text-indigo-800" aria-label="Tìm kiếm">
                  <i class="fa-solid fa-magnifying-glass"></i>
                </button>
              </div>
              <div id="searchSuggestions"
                class="absolute left-0 right-0 bg-white shadow-lg rounded-lg mt-1 hidden max-h-64 overflow-y-auto z-50 border border-gray-200">
              </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <div class="relative" id="genreDropdownWrapper">
                <button id="genreBtn" class="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition text-sm font-medium">
                  <i class="fa-solid fa-layer-group"></i> Thể loại
                  <i id="genreChevron" class="fa-solid fa-chevron-down text-xs" style="transition:transform 0.2s"></i>
                </button>
                <div id="genreDropdown"
                  class="hidden absolute left-0 top-full mt-2 bg-white shadow-xl rounded-2xl border border-gray-100 z-50 w-96 max-h-80 overflow-y-auto">
                  <div id="genreList" class="p-3 grid grid-cols-2 gap-1 text-sm">
                    <p class="col-span-2 text-gray-400 italic px-2 py-1 text-xs">Đang tải...</p>
                  </div>
                </div>
              </div>
              ${sortRating}
              ${sortNewest}
            </div>
          </div>
          <div class="flex items-center gap-3 mt-4 md:mt-0">
            ${userArea}
          </div>
        </div>
      </header>`;
  }

  function buildSimple(pageTitle, loggedIn) {
    return `
      <header class="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div class="container mx-auto flex items-center justify-between py-4 px-6">
          <a href="/index2.html" class="flex items-center gap-2 hover:opacity-80 transition">
            <img src="/assets/images/Logo.png" alt="Logo" class="w-8 h-8 rounded-full">
            <span class="font-bold text-indigo-600">DH.story</span>
          </a>
          ${pageTitle ? `<h1 class="text-lg font-semibold text-gray-700">${pageTitle}</h1>` : ''}
          <div class="flex items-center gap-4">
            ${loggedIn
              ? `<div id="notifyBell" class="relative cursor-pointer hover:text-indigo-600 transition">
                   <i class="fa-solid fa-bell text-2xl"></i>
                   <span id="notifyCount" class="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center hidden">0</span>
                 </div>`
              : ''}
            <a href="/index2.html" class="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition">
              <i class="fa-solid fa-home mr-1"></i> Trang chủ
            </a>
          </div>
        </div>
      </header>`;
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  function wireSearch(indexPage, storyPage, onSearch) {
    const box = document.getElementById('searchBox');
    const btn = document.getElementById('searchBtn');
    const sug = document.getElementById('searchSuggestions');
    if (!box) return;
    let timer;

    async function suggest(q) {
      if (!q.trim()) { sug.classList.add('hidden'); return; }
      try {
        const r    = await fetch(`/api/stories/search?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (!data.length) {
          sug.innerHTML = `<p class="p-3 text-gray-500 text-sm">Không tìm thấy...</p>`;
          sug.classList.remove('hidden');
          return;
        }
        sug.innerHTML = data.map(item => `
          <div onclick="window.location.href='${storyPage}?id=${item.id}'"
               class="flex items-center p-2 hover:bg-indigo-50 cursor-pointer">
            <img src="${item.cover_url || '/assets/images/Logo.png'}" class="w-10 h-14 object-cover rounded mr-3">
            <div>
              <p class="font-medium text-indigo-700">${item.title}</p>
              <p class="text-xs text-gray-500">${item.author || 'Không rõ tác giả'}</p>
            </div>
          </div>`).join('');
        sug.classList.remove('hidden');
      } catch {}
    }

    function doSearch() {
      const q = box.value.trim();
      if (!q) return;
      sug.classList.add('hidden');
      if (typeof onSearch === 'function') { onSearch(q); return; }
      window.location.href = `${indexPage}?q=${encodeURIComponent(q)}`;
    }

    box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => suggest(box.value), 200); });
    box.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    btn.addEventListener('click', doSearch);
    document.addEventListener('click', e => {
      if (!box.contains(e.target) && !sug.contains(e.target)) sug.classList.add('hidden');
    });
  }

  function wireGenre(indexPage, onGenre) {
    const btn     = document.getElementById('genreBtn');
    const dd      = document.getElementById('genreDropdown');
    const chevron = document.getElementById('genreChevron');
    const wrapper = document.getElementById('genreDropdownWrapper');
    if (!btn) return;
    let loaded = false;

    async function loadGenres() {
      try {
        const r      = await fetch('/api/stories/genres');
        const genres = await r.json();
        const list   = document.getElementById('genreList');
        if (!genres.length) {
          list.innerHTML = `<p class="col-span-2 text-gray-400 italic text-xs">Chưa có thể loại</p>`;
          return;
        }
        list.innerHTML = genres.map(g =>
          typeof onGenre === 'function'
            ? `<button onclick="(window.HEADER_CALLBACKS.onGenre)('${g.replace(/'/g, "\\'")}')"
                       class="px-3 py-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition text-gray-700 text-sm block w-full text-left">${g}</button>`
            : `<a href="${indexPage}?genre=${encodeURIComponent(g)}"
                  class="px-3 py-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition text-gray-700 text-sm block">${g}</a>`
        ).join('');
      } catch {}
    }

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const opening = dd.classList.contains('hidden');
      dd.classList.toggle('hidden');
      chevron.style.transform = opening ? 'rotate(180deg)' : '';
      if (opening && !loaded) { loadGenres(); loaded = true; }
    });
    document.addEventListener('click', e => {
      if (!wrapper.contains(e.target)) { dd.classList.add('hidden'); chevron.style.transform = ''; }
    });
  }

  function wireSort(onSort) {
    if (typeof onSort !== 'function') return;
    document.getElementById('btnRating')?.addEventListener('click', () => onSort('rating'));
    document.getElementById('btnNewest')?.addEventListener('click', () => onSort('newest'));
  }

  function wireAvatarDropdown() {
    const avatarBtn = document.getElementById('avatarButton');
    const dropdown  = document.getElementById('dropdownMenu');
    if (!avatarBtn) return;
    avatarBtn.addEventListener('click', () => dropdown.classList.toggle('hidden'));
    window.addEventListener('click', e => {
      if (!avatarBtn.contains(e.target) && !dropdown.contains(e.target))
        dropdown.classList.add('hidden');
    });
  }

  function wireLogout() {
    document.getElementById('openLogoutModal')?.addEventListener('click', () =>
      document.getElementById('logoutModal').classList.remove('hidden')
    );
    document.getElementById('cancelLogout')?.addEventListener('click', () =>
      document.getElementById('logoutModal').classList.add('hidden')
    );
    document.getElementById('confirmLogout')?.addEventListener('click', async () => {
      document.getElementById('logoutModal').classList.add('hidden');
      try {
        const r = await fetch('/api/users/logout', { method: 'GET', credentials: 'include' });
        if (r.ok) window.location.href = '/';
      } catch { window.location.href = '/'; }
    });
  }

  async function loadAvatar() {
    try {
      const r    = await fetch('/api/users/info', { credentials: 'include' });
      const info = await r.json();
      const el   = document.getElementById('avatarImage');
      if (info.avatar_url && el) el.src = info.avatar_url;
    } catch {}
  }

  // ── Overlays ──────────────────────────────────────────────────────────────

  function injectNotifyOverlays() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <div id="notifyBox" class="hidden fixed right-6 top-20 w-80 bg-white shadow-xl rounded-xl overflow-hidden border border-gray-100 z-[60]">
        <div class="px-4 py-2 bg-indigo-600 text-white font-semibold">Thông báo</div>
        <ul id="notifyList" class="max-h-60 overflow-y-auto divide-y divide-gray-100"></ul>
      </div>
      <div id="notifyToast" class="fixed bottom-5 right-5 bg-gray-800 text-white px-4 py-2 rounded shadow-lg transition-opacity duration-500 opacity-0 z-[60] max-w-xs text-sm"></div>
    `.trim();
    document.body.appendChild(tpl.content);
  }

  function injectLogoutModal() {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
      <div id="logoutModal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-sm m-4 p-6">
          <div class="text-center">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <i class="fa-solid fa-right-from-bracket text-red-600 text-xl"></i>
            </div>
            <h3 class="mt-4 text-lg font-medium text-gray-900">Xác nhận đăng xuất</h3>
            <p class="mt-2 text-sm text-gray-500">Bạn có chắc chắn muốn đăng xuất không?</p>
          </div>
          <div class="mt-5 flex justify-end gap-3">
            <button id="cancelLogout" class="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Hủy</button>
            <button id="confirmLogout" class="px-4 py-2 rounded-md bg-red-600 text-sm text-white hover:bg-red-700">Đăng xuất</button>
          </div>
        </div>
      </div>
    `.trim();
    document.body.appendChild(tpl.content);
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async function initNotifications(email) {
    const bell    = document.getElementById('notifyBell');
    const countEl = document.getElementById('notifyCount');
    const boxEl   = document.getElementById('notifyBox');
    const listEl  = document.getElementById('notifyList');
    if (!bell || !boxEl) return;

    let unreadCount = 0;
    let unreadIds   = [];

    async function load() {
      try {
        const r    = await fetch('/api/notifications', { credentials: 'include' });
        const data = await r.json();
        render(Array.isArray(data) ? data : []);
      } catch {}
    }

    function render(notifications) {
      listEl.innerHTML = '';
      unreadCount = 0;
      unreadIds   = [];

      if (!notifications.length) {
        listEl.innerHTML = `<li class="px-4 py-3 text-sm text-gray-400 italic">Chưa có thông báo</li>`;
        countEl.classList.add('hidden');
        return;
      }

      notifications.forEach(n => {
        const li = document.createElement('li');
        li.className = 'px-4 py-3 hover:bg-indigo-50 transition';
        li.innerHTML = `
          <p class="text-sm text-gray-700">${n.message}</p>
          <p class="text-xs text-gray-400 mt-1">${new Date(n.created_at).toLocaleString()}</p>`;
        listEl.appendChild(li);
        if (!n.is_read) { unreadCount++; unreadIds.push(n.id); }
      });

      countEl.textContent = unreadCount;
      unreadCount > 0 ? countEl.classList.remove('hidden') : countEl.classList.add('hidden');
    }

    bell.addEventListener('click', async () => {
      boxEl.classList.toggle('hidden');
      if (!boxEl.classList.contains('hidden')) {
        unreadCount = 0;
        countEl.classList.add('hidden');
        try {
          for (const id of unreadIds) {
            await fetch(`/api/notifications/${id}/read`, { method: 'PUT', credentials: 'include' });
          }
          unreadIds = [];
        } catch {}
      }
    });

    document.addEventListener('click', e => {
      if (!bell.contains(e.target) && !boxEl.contains(e.target))
        boxEl.classList.add('hidden');
    });

    // Load socket.io only when user is logged in
    await loadSocketIO();
    const socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('registerEmail', email);
      load();
    });

    socket.on('newNotification', data => {
      unreadCount++;
      countEl.textContent = unreadCount;
      countEl.classList.remove('hidden');
      const li = document.createElement('li');
      li.className = 'px-4 py-3 hover:bg-indigo-50 transition';
      li.innerHTML = `
        <p class="text-sm text-gray-700">${data.message}</p>
        <p class="text-xs text-gray-400 mt-1">${new Date().toLocaleString()}</p>`;
      listEl.prepend(li);
      showToast(data.message);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showToast(text) {
    const toast = document.getElementById('notifyToast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.remove('opacity-0');
    setTimeout(() => toast.classList.add('opacity-0'), 3000);
  }

  function loadSocketIO() {
    return new Promise((resolve, reject) => {
      if (window.io) { resolve(); return; }
      const s  = document.createElement('script');
      s.src    = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
})();
