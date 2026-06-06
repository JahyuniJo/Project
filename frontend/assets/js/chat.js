(function () {
  let _storyId = null;
  let _socket = null;
  let _isStreaming = false;
  let _initialized = false;
  let _streamTimeout = null;
  const STREAM_TIMEOUT_MS = 30000;

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

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
            <span class="font-medium text-xs tracking-wide">Trợ lý truyện</span>
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

        <div id="chatInputArea" class="px-2 py-1.5 border-t border-gray-100 flex items-end gap-1.5 flex-shrink-0">
          <textarea id="chatInput" rows="1"
            placeholder="Hỏi về truyện này..."
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

        <div id="chatLoginPrompt" class="px-3 py-3 text-center text-xs text-gray-400 hidden flex-shrink-0 border-t border-gray-100">
          <a href="/login.html" class="text-indigo-500 hover:underline font-medium">Đăng nhập</a>
          để chat với trợ lý
        </div>

      </div>
    `.trim();
    document.body.appendChild(tpl.content);
  }

  function getOrCreateSocket() {
    if (window.APP_SOCKET) return window.APP_SOCKET;
    if (!window.io) return null;
    const s = io({ transports: ["websocket", "polling"] });
    window.APP_SOCKET = s;
    return s;
  }

  function appendMessage(role, content, streaming = false) {
    const list = document.getElementById("chatMessages");
    const isUser = role === "user";
    const wrap = document.createElement("div");
    wrap.className = `flex ${isUser ? "justify-end" : "justify-start"}`;
    wrap.innerHTML = `
      <div class="chat-bubble max-w-[82%] px-2 py-1 rounded-lg text-[12.5px] leading-snug whitespace-pre-wrap break-words
        ${isUser
          ? "bg-indigo-500 text-white rounded-tr-none"
          : "bg-gray-100 text-gray-800 rounded-tl-none"}"
        ${streaming ? 'id="chatStreamBubble"' : ""}>
        ${esc(content)}${streaming ? '<span class="inline-block w-0.5 h-3 bg-gray-500 ml-0.5 align-middle animate-pulse rounded-sm"></span>' : ""}
      </div>`;
    list.appendChild(wrap);
    list.scrollTop = list.scrollHeight;
    return wrap.querySelector("div");
  }

  function clearStreamTimeout() {
    if (_streamTimeout) { clearTimeout(_streamTimeout); _streamTimeout = null; }
  }

  function startStreamTimeout() {
    clearStreamTimeout();
    _streamTimeout = setTimeout(() => {
      const bubble = document.getElementById("chatStreamBubble");
      if (bubble) {
        bubble.removeAttribute("id");
        bubble.innerHTML = `<span class="text-red-500">⚠️ Không nhận được phản hồi, vui lòng thử lại</span>`;
      }
      _isStreaming = false;
      setInputEnabled(true);
    }, STREAM_TIMEOUT_MS);
  }

  function setInputEnabled(enabled) {
    const input = document.getElementById("chatInput");
    const btn = document.getElementById("chatSendBtn");
    if (input) input.disabled = !enabled;
    if (btn) btn.disabled = !enabled;
  }

  async function loadHistory() {
    const list = document.getElementById("chatMessages");
    if (!list) return;
    list.innerHTML = `<p class="text-center text-gray-300 text-[11px] py-3">Đang tải...</p>`;
    try {
      const r = await fetch(`/api/chat/history?story_id=${_storyId}`, {
        credentials: "include",
      });
      if (!r.ok) { list.innerHTML = ""; return; }
      const { messages } = await r.json();
      list.innerHTML = "";
      if (!messages.length) {
        list.innerHTML = `<p class="text-center text-gray-300 text-[11px] py-3 italic">Hỏi bất cứ điều gì về truyện này!</p>`;
        return;
      }
      messages.forEach((m) => appendMessage(m.role, m.content));
    } catch {
      list.innerHTML = "";
    }
  }

  function bindSocketEvents() {
    _socket = getOrCreateSocket();
    if (!_socket) return;

    _socket.off("chatChunk");
    _socket.off("chatDone");
    _socket.off("chatError");

    _socket.on("chatChunk", ({ chunk }) => {
      startStreamTimeout(); // reset timeout mỗi khi có dữ liệu
      const bubble = document.getElementById("chatStreamBubble");
      if (!bubble) return;
      const cursor = bubble.querySelector("span");
      if (cursor) {
        cursor.insertAdjacentText("beforebegin", chunk);
      } else {
        bubble.textContent += chunk;
      }
      const list = document.getElementById("chatMessages");
      if (list) list.scrollTop = list.scrollHeight;
    });

    _socket.on("chatDone", () => {
      clearStreamTimeout();
      const bubble = document.getElementById("chatStreamBubble");
      if (bubble) {
        bubble.removeAttribute("id");
        const cursor = bubble.querySelector("span");
        if (cursor) cursor.remove();
      }
      _isStreaming = false;
      setInputEnabled(true);
      const input = document.getElementById("chatInput");
      if (input) input.focus();
    });

    _socket.on("chatError", ({ message }) => {
      clearStreamTimeout();
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

    input.value = "";
    appendMessage("user", msg);
    appendMessage("assistant", "", true);

    _isStreaming = true;
    setInputEnabled(false);
    startStreamTimeout();
    _socket.emit("chatMessage", { storyId: _storyId, message: msg });
  }

  async function clearHistory() {
    if (!window.showConfirm) {
      if (!confirm("Xóa toàn bộ lịch sử chat?")) return;
    } else {
      const ok = await window.showConfirm("Xóa toàn bộ lịch sử chat?", "Xác nhận");
      if (!ok) return;
    }
    try {
      const r = await fetch(`/api/chat/history?story_id=${_storyId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error();
      const list = document.getElementById("chatMessages");
      if (list) list.innerHTML = `<p class="text-center text-gray-300 text-[11px] py-3 italic">Hỏi bất cứ điều gì về truyện này!</p>`;
    } catch {
      appendMessage("assistant", "⚠️ Không thể xóa lịch sử, vui lòng thử lại");
    }
  }

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
      });

    }
  }

  function ensureSocketIO(cb) {
    if (window.io) { cb(); return; }
    const s = document.createElement("script");
    s.src = "/socket.io/socket.io.js";
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  window.initChatWidget = function ({ storyId }) {
    if (_initialized) return;
    _initialized = true;
    _storyId = storyId;

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
      window.addEventListener('headerReady', afterHeaderReady, { once: true });
      setTimeout(afterHeaderReady, 4000); // fallback nếu header không fire event
    }
  };
})();
