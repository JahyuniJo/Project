import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getChapterContent } from '../../api/chapters';
import { getChapters } from '../../api/stories';
import useOutsideClick from '../../hooks/useOutsideClick';
import ChatWidget from '../../components/ChatWidget';

// ── Chapter dropdown ──────────────────────────────────────────────────────────
function ChapterDropdown({ chapters, currentId, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false));

  const current = chapters.find((c) => c.id === currentId);
  const label = current
    ? `Chương ${current.chapter_num}${current.title ? ` — ${current.title}` : ''}`
    : 'Chọn chương';

  return (
    <div ref={ref} className="relative flex-1 max-w-sm mx-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between border rounded-lg px-3 py-2 text-sm text-gray-700 bg-white transition ${open ? 'border-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.12)] bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'}`}
      >
        <span className="truncate">{label}</span>
        <i className={`fa-solid fa-chevron-down text-xs text-gray-400 shrink-0 ml-1 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-indigo-100 rounded-xl z-50 shadow-xl max-h-64 overflow-y-auto">
          <div className="p-1.5 space-y-0.5">
            {chapters.map((c) => {
              const optLabel = `Chương ${c.chapter_num}${c.title ? ` — ${c.title}` : ''}`;
              return (
                <div
                  key={c.id}
                  onClick={() => { setOpen(false); onSelect(c.id); }}
                  className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition ${c.id === currentId ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'}`}
                >
                  {optLabel}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nav bar (top or bottom) ───────────────────────────────────────────────────
function ChapterNav({ chapters, currentId, onNav }) {
  const idx = chapters.findIndex((c) => c.id === currentId);
  const hasPrev = idx > 0;
  const hasNext = idx < chapters.length - 1;
  const btnCls = (enabled) =>
    `shrink-0 flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-sm font-medium transition hover:bg-indigo-100 ${!enabled ? 'opacity-40 cursor-not-allowed' : ''}`;

  return (
    <div className="container mx-auto px-6 py-3 flex items-center gap-3">
      <button
        disabled={!hasPrev}
        onClick={() => hasPrev && onNav(chapters[idx - 1].id)}
        className={btnCls(hasPrev)}
      >
        <i className="fa-solid fa-chevron-left text-xs"></i>
        <span className="hidden sm:inline">Trước</span>
      </button>

      <ChapterDropdown chapters={chapters} currentId={currentId} onSelect={onNav} />

      <button
        disabled={!hasNext}
        onClick={() => hasNext && onNav(chapters[idx + 1].id)}
        className={btnCls(hasNext)}
      >
        <span className="hidden sm:inline">Sau</span>
        <i className="fa-solid fa-chevron-right text-xs"></i>
      </button>
    </div>
  );
}

// ── Main Chapter page ─────────────────────────────────────────────────────────
export default function Chapter() {
  const { id } = useParams();
  const chapterId = parseInt(id);
  const navigate = useNavigate();
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Reset scroll when chapter changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [chapterId]);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['chapter-content', chapterId],
    queryFn: () => getChapterContent(chapterId),
    retry: 1,
  });

  const chapter = data?.chapter;
  const images = data?.images ?? [];

  // Fetch sibling chapters for nav
  const { data: allChapters = [] } = useQuery({
    queryKey: ['chapters', chapter?.story_id],
    queryFn: () => getChapters(chapter.story_id),
    enabled: !!chapter?.story_id,
  });

  const goToChapter = (newId) => navigate(`/chapter/${newId}`);

  const titleText = chapter
    ? `Chương ${chapter.chapter_num}${chapter.title ? ` — ${chapter.title}` : ''}`
    : 'Đang tải...';

  const backUrl = chapter ? `/read?id=${chapter.story_id}` : '/';

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col font-sans text-gray-800">
      {/* Breadcrumb */}
      <div className="bg-indigo-50 border-b border-indigo-100">
        <div className="container mx-auto px-6 py-2.5 flex items-center gap-3 min-w-0">
          <Link
            to={backUrl}
            onClick={(e) => { e.preventDefault(); navigate(-1); }}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-700 border border-indigo-200 rounded-full hover:bg-indigo-100 transition text-sm font-medium"
          >
            <i className="fa-solid fa-arrow-left text-xs"></i>
            <span>Về truyện</span>
          </Link>
          <span className="text-gray-300 hidden sm:inline">/</span>
          <p className="text-sm text-gray-600 italic truncate min-w-0">{titleText}</p>
        </div>
      </div>

      {/* Sticky nav top */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <ChapterNav chapters={allChapters} currentId={chapterId} onNav={goToChapter} />
      </div>

      {/* Reading area */}
      <main className="flex-1 py-6">
        <div className="container mx-auto px-4">
          {isLoading && (
            <div className="bg-white rounded-2xl shadow-sm flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-10 h-10 rounded-full animate-spin border-[3px] border-indigo-500 border-t-transparent"></div>
              <p className="text-gray-400 text-sm">Đang tải chương...</p>
            </div>
          )}

          {(isError || (!isLoading && !data)) && (
            <div className="bg-white rounded-2xl shadow-sm flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
              <i className={`fa-solid text-5xl ${error?.message?.includes('403') ? 'fa-lock text-yellow-400' : 'fa-circle-exclamation text-red-400'}`}></i>
              <p className="text-gray-600">{error?.message || 'Không thể tải chương này'}</p>
              <button
                onClick={() => refetch()}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition"
              >
                Thử lại
              </button>
            </div>
          )}

          {!isLoading && images.length > 0 && (
            <div className="max-w-3xl mx-auto bg-gray-900 rounded-2xl shadow-lg overflow-hidden">
              {images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Trang ${i + 1}`}
                  loading={i < 2 ? 'eager' : 'lazy'}
                  className="block w-full h-auto"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Bottom nav */}
      <div className="bg-white border-t border-gray-200 shadow-sm">
        <ChapterNav chapters={allChapters} currentId={chapterId} onNav={goToChapter} />
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-8 right-6 w-12 h-12 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 z-50 transition"
          title="Lên đầu trang"
        >
          <i className="fa-solid fa-chevron-up"></i>
        </button>
      )}

      {chapter && (
        <ChatWidget storyId={chapter.story_id} chapterNum={chapter.chapter_num} />
      )}
    </div>
  );
}
