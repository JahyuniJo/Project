import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { getSocket } from '../hooks/useSocket';
import { getChatHistory, deleteChatHistory } from '../api/chat';

const MAX_LENGTH = 500;
// Bug 3 fix: 60s > backend worst-case (8s intent detection + 45s stream)
const STREAM_TIMEOUT_MS = 60000;

/**
 * Render markdown tối giản của tin nhắn AI thành HTML: `code`, **đậm**, *nghiêng*,
 * danh sách gạch đầu dòng, xuống dòng. AN TOÀN XSS: escape toàn bộ HTML TRƯỚC
 * rồi mới pattern-match markdown; inline code được thay bằng placeholder \x00C
 * trước khi xử lý đậm/nghiêng để nội dung code không bị format nhầm.
 * @param {string} text - Nội dung thô từ AI.
 * @returns {string} Chuỗi HTML để đưa vào dangerouslySetInnerHTML.
 */
function renderMarkdown(text) {
  let s = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const codeCache = [];
  s = s.replace(/`([^`\n]+?)`/g, (_, code) => {
    codeCache.push(`<code class="bg-gray-200 px-0.5 rounded text-[11px] font-mono">${code}</code>`);
    return `\x00C${codeCache.length - 1}\x00`;
  });
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  s = s.replace(/\x00C(\d+)\x00/g, (_, i) => codeCache[parseInt(i)]);

  const lines = s.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^[ \t]*[-*] (.+)$/);
    if (m) {
      if (!inList) { out.push('<ul class="list-disc ml-4 my-1 space-y-0.5">'); inList = true; }
      out.push(`<li>${m[1]}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(line);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n').replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>');
}

// ID tự tăng làm React key cho tin nhắn — tin trong state không có ID từ DB
let _msgId = 0;
const nextId = () => ++_msgId;

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * StoryCards — Khối card truyện gợi ý chèn vào luồng chat (nhận từ event
 * `chatStories`): ảnh bìa nhỏ + tên + tối đa 2 thể loại, bấm vào đi thẳng
 * trang đọc /read2. Ảnh lỗi thì ẩn khung ảnh thay vì hiện icon vỡ.
 */
function StoryCards({ stories }) {
  return (
    <div className="px-1 pb-1.5">
      <p className="text-[10px] text-indigo-400 font-semibold px-0.5 mb-1 mt-0.5 uppercase tracking-wide">
        Truyện gợi ý cho bạn
      </p>
      <div className="space-y-1">
        {stories.map((s) => {
          const genres = Array.isArray(s.genres) ? s.genres.slice(0, 2).join(', ') : (s.genres || '');
          return (
            <Link
              key={s.id}
              to={`/read2?id=${s.id}`}
              className="flex gap-2 p-1.5 rounded-lg border border-gray-100 hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
            >
              {s.cover_url && (
                <div className="w-10 h-14 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                  <img
                    src={s.cover_url}
                    alt={s.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-[11px] font-semibold text-gray-800 leading-tight line-clamp-2">{s.title}</p>
                {genres && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{genres}</p>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ChatBubble — Render 1 phần tử trong luồng chat theo loại:
 *   - story-cards → khối StoryCards.
 *   - Đang streaming → bubble xám với phần đã render (rendered HTML) + phần
 *     đuôi thô (raw) + con trỏ nhấp nháy; trạng thái thinking hiện "🔍 ..." pulse.
 *   - Hoàn chỉnh → bubble user (tím, bên phải, plain text) hoặc assistant
 *     (xám, bên trái, HTML từ renderMarkdown).
 */
function ChatBubble({ msg }) {
  if (msg.type === 'story-cards') return <StoryCards stories={msg.stories} />;

  const isUser = msg.role === 'user';

  if (msg.streaming) {
    return (
      <div className="flex justify-start chat-bubble">
        <div className="max-w-[82%] px-2 py-1 rounded-lg text-[12.5px] leading-snug break-words bg-gray-100 text-gray-800 rounded-tl-none">
          {msg.rendered && <span dangerouslySetInnerHTML={{ __html: msg.rendered }} />}
          {msg.thinking ? (
            <span className="text-indigo-400 italic animate-pulse">🔍 {msg.raw}</span>
          ) : (
            <span style={{ whiteSpace: 'pre-wrap' }}>{msg.raw}</span>
          )}
          <span className="inline-block w-0.5 h-3 bg-gray-500 ml-0.5 align-middle animate-pulse rounded-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} chat-bubble`}>
      {isUser ? (
        <div className="max-w-[82%] px-2 py-1 rounded-lg text-[12.5px] leading-snug break-words bg-indigo-500 text-white rounded-tr-none whitespace-pre-wrap">
          {msg.content}
        </div>
      ) : (
        <div
          className="max-w-[82%] px-2 py-1 rounded-lg text-[12.5px] leading-snug break-words bg-gray-100 text-gray-800 rounded-tl-none"
          dangerouslySetInnerHTML={{ __html: msg.isHtml ? msg.content : renderMarkdown(msg.content) }}
        />
      )}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

/**
 * ChatWidget — Widget chatbot nổi góc phải dưới (nút tròn → panel 420px).
 *
 * Hai chế độ theo props: có `storyId` → STORY MODE (chat về truyện đang đọc,
 * emit `chatMessage` kèm chapterNum để backend chống spoil); không có →
 * LIBRARY MODE (trợ lý tìm truyện, emit `libraryMessage`).
 *
 * Luồng streaming qua Socket.io (dùng socket singleton):
 *   gửi tin → thêm bubble user + bubble assistant rỗng cờ `streaming` →
 *   `chatThinking` (hiện trạng thái đang tìm truyện) → từng `chatChunk`
 *   (append vào buffer; phần trước newline cuối được render markdown ngay,
 *   phần đuôi giữ thô — render tăng dần không vỡ cú pháp giữa chừng) →
 *   `chatDone` (thay bằng reply chính thức từ server) / `chatStories`
 *   (thêm card gợi ý) / `chatError`.
 *
 * Phòng hộ: watchdog timeout 60s (quá hạn không nhận gì → chuyển bubble thành
 * báo lỗi, mở khóa input); đổi truyện → reset toàn bộ state; listener socket
 * đăng ký theo tham chiếu hàm cụ thể để cleanup không gỡ nhầm listener của
 * component khác. Lịch sử chat load lười khi mở panel lần đầu (kèm câu chào
 * nếu chưa chat lần nào); có nút xóa lịch sử (confirm trước). Chưa đăng nhập →
 * thay ô nhập bằng link /login.
 */
export default function ChatWidget({ storyId, chapterNum, storyTitle }) {
  const { user } = useAuth();
  const { toast, confirm } = useAlert();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [histLoaded, setHistLoaded] = useState(false);
  const [isLoadingHist, setIsLoadingHist] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const msgsContainerRef = useRef(null);
  const inputRef = useRef(null);
  const streamBufRef = useRef('');
  const timeoutRef = useRef(null);
  const isLoggedIn = !!user;
  const mode = storyId ? 'story' : 'library';

  const scrollBottom = useCallback(() => {
    if (msgsContainerRef.current) {
      msgsContainerRef.current.scrollTop = msgsContainerRef.current.scrollHeight;
    }
  }, []);

  // Bug 1+6 fix: extract as stable callbacks so sendMessage and socket effect share them
  const clearTmout = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, []);

  const startTmout = useCallback(() => {
    clearTmout();
    timeoutRef.current = setTimeout(() => {
      streamBufRef.current = '';
      setMsgs(prev => prev.map(m =>
        m.streaming ? { id: m.id, role: 'assistant', content: '⚠️ Không nhận được phản hồi, vui lòng thử lại' } : m
      ));
      setIsStreaming(false);
    }, STREAM_TIMEOUT_MS);
  }, [clearTmout]);

  // Scroll on new messages
  useEffect(() => { scrollBottom(); }, [msgs, scrollBottom]);

  // Bug 4 fix: reset chat state when switching stories
  useEffect(() => {
    setHistLoaded(false);
    setMsgs([]);
    streamBufRef.current = '';
    setIsStreaming(false);
    clearTmout();
  }, [storyId, clearTmout]);

  // Bug 6 fix: named handler references so socket.off only removes this component's listeners
  useEffect(() => {
    if (!isLoggedIn) return;
    const socket = getSocket();

    const onChunk = ({ chunk }) => {
      clearTmout();
      startTmout();
      streamBufRef.current += chunk;
      const lastNL = streamBufRef.current.lastIndexOf('\n');
      let addHtml = '';
      if (lastNL >= 0) {
        addHtml = renderMarkdown(streamBufRef.current.slice(0, lastNL + 1));
        streamBufRef.current = streamBufRef.current.slice(lastNL + 1);
      }
      const rawNow = streamBufRef.current;
      setMsgs(prev => prev.map(m =>
        m.streaming ? { ...m, thinking: false, rendered: m.rendered + addHtml, raw: rawNow } : m
      ));
    };

    const onThinking = ({ status }) => {
      clearTmout();
      startTmout();
      setMsgs(prev => prev.map(m =>
        m.streaming ? { ...m, thinking: true, raw: String(status) } : m
      ));
    };

    const onDone = ({ reply }) => {
      clearTmout();
      // Đọc và clear ref NGOÀI updater — Strict Mode double-invokes updaters,
      // nếu để trong updater thì lần 2 đọc được ref rỗng → content = ''
      const tail = streamBufRef.current ? renderMarkdown(streamBufRef.current) : '';
      streamBufRef.current = '';
      setMsgs(prev => prev.map(m => {
        if (!m.streaming) return m;
        // Ưu tiên reply từ server (authoritative), fallback về chunks đã render
        const finalHtml = reply ? renderMarkdown(reply) : (m.rendered + tail);
        return { id: m.id, role: 'assistant', content: finalHtml, isHtml: true };
      }));
      setIsStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    const onStories = ({ stories }) => {
      if (stories?.length) {
        setMsgs(prev => [...prev, { id: nextId(), type: 'story-cards', stories }]);
      }
    };

    const onError = ({ message }) => {
      clearTmout();
      streamBufRef.current = '';
      setMsgs(prev => {
        const hasStream = prev.some(m => m.streaming);
        if (hasStream) {
          return prev.map(m => m.streaming ? { id: m.id, role: 'assistant', content: `⚠️ ${message}` } : m);
        }
        return [...prev, { id: nextId(), role: 'assistant', content: `⚠️ ${message}` }];
      });
      setIsStreaming(false);
    };

    socket.on('chatChunk', onChunk);
    socket.on('chatThinking', onThinking);
    socket.on('chatDone', onDone);
    socket.on('chatStories', onStories);
    socket.on('chatError', onError);

    return () => {
      socket.off('chatChunk', onChunk);
      socket.off('chatThinking', onThinking);
      socket.off('chatDone', onDone);
      socket.off('chatStories', onStories);
      socket.off('chatError', onError);
      clearTmout();
    };
  }, [isLoggedIn, clearTmout, startTmout]);

  const loadHistory = useCallback(async () => {
    if (histLoaded || isLoadingHist) return;
    setIsLoadingHist(true);
    try {
      const data = await getChatHistory(storyId);
      const messages = data?.messages ?? [];
      if (!messages.length) {
        const titlePart = storyTitle ? ` **${storyTitle}**` : ' truyện này';
        const welcomeText = storyId
          ? `Xin chào! Tôi đã đọc thông tin về${titlePart} và sẵn sàng hỗ trợ bạn.\n\nBạn có thể hỏi tôi về:\n- Nội dung, nhân vật, cốt truyện\n- Số chương, chương mới nhất\n- Gợi ý truyện tương tự`
          : `Xin chào! Tôi là trợ lý thư viện DH.Story.\n\nMô tả loại truyện bạn muốn đọc và tôi sẽ tìm cho bạn!`;
        setMsgs([{ id: nextId(), role: 'assistant', content: welcomeText }]);
      } else {
        const loaded = [];
        for (const m of messages) {
          loaded.push({ id: nextId(), role: m.role, content: m.content });
          if (m.story_cards?.length) loaded.push({ id: nextId(), type: 'story-cards', stories: m.story_cards });
        }
        setMsgs(loaded);
      }
      setHistLoaded(true);
    } catch {
      setMsgs([]);
    } finally {
      setIsLoadingHist(false);
    }
  }, [histLoaded, isLoadingHist, storyId, storyTitle]);

  const handleOpen = () => {
    setOpen(true);
    if (isLoggedIn) loadHistory();
  };

  const sendMessage = useCallback(() => {
    if (isStreaming || !inputVal.trim()) return;
    const socket = getSocket();
    const msg = inputVal.trim();

    setMsgs(prev => [
      ...prev.filter(m => m.role || m.type === 'story-cards'),
      { id: nextId(), role: 'user', content: msg },
      { id: nextId(), role: 'assistant', streaming: true, rendered: '', raw: '', thinking: false },
    ]);
    setInputVal('');
    streamBufRef.current = '';
    setIsStreaming(true);
    startTmout(); // Bug 1 fix: start timeout immediately on send, not waiting for first chunk

    if (mode === 'library') {
      socket.emit('libraryMessage', { message: msg });
    } else {
      socket.emit('chatMessage', { storyId, message: msg, chapterNum });
    }
  }, [isStreaming, inputVal, mode, storyId, chapterNum, startTmout]);

  const clearHistory = useCallback(async () => {
    const ok = await confirm('Xóa toàn bộ lịch sử chat?');
    if (!ok) return;
    try {
      await deleteChatHistory(storyId);
      setMsgs([]);
      setHistLoaded(true);
    } catch {
      toast('Không thể xóa lịch sử, vui lòng thử lại', 'error');
    }
  }, [confirm, toast, storyId]);

  const emptyMsg = mode === 'library'
    ? 'Mô tả sở thích để tôi tìm truyện phù hợp cho bạn!'
    : 'Hỏi bất cứ điều gì về truyện này!';

  const charCount = inputVal.length;
  const charCls = charCount > 450 ? 'text-red-400' : charCount > 380 ? 'text-yellow-400' : 'text-gray-300';

  return (
    <>
      <style>{`
        .chat-scroll::-webkit-scrollbar { width: 3px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: #c7d2fe; border-radius: 9999px; }
        .chat-bubble { animation: chatFadeUp 0.18s ease; }
        @keyframes chatFadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Toggle button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-24 right-6 z-40 bg-indigo-600 text-white w-12 h-12 rounded-full shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center"
        title="Trợ lý truyện"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-40 right-6 z-40 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          style={{ height: 420 }}
        >
          {/* Header */}
          <div className="bg-indigo-600 text-white px-3 py-2 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              <span className="font-medium text-xs tracking-wide">
                {mode === 'library' ? 'Trợ lý thư viện' : 'Trợ lý truyện'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {isLoggedIn && (
                <button
                  onClick={clearHistory}
                  title="Xóa lịch sử"
                  className="p-1 rounded hover:bg-indigo-500 transition opacity-80 hover:opacity-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 011-1h4a1 1 0 011 1m-7 0h8" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-indigo-500 transition opacity-80 hover:opacity-100 text-xs font-bold leading-none"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={msgsContainerRef}
            className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5 chat-scroll"
          >
            {isLoadingHist && (
              <p className="text-center text-gray-300 text-[11px] py-3">Đang tải...</p>
            )}
            {!isLoadingHist && msgs.length === 0 && (
              <p className="text-center text-gray-300 text-[11px] py-3 italic">{emptyMsg}</p>
            )}
            {msgs.map((m) => <ChatBubble key={m.id} msg={m} />)}
          </div>

          {/* Input or login prompt */}
          {isLoggedIn ? (
            <div className="px-2 pt-1.5 pb-1 border-t border-gray-100 flex-shrink-0">
              <div className="flex items-end gap-1.5">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={inputVal}
                  onChange={(e) => {
                    setInputVal(e.target.value.slice(0, MAX_LENGTH));
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder={mode === 'library' ? 'Tìm truyện bạn muốn đọc...' : 'Hỏi về truyện này...'}
                  disabled={isStreaming}
                  className="flex-1 resize-none rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 leading-relaxed max-h-20 overflow-y-auto"
                  style={{ scrollbarWidth: 'none' }}
                />
                <button
                  onClick={sendMessage}
                  disabled={isStreaming || !inputVal.trim()}
                  className="w-8 h-8 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <div className="flex justify-end mt-0.5 pr-0.5">
                <span className={`text-[10px] transition-colors ${charCls}`}>{charCount}/{MAX_LENGTH}</span>
              </div>
            </div>
          ) : (
            <div className="px-3 py-3 text-center text-xs text-gray-400 flex-shrink-0 border-t border-gray-100">
              <Link to="/login" className="text-indigo-500 hover:underline font-medium">Đăng nhập</Link>
              {' '}để chat với trợ lý
            </div>
          )}
        </div>
      )}
    </>
  );
}
