let currentChapterId = null;
let allChapters = [];

// Đọc auth state từ header.js (được set sau khi header khởi tạo xong)
function getIsLoggedIn() {
  return !!(window.HEADER_STATE && window.HEADER_STATE.loggedIn);
}
function getIndexPage() {
  return (window.HEADER_STATE && window.HEADER_STATE.indexPage) || '/index.html';
}
function getStoryPage() {
  return (window.HEADER_STATE && window.HEADER_STATE.storyPage) || '/read.html';
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function goToChapter(id) {
  window.location.replace(`/chapter.html?id=${id}`);
}

function setButtonEnabled(btn, enabled) {
  btn.disabled = !enabled;
  btn.classList.toggle('opacity-40', !enabled);
}

function updateNav() {
  const idx     = allChapters.findIndex(c => c.id === currentChapterId);
  const hasPrev = idx > 0;
  const hasNext = idx < allChapters.length - 1;

  ['prevBtn', 'prevBtnBottom'].forEach(id => {
    const btn = document.getElementById(id);
    setButtonEnabled(btn, hasPrev);
    if (hasPrev) btn.onclick = () => goToChapter(allChapters[idx - 1].id);
  });

  ['nextBtn', 'nextBtnBottom'].forEach(id => {
    const btn = document.getElementById(id);
    setButtonEnabled(btn, hasNext);
    if (hasNext) btn.onclick = () => goToChapter(allChapters[idx + 1].id);
  });
}

function fillSelect(wrapperId, chapters, currentId) {
  const w = document.getElementById(wrapperId);
  if (!w) return;
  const input = w.querySelector('input[type="hidden"]');
  const lbl = w.querySelector('.dd-label');
  const list = w.querySelector('.dd-list');
  if (input) input.value = currentId || '';
  const current = chapters.find(c => c.id === currentId);
  if (lbl) lbl.textContent = current ? `Chương ${current.chapter_num}${current.title ? ` — ${current.title}` : ''}` : 'Chọn chương';
  if (list) {
    list.innerHTML = chapters.map(c => {
      const optLabel = `Chương ${c.chapter_num}${c.title ? ` — ${c.title}` : ''}`;
      return `<div class="custom-dropdown-option${c.id === currentId ? ' selected' : ''}" data-value="${c.id}" onclick="closeAllDD(); goToChapter(${c.id})">${optLabel}</div>`;
    }).join('');
  }
}

async function loadChapterList(storyId) {
  try {
    const res = await fetch(`/api/stories/${storyId}/chapters`);
    if (!res.ok) return;
    allChapters = await res.json();
    fillSelect('chapterSelect-wrapper', allChapters, currentChapterId);
    fillSelect('chapterSelectBottom-wrapper', allChapters, currentChapterId);
    updateNav();
  } catch (err) {
    console.error('[chapter] tải danh sách chương:', err);
  }
}

function renderImages(images) {
  document.getElementById('imageContainer').innerHTML = images.map((src, i) =>
    `<img src="${src}" alt="Trang ${i + 1}"` +
    ` loading="${i < 2 ? 'eager' : 'lazy'}"` +
    ` onerror="this.style.display='none'" />`
  ).join('');
}

function show(id, displayType) {
  ['loadingState', 'errorState', 'imageContainer'].forEach(s => {
    document.getElementById(s).style.display = s === id ? displayType : 'none';
  });
}

async function loadChapter() {
  const chapterId = parseInt(getParam('id'));
  if (!chapterId || chapterId <= 0) { show('errorState', 'flex'); return; }
  currentChapterId = chapterId;
  show('loadingState', 'flex');

  try {
    const res  = await fetch(`/api/chapters/${chapterId}/content`);
    const data = await res.json();

    if (!res.ok) {
      document.getElementById('errorMsg').textContent = data.message || 'Không thể tải chương này';
      if (res.status === 403)
        document.getElementById('errorIcon').className = 'fa-solid fa-lock text-5xl text-yellow-400';
      show('errorState', 'flex');
      return;
    }

    const { images, chapter } = data;
    const titleText = `Chương ${chapter.chapter_num}${chapter.title ? ` — ${chapter.title}` : ''}`;
    document.getElementById('chapterTitle').textContent = titleText;
    document.title = `${titleText} | DH.story`;

    const ref      = getParam('ref');
    const backBase = ref === 'read2' ? '/read2.html' : '/read.html';
    const backUrl  = `${backBase}?id=${chapter.story_id}`;
    const backBtnEl = document.getElementById('backBtn');
    backBtnEl.href = backUrl;
    backBtnEl.addEventListener('click', e => {
      e.preventDefault();
      history.length > 1 ? history.back() : window.location.replace(backUrl);
    });

    renderImages(images);
    show('imageContainer', 'block');

    await loadChapterList(chapter.story_id);

    if (typeof window.initChatWidget === 'function') {
      window.initChatWidget({ storyId: chapter.story_id, chapterNum: chapter.chapter_num });
    }
  } catch (err) {
    console.error('[chapter] tải chương:', err);
    show('errorState', 'flex');
  }
}

// ── Scroll-to-top ──────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('scrollTopBtn').classList.toggle('visible', window.scrollY > 400);
});

// ── Search (dùng HEADER_STATE lazy — đọc lúc user click, không phải lúc setup) ──
(function setupSearch() {
  const searchBox = document.getElementById('searchBox');
  const searchBtn = document.getElementById('searchBtn');
  const suggestionBox = document.getElementById('searchSuggestions');
  if (!searchBox) return;
  let typingTimer;

  function escSuggest(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  async function fetchSuggestions(q) {
    if (!q.trim()) { suggestionBox.classList.add('hidden'); return; }
    try {
      const res  = await fetch(`/api/stories/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.length) {
        suggestionBox.innerHTML = `<p class="p-3 text-gray-500 text-sm">Không tìm thấy...</p>`;
        suggestionBox.classList.remove('hidden');
        return;
      }
      const page = getStoryPage();
      suggestionBox.innerHTML = data.map(item => {
        const id = parseInt(item.id) || 0;
        const cover = escSuggest(item.cover_url || '/assets/images/Logo.png');
        return `
          <div onclick="window.location.href='${page}?id=${id}'"
               class="flex items-center p-2 hover:bg-indigo-50 cursor-pointer">
            <img src="${cover}" class="w-10 h-14 object-cover rounded mr-3"
                 onerror="this.src='/assets/images/Logo.png'">
            <div>
              <p class="font-medium text-indigo-700">${escSuggest(item.title)}</p>
              <p class="text-xs text-gray-500">${escSuggest(item.author) || 'Không rõ tác giả'}</p>
            </div>
          </div>`;
      }).join('');
      suggestionBox.classList.remove('hidden');
    } catch (err) {
      console.error('[chapter] tìm kiếm gợi ý:', err);
    }
  }

  function doSearch() {
    const q = searchBox.value.trim();
    if (!q) return;
    suggestionBox.classList.add('hidden');
    window.location.href = `${getIndexPage()}?q=${encodeURIComponent(q)}`;
  }

  searchBox.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => fetchSuggestions(searchBox.value), 200);
  });
  searchBox.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  searchBtn.addEventListener('click', doSearch);
  document.addEventListener('click', e => {
    if (!searchBox.contains(e.target) && !suggestionBox.contains(e.target))
      suggestionBox.classList.add('hidden');
  });
})();

// ── Genre dropdown (dùng HEADER_STATE lazy) ────────────────────────────────
(function setupGenreDropdown() {
  const btn     = document.getElementById('genreBtn');
  const dropdown = document.getElementById('genreDropdown');
  const chevron  = document.getElementById('genreChevron');
  if (!btn) return;
  let loaded = false;

  async function loadGenres() {
    try {
      const res    = await fetch('/api/stories/genres');
      const genres = await res.json();
      const list   = document.getElementById('genreList');
      if (!genres.length) {
        list.innerHTML = `<p class="col-span-2 text-gray-400 italic px-2 py-1 text-xs">Chưa có thể loại</p>`;
        return;
      }
      const indexPage = getIndexPage();
      list.innerHTML = genres.map(g => `
        <a href="${indexPage}?genre=${encodeURIComponent(g)}"
           class="px-3 py-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition text-gray-700 text-sm block">
          ${g}
        </a>`).join('');
    } catch (err) {
      console.error('[chapter] tải thể loại:', err);
    }
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const opening = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden');
    chevron.style.transform = opening ? 'rotate(180deg)' : '';
    if (opening && !loaded) { loadGenres(); loaded = true; }
  });

  document.addEventListener('click', e => {
    if (!document.getElementById('genreDropdownWrapper').contains(e.target)) {
      dropdown.classList.add('hidden');
      chevron.style.transform = '';
    }
  });
})();

loadChapter();
