(function () {
  let _storyId = null;
  let _chapterNum = null;
  let _mode = "story"; // "story" | "library"
  let _socket = null;
  let _isStreaming = false;
  let _initialized = false;
  let _historyLoaded = false;
  let _streamTimeout = null;
  let _streamLineBuffer = ""; // buffer dòng hiện tại chưa complete (incremental markdown)
  let _isThinking = false;    // đang hiển thị chatThinking indicator
  const STREAM_TIMEOUT_MS = 30000;
  const MAX_LENGTH = 500;

  // ── HTML escape ──────────────────────────────────────────────────────────
  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Basic markdown renderer (XSS-safe: escape first, then apply patterns) ─
  function renderMarkdown(text) {
    let s = esc(text);

    // Bảo vệ inline code trước khi xử lý bold/italic
    const codeCache = [];
    s = s.replace(/`([^`\n]+?)`/g, (_, code) => {
      codeCache.push(`<code class="bg-gray-200 px-0.5 rounded text-[11px] font-mono">${code}</code>`);
      return `\x00C${codeCache.length - 1}\x00`;
    });

    // Bold (**text**) trước italic
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
    // Italic (*text*) — chỉ còn * đơn sau khi bold đã xử lý
    s = s.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");

    // Khôi phục code
    s = s.replace(/\x00C(\d+)\x00/g, (_, i) => codeCache[parseInt(i)]);

    // Unordered list: dòng bắt đầu bằng "- " hoặc "* "
    const lines = s.split("\n");
    const out = [];
    let inList = false;
    for (const line of lines) {
      const m = line.match(/^[ \t]*[-*] (.+)$/);
      if (m) {
        if (!inList) { out.push('<ul class="list-disc ml-4 my-1 space-y-0.5">'); inList = true; }
        out.push(`<li>${m[1]}</li>`);
      } else {
        if (inList) { out.push("</ul>"); inList = false; }
        out.push(line);
      }
    }
    if (inList) out.push("</ul>");

    s = out.join("\n");
    s = s.replace(/\n\n+/g, "<br><br>");
    s = s.replace(/\n/g, "<br>");
    return s;
  }

  // ── Widget HTML ──────────────────────────────────────────────────────────
  function injectWidget() {
    if (document.getElementById("chatToggleBtn")) return;

    const style = document.createElement("style");
    style.textContent = `
      #chatMessages::-webkit-scrollbar { width: 3px; }
      #chatMessages::-webkit-scrollbar-track { background: transparent; }
      #chatMessages::-webkit-scrollbar-thumb { background: #c7d2fe; border-radius: 9999px; }
      @keyframes chatFadeUp {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .chat-bubble { animation: chatFadeUp 0.18s ease; }
      #chatInput { scrollbar-width: none; }
    `;
    document.head.appendChild(style);

    const tpl = document.createElement("template");
    tpl.innerHTML = `
      <button id="chatToggleBtn"
        class="fixed bottom-24 right-6 z-40 bg-indigo-600 text-white w-12 h-12 rounded-full shadow-lg
               hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center"
        title="Trợ lý truyện">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M8 10h.01M12 10h.01M16 10h.01M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
        </svg>
      </button>

      <div id="chatPanel"
        class="fixed bottom-40 right-6 z-40 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 hidden flex-col overflow-hidden"
        style="height:420px">

        <div class="bg-indigo-600 text-white px-3 py-2 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
            <span class="font-medium text-xs tracking-wide">${_mode === "library" ? "Trợ lý thư viện" : "Trợ lý truyện"}</span>
          </div>
          <div class="flex items-center gap-1">
            <button id="chatClearBtn" title="Xóa lịch sử"
              class="p-1 rounded hover:bg-indigo-500 transition opacity-80 hover:opacity-100">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 011-1h4a1 1 0 011 1m-7 0h8"/>
              </svg>
            </button>
            <button id="chatCloseBtn"
              class="p-1 rounded hover:bg-indigo-500 transition opacity-80 hover:opacity-100 text-xs font-bold leading-none">✕</button>
          </div>
        </div>

        <div id="chatMessages" class="flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5"></div>

        <div id="chatInputArea" class="px-2 pt-1.5 pb-1 border-t border-gray-100 flex-shrink-0">
          <div class="flex items-end gap-1.5">
            <textarea id="chatInput" rows="1"
              placeholder="${_mode === "library" ? "Tìm truyện bạn muốn đọc..." : "Hỏi về truyện này..."}"
              class="flex-1 resize-none rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs
                     focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300
                     leading-relaxed max-h-20 overflow-y-auto"></textarea>
            <button id="chatSendBtn"
              class="w-8 h-8 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:scale-95
                     transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
            </button>
          </div>
          <div class="flex justify-end mt-0.5 pr-0.5">
            <span id="chatCharCount" class="text-[10px] text-gray-300 transition-colors">0/${MAX_LENGTH}</span>
          </div>
        </div>

        <div id="chatLoginPrompt" class="px-3 py-3 text-center text-xs text-gray-400 hidden flex-shrink-0 border-t border-gray-100">
          <a href="/login.html" class="text-indigo-500 hover:underline font-medium">Đăng nhập</a>
          để chat với trợ lý
        </div>

      </div>
    `.trim();
    document.body.appendChild(tpl.content);
  }

  // ── Socket ───────────────────────────────────────────────────────────────
  function getOrCreateSocket() {
    if (window.APP_SOCKET) return window.APP_SOCKET;
    if (!window.io) return null;
    const s = io({ transports: ["websocket", "polling"] });
    window.APP_SOCKET = s;
    return s;
  }

  // ── Render chat bubble ───────────────────────────────────────────────────
  function appendMessage(role, content, streaming = false) {
    const list = document.getElementById("chatMessages");
    const isUser = role === "user";
    const wrap = document.createElement("div");
    wrap.className = `flex ${isUser ? "justify-end" : "justify-start"}`;

    if (streaming) {
      // Cấu trúc 2 vùng: rendered (markdown hoàn chỉnh) + raw (dòng đang stream)
      wrap.innerHTML = `
        <div class="chat-bubble max-w-[82%] px-2 py-1 rounded-lg text-[12.5px] leading-snug break-words
                    bg-gray-100 text-gray-800 rounded-tl-none"
             id="chatStreamBubble">
          <span class="stream-rendered"></span>
          <span class="stream-raw" style="white-space:pre-wrap"></span>
          <span class="stream-cursor inline-block w-0.5 h-3 bg-gray-500 ml-0.5 align-middle animate-pulse rounded-sm"></span>
        </div>`;
    } else {
      const bubbleContent = isUser ? esc(content) : renderMarkdown(content);
      wrap.innerHTML = `
        <div class="chat-bubble max-w-[82%] px-2 py-1 rounded-lg text-[12.5px] leading-snug break-words
          ${isUser
            ? "bg-indigo-500 text-white rounded-tr-none whitespace-pre-wrap"
            : "bg-gray-100 text-gray-800 rounded-tl-none"
          }">
          ${bubbleContent}
        </div>`;
    }
    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;
    return wrap.querySelector("div");
  }

  // ── Stream timeout ───────────────────────────────────────────────────────
  function clearStreamTimeout() {
    if (_streamTimeout) { clearTimeout(_streamTimeout); _streamTimeout = null; }
  }

  function startStreamTimeout() {
    clearStreamTimeout();
    _streamTimeout = setTimeout(() => {
      _streamLineBuffer = "";
      _isThinking = false;
      const bubble = document.getElementById("chatStreamBubble");
      if (bubble) {
        bubble.removeAttribute("id");
        bubble.innerHTML = `<span class="text-red-500">⚠️ Không nhận được phản hồi, vui lòng thử lại</span>`;
      }
      _isStreaming = false;
      setInputEnabled(true);
    }, STREAM_TIMEOUT_MS);
  }

  // ── Input state ──────────────────────────────────────────────────────────
  function setInputEnabled(enabled) {
    const input = document.getElementById("chatInput");
    const btn = document.getElementById("chatSendBtn");
    if (input) input.disabled = !enabled;
    if (btn) btn.disabled = !enabled;
  }

  // ── Story recommendation cards ───────────────────────────────────────────
  function renderStoryCards(stories) {
    const list = document.getElementById("chatMessages");
    if (!list || !stories.length) return;

    const wrap = document.createElement("div");
    wrap.className = "px-1 pb-1.5";

    const header = document.createElement("p");
    header.className = "text-[10px] text-indigo-400 font-semibold px-0.5 mb-1 mt-0.5 uppercase tracking-wide";
    header.textContent = "Truyện gợi ý cho bạn";
    wrap.appendChild(header);

    const cards = document.createElement("div");
    cards.className = "space-y-1";

    for (const s of stories) {
      const genres = Array.isArray(s.genres) ? s.genres.slice(0, 2).join(", ") : (s.genres || "");

      const a = document.createElement("a");
      a.href = `/read2.html?id=${s.id}`;
      a.className =
        "flex gap-2 p-1.5 rounded-lg border border-gray-100 hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer";
      a.style.textDecoration = "none";

      const imgWrap = document.createElement("div");
      imgWrap.className = "w-10 h-14 rounded overflow-hidden flex-shrink-0 bg-gray-100";
      if (s.cover_url) {
        const img = document.createElement("img");
        img.src = s.cover_url;
        img.alt = s.title;
        img.className = "w-full h-full object-cover";
        img.onerror = () => { imgWrap.style.display = "none"; };
        imgWrap.appendChild(img);
      }

      const info = document.createElement("div");
      info.className = "flex-1 min-w-0 flex flex-col justify-center";

      const titleEl = document.createElement("p");
      titleEl.className = "text-[11px] font-semibold text-gray-800 leading-tight line-clamp-2";
      titleEl.textContent = s.title;

      info.appendChild(titleEl);
      if (genres) {
        const genreEl = document.createElement("p");
        genreEl.className = "text-[10px] text-gray-400 mt-0.5 truncate";
        genreEl.textContent = genres;
        info.appendChild(genreEl);
      }

      a.appendChild(imgWrap);
      a.appendChild(info);
      cards.appendChild(a);
    }

    wrap.appendChild(cards);
    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;
  }

  // ── History (with cache) ─────────────────────────────────────────────────
  async function loadHistory() {
    if (_historyLoaded) return;
    const list = document.getElementById("chatMessages");
    if (!list) return;
    list.innerHTML = `<p class="text-center text-gray-300 text-[11px] py-3">Đang tải...</p>`;
    try {
      const histUrl = _mode === "library"
        ? "/api/chat/history"
        : `/api/chat/history?story_id=${_storyId}`;
      const r = await fetch(histUrl, { credentials: "include" });
      if (!r.ok) { list.innerHTML = ""; return; }
      const { messages } = await r.json();
      list.innerHTML = "";
      const emptyMsg = _mode === "library"
        ? "Mô tả sở thích để tôi tìm truyện phù hợp cho bạn!"
        : "Hỏi bất cứ điều gì về truyện này!";
      if (!messages.length) {
        list.innerHTML = `<p class="text-center text-gray-300 text-[11px] py-3 italic">${emptyMsg}</p>`;
      } else {
        messages.forEach((m) => {
          appendMessage(m.role, m.content);
          if (m.story_cards && m.story_cards.length) renderStoryCards(m.story_cards);
        });
      }
      _historyLoaded = true;
    } catch {
      list.innerHTML = "";
    }
  }

  // ── Socket events ────────────────────────────────────────────────────────
  function bindSocketEvents() {
    _socket = getOrCreateSocket();
    if (!_socket) return;

    _socket.off("chatChunk");
    _socket.off("chatDone");
    _socket.off("chatError");
    _socket.off("chatStories");
    _socket.off("chatThinking");

    // Incremental markdown: render từng dòng ngay khi có newline
    _socket.on("chatChunk", ({ chunk }) => {
      clearStreamTimeout();
      startStreamTimeout();
      _isThinking = false;

      const bubble = document.getElementById("chatStreamBubble");
      if (!bubble) return;

      _streamLineBuffer += chunk;

      // Tìm dòng cuối cùng hoàn chỉnh (kết thúc bằng \n)
      const lastNL = _streamLineBuffer.lastIndexOf("\n");
      if (lastNL >= 0) {
        const completeLines = _streamLineBuffer.slice(0, lastNL + 1);
        _streamLineBuffer = _streamLineBuffer.slice(lastNL + 1);

        const renderedEl = bubble.querySelector(".stream-rendered");
        if (renderedEl) renderedEl.innerHTML += renderMarkdown(completeLines);
      }

      // Dòng đang stream (chưa có \n) — hiển thị raw
      const rawEl = bubble.querySelector(".stream-raw");
      if (rawEl) rawEl.textContent = _streamLineBuffer;

      const list = document.getElementById("chatMessages");
      if (list) list.scrollTop = list.scrollHeight;
    });

    // Khi server đang gọi tool — hiển thị indicator
    _socket.on("chatThinking", ({ status }) => {
      clearStreamTimeout();
      startStreamTimeout();
      _isThinking = true;

      const bubble = document.getElementById("chatStreamBubble");
      if (!bubble) return;
      const rawEl = bubble.querySelector(".stream-raw");
      if (rawEl) {
        rawEl.innerHTML = `<span class="text-indigo-400 italic animate-pulse">🔍 ${esc(status)}</span>`;
      }
      const list = document.getElementById("chatMessages");
      if (list) list.scrollTop = list.scrollHeight;
    });

    _socket.on("chatDone", () => {
      clearStreamTimeout();
      const bubble = document.getElementById("chatStreamBubble");
      if (bubble) {
        bubble.removeAttribute("id");
        // Render phần còn lại trong buffer
        const renderedEl = bubble.querySelector(".stream-rendered");
        if (renderedEl && _streamLineBuffer) {
          renderedEl.innerHTML += renderMarkdown(_streamLineBuffer);
        }
        _streamLineBuffer = "";
        // Dọn dẹp: xóa raw và cursor, flatten innerHTML
        const rawEl = bubble.querySelector(".stream-raw");
        const cursor = bubble.querySelector(".stream-cursor");
        if (rawEl) rawEl.remove();
        if (cursor) cursor.remove();
        if (renderedEl) bubble.innerHTML = renderedEl.innerHTML;
      }
      _isStreaming = false;
      _isThinking = false;
      setInputEnabled(true);
      const input = document.getElementById("chatInput");
      if (input) input.focus();
    });

    _socket.on("chatStories", ({ stories }) => {
      if (stories && stories.length) renderStoryCards(stories);
    });

    _socket.on("chatError", ({ message }) => {
      clearStreamTimeout();
      _streamLineBuffer = "";
      _isThinking = false;
      const bubble = document.getElementById("chatStreamBubble");
      if (bubble) {
        bubble.removeAttribute("id");
        bubble.innerHTML = `<span class="text-red-500">${esc(message)}</span>`;
      } else {
        appendMessage("assistant", `⚠️ ${message}`);
      }
      _isStreaming = false;
      setInputEnabled(true);
    });
  }

  // ── Send message ─────────────────────────────────────────────────────────
  function sendMessage() {
    if (_isStreaming) return;
    const input = document.getElementById("chatInput");
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;

    if (!_socket) {
      appendMessage("assistant", "⚠️ Mất kết nối, vui lòng tải lại trang");
      return;
    }

    // Xóa placeholder nếu còn
    const list = document.getElementById("chatMessages");
    const placeholder = list && list.querySelector("p.italic");
    if (placeholder) placeholder.remove();

    input.value = "";
    _streamLineBuffer = "";
    _isThinking = false;
    // Reset char counter
    const counter = document.getElementById("chatCharCount");
    if (counter) { counter.textContent = `0/${MAX_LENGTH}`; counter.className = "text-[10px] text-gray-300 transition-colors"; }

    appendMessage("user", msg);
    appendMessage("assistant", "", true);

    _isStreaming = true;
    setInputEnabled(false);
    startStreamTimeout();
    if (_mode === "library") {
      _socket.emit("libraryMessage", { message: msg });
    } else {
      _socket.emit("chatMessage", { storyId: _storyId, message: msg, chapterNum: _chapterNum });
    }
  }

  // ── Clear history ────────────────────────────────────────────────────────
  async function clearHistory() {
    const ok = await window.showConfirm("Xóa toàn bộ lịch sử chat?", "Xác nhận");
    if (!ok) return;
    try {
      const delUrl = _mode === "library"
        ? "/api/chat/history"
        : `/api/chat/history?story_id=${_storyId}`;
      const r = await fetch(delUrl, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error();
      _historyLoaded = false;
      const list = document.getElementById("chatMessages");
      const emptyMsg = _mode === "library"
        ? "Mô tả sở thích để tôi tìm truyện phù hợp cho bạn!"
        : "Hỏi bất cứ điều gì về truyện này!";
      if (list) list.innerHTML = `<p class="text-center text-gray-300 text-[11px] py-3 italic">${emptyMsg}</p>`;
      _historyLoaded = true; // đã reset, không cần tải lại từ server
    } catch {
      appendMessage("assistant", "⚠️ Không thể xóa lịch sử, vui lòng thử lại");
    }
  }

  // ── Wire UI events ───────────────────────────────────────────────────────
  function wireEvents(loggedIn) {
    const toggleBtn = document.getElementById("chatToggleBtn");
    const panel = document.getElementById("chatPanel");
    const closeBtn = document.getElementById("chatCloseBtn");
    const clearBtn = document.getElementById("chatClearBtn");
    const sendBtn = document.getElementById("chatSendBtn");
    const input = document.getElementById("chatInput");
    const inputArea = document.getElementById("chatInputArea");
    const loginPrompt = document.getElementById("chatLoginPrompt");

    if (!loggedIn) {
      if (inputArea) inputArea.classList.add("hidden");
      if (loginPrompt) loginPrompt.classList.remove("hidden");
    }

    let panelOpen = false;

    toggleBtn.addEventListener("click", () => {
      panelOpen = !panelOpen;
      if (panelOpen) {
        panel.classList.remove("hidden");
        panel.classList.add("flex");
        if (loggedIn) loadHistory();
      } else {
        panel.classList.add("hidden");
        panel.classList.remove("flex");
      }
    });

    closeBtn.addEventListener("click", () => {
      panelOpen = false;
      panel.classList.add("hidden");
      panel.classList.remove("flex");
    });

    if (loggedIn) {
      clearBtn.addEventListener("click", clearHistory);
      sendBtn.addEventListener("click", sendMessage);

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 100) + "px";
        const len = input.value.length;
        const counter = document.getElementById("chatCharCount");
        if (counter) {
          counter.textContent = `${len}/${MAX_LENGTH}`;
          counter.className = `text-[10px] transition-colors ${
            len > 450 ? "text-red-400" : len > 380 ? "text-yellow-400" : "text-gray-300"
          }`;
        }
      });
    }
  }

  // ── Lazy-load socket.io ──────────────────────────────────────────────────
  function ensureSocketIO(cb) {
    if (window.io) { cb(); return; }
    const s = document.createElement("script");
    s.src = "/socket.io/socket.io.js";
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  // ── Public API ───────────────────────────────────────────────────────────
  window.initChatWidget = function ({ storyId, chapterNum } = {}) {
    if (_initialized) return;
    _initialized = true;
    _storyId = storyId ?? null;
    _chapterNum = chapterNum ?? null;
    _mode = _storyId ? "story" : "library";

    injectWidget();

    let wiresDone = false;
    function afterHeaderReady() {
      if (wiresDone) return;
      wiresDone = true;
      const loggedIn = !!(window.HEADER_STATE && window.HEADER_STATE.loggedIn);
      wireEvents(loggedIn);
      if (loggedIn) ensureSocketIO(() => bindSocketEvents());
    }

    if (window.HEADER_STATE) {
      afterHeaderReady();
    } else {
      window.addEventListener("headerReady", afterHeaderReady, { once: true });
      setTimeout(afterHeaderReady, 4000);
    }
  };

  // Expose renderer cho các trang khác dùng (ví dụ: AI summary)
  window.renderMarkdown = renderMarkdown;
})();
