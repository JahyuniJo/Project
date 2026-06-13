(function () {
  const MAX_VISUAL_DEPTH = 3;
  const MAX_COMMENT_LENGTH = 2000;

  function $(selector) {
    return selector ? document.querySelector(selector) : null;
  }

  function text(value, fallback = "") {
    return value === null || value === undefined ? fallback : String(value);
  }

  function showMessage(type, message, title) {
    window.showAlert(type, message, title || "Thông báo");
  }

  async function confirmAction(message, title) {
    return window.showConfirm(message, title || "Xác nhận");
  }

  async function requestJSON(url, options = {}) {
    const { headers = {}, ...rest } = options;

    const res = await fetch(url, {
      credentials: "include",
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    });

    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }

    if (!res.ok) {
      const message = data?.message || "Không thể xử lý yêu cầu";
      throw new Error(message);
    }

    return data;
  }

  function formatTime(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function findComment(comments, commentId) {
    for (const comment of comments) {
      if (comment.id === commentId) return comment;

      const found = findComment(comment.replies || [], commentId);
      if (found) return found;
    }

    return null;
  }

  // Trả về mảng id của các comment cha cần mở để nhìn thấy targetId
  function findPathToComment(comments, targetId, path = []) {
    for (const comment of comments) {
      if (comment.id === targetId) return path;
      if (comment.replies?.length) {
        const found = findPathToComment(comment.replies, targetId, [...path, comment.id]);
        if (found !== null) return found;
      }
    }
    return null;
  }

  function getHashCommentId() {
    const match = window.location.hash.match(/^#comment-(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function scrollToComment(commentId) {
    const el = document.getElementById(`comment-${commentId}`);
    if (!el) return;
    const header = document.querySelector("header");
    const offset = (header ? header.offsetHeight : 0) + 24;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }

  function highlightComment(commentId) {
    scrollToComment(commentId);
    const el = document.getElementById(`comment-${commentId}`);
    if (!el) return;
    el.classList.add("ring-2", "ring-indigo-400", "rounded-xl");
    setTimeout(() => el.classList.remove("ring-2", "ring-indigo-400", "rounded-xl"), 3000);
  }

  function makeButton(label, action, commentId, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.commentAction = action;
    button.dataset.commentId = String(commentId);
    button.className = className;
    return button;
  }

  function createAvatar(comment) {
    const avatar = document.createElement("img");
    avatar.src = comment.avatar_url || "/assets/images/Logo.png";
    avatar.alt = text(comment.username, "User");
    avatar.className = "w-10 h-10 rounded-full object-cover flex-shrink-0";
    return avatar;
  }

  function renderMenu(comment, options) {
    if (!options.enableMenu || !options.state.currentUserId) return null;

    const wrap = document.createElement("div");
    wrap.className = "relative";

    const trigger = makeButton("...", "toggle-menu", comment.id, "text-gray-500 hover:text-gray-800 px-2 py-1 rounded-full hover:bg-gray-200");
    trigger.setAttribute("aria-label", "Mở tùy chọn bình luận");
    wrap.appendChild(trigger);

    const menu = document.createElement("div");
    menu.id = `comment-menu-${comment.id}`;
    menu.className = "hidden absolute right-0 top-7 min-w-32 bg-white rounded-lg shadow-lg z-50 overflow-hidden border border-gray-100";
    wrap.appendChild(menu);

    if (comment.canEdit) {
      menu.appendChild(makeButton("Chỉnh sửa", "edit", comment.id, "block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"));
    }

    if (comment.canDelete) {
      menu.appendChild(makeButton("Xóa", "delete", comment.id, "block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-red-600"));
    }

    if (comment.canHide && !comment.canDelete) {
      menu.appendChild(makeButton("Ẩn bình luận", "hide", comment.id, "block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"));
    }

    return menu.childElementCount ? wrap : null;
  }

  function renderReplyBox(comment) {
    const box = document.createElement("div");
    box.id = `replyBox-${comment.id}`;
    box.className = "hidden ml-14 mt-2";

    const input = document.createElement("textarea");
    input.id = `replyInput-${comment.id}`;
    input.className = "w-full border rounded-lg p-2 text-sm focus:ring focus:ring-indigo-300 outline-none";
    input.placeholder = "Viết phản hồi...";
    input.rows = 2;
    input.maxLength = MAX_COMMENT_LENGTH;
    box.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "mt-2 flex gap-2 justify-end";
    box.appendChild(actions);

    actions.appendChild(makeButton("Hủy", "cancel-reply", comment.id, "px-3 py-1 rounded text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"));
    actions.appendChild(makeButton("Gửi", "send-reply", comment.id, "px-3 py-1 rounded text-sm bg-indigo-600 text-white hover:bg-indigo-700"));

    return box;
  }

  function renderComment(comment, level, options) {
    const state = options.state;
    const visualLevel = Math.min(level, MAX_VISUAL_DEPTH);
    const hasReplies = Array.isArray(comment.replies) && comment.replies.length > 0;

    const item = document.createElement("article");
    item.id = `comment-${comment.id}`;
    item.dataset.commentId = String(comment.id);
    item.className = [
      "comment-item mt-4",
      visualLevel ? "ml-8 sm:ml-10 border-l border-gray-200 pl-4" : ""
    ].filter(Boolean).join(" ");

    const row = document.createElement("div");
    row.className = "flex items-start gap-3";
    item.appendChild(row);

    row.appendChild(createAvatar(comment));

    const bodyWrap = document.createElement("div");
    bodyWrap.className = "min-w-0 flex-1";
    row.appendChild(bodyWrap);

    const headerLine = document.createElement("div");
    headerLine.className = "flex items-start gap-2";
    bodyWrap.appendChild(headerLine);

    const bubble = document.createElement("div");
    bubble.className = "comment-bubble bg-gray-100 rounded-xl px-4 py-3 max-w-full inline-block";
    headerLine.appendChild(bubble);

    const name = document.createElement("p");
    name.className = "font-semibold text-indigo-700 leading-tight";
    name.textContent = text(comment.username, "Người dùng");
    bubble.appendChild(name);

    const content = document.createElement("p");
    content.className = "comment-content text-gray-900 mt-1 break-words whitespace-pre-wrap";
    content.textContent = text(comment.content);
    bubble.appendChild(content);

    const meta = document.createElement("p");
    meta.className = "text-xs text-gray-500 mt-1";
    meta.textContent = formatTime(comment.created_at);
    bubble.appendChild(meta);

    const menu = renderMenu(comment, options);
    if (menu) headerLine.appendChild(menu);

    const actions = document.createElement("div");
    actions.className = "flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mt-1 ml-2";
    bodyWrap.appendChild(actions);

    if (state.currentUserId) {
      const liked = comment.likedByMe || comment.liked_by_me;
      const like = makeButton(
        `${liked ? "Đã thích" : "Thích"} (${comment.likes || 0})`,
        "like",
        comment.id,
        liked ? "font-medium text-indigo-600 hover:text-indigo-800" : "hover:text-indigo-600"
      );
      actions.appendChild(like);

      actions.appendChild(makeButton("Trả lời", "reply", comment.id, "hover:text-indigo-600"));
    } else {
      const hint = document.createElement("span");
      hint.className = "italic text-gray-400";
      hint.textContent = "Đăng nhập để tương tác";
      actions.appendChild(hint);
    }

    if (hasReplies) {
      const open = state.openReplies.has(comment.id);
      const toggle = makeButton(
        `${open ? "Ẩn" : "Xem"} ${comment.replyCount || comment.replies.length} phản hồi`,
        "toggle-replies",
        comment.id,
        "font-medium hover:text-indigo-600"
      );
      actions.appendChild(toggle);
    }

    if (state.currentUserId) {
      bodyWrap.appendChild(renderReplyBox(comment));
    }

    if (hasReplies) {
      const replies = document.createElement("div");
      replies.id = `replies-${comment.id}`;
      replies.className = `mt-3 ${state.openReplies.has(comment.id) ? "" : "hidden"}`;

      comment.replies.forEach((reply) => {
        replies.appendChild(renderComment(reply, level + 1, options));
      });

      bodyWrap.appendChild(replies);
    }

    return item;
  }

  function renderEditForm(comment, bubble) {
    bubble.textContent = "";

    const input = document.createElement("textarea");
    input.id = `editInput-${comment.id}`;
    input.className = "w-full border rounded-lg p-2 text-sm focus:ring focus:ring-indigo-300 outline-none";
    input.rows = 3;
    input.maxLength = MAX_COMMENT_LENGTH;
    input.value = text(comment.content);
    bubble.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "flex gap-2 mt-2 justify-end";
    bubble.appendChild(actions);

    actions.appendChild(makeButton("Hủy", "cancel-edit", comment.id, "px-3 py-1 bg-gray-300 rounded text-sm"));
    actions.appendChild(makeButton("Lưu", "save-edit", comment.id, "px-3 py-1 bg-indigo-600 text-white rounded text-sm"));

    input.focus();
  }

  function initCommentSection(config = {}) {
    const list = $(config.listSelector || "#commentList");
    const input = $(config.inputSelector || "#commentInput");
    const submit = $(config.submitSelector || "#sendComment");
    const loginHint = $(config.loginHintSelector || "#loginHint");

    if (!list) return;

    const state = {
      comments: [],
      currentUserId: null,
      openReplies: new Set()
    };

    const options = {
      enableMenu: config.enableMenu !== false,
      state
    };

    function getStoryId() {
      return typeof config.storyId === "function" ? config.storyId() : config.storyId;
    }

    function setComposerState() {
      const loggedIn = !!state.currentUserId;

      if (input) input.classList.toggle("hidden", !loggedIn);
      if (submit) submit.classList.toggle("hidden", !loggedIn);
      if (loginHint) loginHint.classList.toggle("hidden", loggedIn);
    }

    function render() {
      list.textContent = "";

      if (!state.comments.length) {
        const empty = document.createElement("p");
        empty.className = "text-gray-500 italic";
        empty.textContent = config.emptyMessage || "Chưa có bình luận nào";
        list.appendChild(empty);
        return;
      }

      state.comments.forEach((comment) => {
        list.appendChild(renderComment(comment, 0, options));
      });
    }

    async function loadComments() {
      const storyId = getStoryId();
      if (!storyId) return;

      try {
        const data = await requestJSON(`/api/comments?story_id=${encodeURIComponent(storyId)}`, {
          method: "GET"
        });

        state.currentUserId = data.currentUserId || null;
        state.comments = Array.isArray(data.comments) ? data.comments : [];
        setComposerState();

        // Mở replies cha trước khi render để comment đích hiện ra ngay
        const hashId = getHashCommentId();
        if (hashId !== null) {
          const path = findPathToComment(state.comments, hashId);
          path?.forEach(id => state.openReplies.add(id));
        }

        render();

        if (hashId !== null) {
          // Lần 1: scroll + highlight ngay sau render
          requestAnimationFrame(() => requestAnimationFrame(() => highlightComment(hashId)));
          // Lần 2: scroll lại sau khi ảnh đã load xong (không highlight lại)
          setTimeout(() => scrollToComment(hashId), 100);
        }
      } catch (err) {
        console.error("Load comments error:", err);
        showMessage("error", err.message || "Không thể tải bình luận", "Lỗi");
      }
    }

    async function submitComment(parentId = null) {
      const storyId = getStoryId();
      const source = parentId ? document.getElementById(`replyInput-${parentId}`) : input;
      const content = source?.value.trim() || "";

      if (!content) {
        showMessage("warning", "Vui lòng nhập nội dung bình luận", "Cần nội dung");
        return;
      }

      if (content.length > MAX_COMMENT_LENGTH) {
        showMessage("warning", `Bình luận tối đa ${MAX_COMMENT_LENGTH} ký tự`, "Quá dài");
        return;
      }

      try {
        await requestJSON("/api/comments", {
          method: "POST",
          body: JSON.stringify({
            story_id: storyId,
            parent_id: parentId,
            content
          })
        });

        if (source) source.value = "";
        if (parentId) state.openReplies.add(parentId);
        await loadComments();
      } catch (err) {
        showMessage("error", err.message, "Lỗi");
      }
    }

    async function likeComment(commentId) {
      try {
        const data = await requestJSON("/api/comments/like", {
          method: "POST",
          body: JSON.stringify({ comment_id: commentId })
        });

        const comment = findComment(state.comments, commentId);
        if (comment) {
          comment.likes = data.likes;
          comment.likedByMe = data.liked;
          render();
        } else {
          await loadComments();
        }
      } catch (err) {
        showMessage("warning", err.message, "Thông báo");
      }
    }

    async function saveEdit(commentId) {
      const inputEl = document.getElementById(`editInput-${commentId}`);
      const content = inputEl?.value.trim() || "";

      if (!content) {
        showMessage("warning", "Nội dung không được để trống", "Cần nội dung");
        return;
      }

      try {
        await requestJSON("/api/comments", {
          method: "PUT",
          body: JSON.stringify({
            comment_id: commentId,
            content
          })
        });

        showMessage("success", "Cập nhật comment thành công", "Thành công");
        await loadComments();
      } catch (err) {
        showMessage("error", err.message, "Lỗi");
      }
    }

    async function deleteComment(commentId) {
      const ok = await confirmAction("Bạn có chắc muốn xóa bình luận này? Các phản hồi bên trong cũng sẽ bị xóa.", "Xác nhận");
      if (!ok) return;

      try {
        await requestJSON("/api/comments", {
          method: "DELETE",
          body: JSON.stringify({ comment_id: commentId })
        });

        showMessage("success", "Xóa comment thành công", "Thành công");
        await loadComments();
      } catch (err) {
        showMessage("error", err.message, "Lỗi");
      }
    }

    function hideComment(commentId) {
      const item = document.getElementById(`comment-${commentId}`);
      if (!item) return;

      item.style.transition = "opacity .2s";
      item.style.opacity = "0";
      setTimeout(() => item.remove(), 200);
    }

    function closeMenus() {
      list.querySelectorAll("[id^='comment-menu-']").forEach((menu) => {
        menu.classList.add("hidden");
      });
    }

    submit?.addEventListener("click", () => submitComment());

    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submitComment();
      }
    });

    list.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-comment-action]");
      if (!button) return;

      const action = button.dataset.commentAction;
      const commentId = Number(button.dataset.commentId);
      const comment = findComment(state.comments, commentId);

      if (action !== "toggle-menu") closeMenus();

      if (action === "toggle-menu") {
        const menu = document.getElementById(`comment-menu-${commentId}`);
        if (!menu) return;
        const wasHidden = menu.classList.contains("hidden");
        closeMenus();
        menu.classList.toggle("hidden", !wasHidden);
        return;
      }

      if (action === "like") return likeComment(commentId);

      if (action === "reply") {
        const box = document.getElementById(`replyBox-${commentId}`);
        const replyInput = document.getElementById(`replyInput-${commentId}`);
        if (!box || !replyInput) return;

        box.classList.toggle("hidden");
        if (!box.classList.contains("hidden")) {
          replyInput.focus();
        }
        return;
      }

      if (action === "cancel-reply") {
        const box = document.getElementById(`replyBox-${commentId}`);
        const replyInput = document.getElementById(`replyInput-${commentId}`);
        if (replyInput) replyInput.value = "";
        if (box) box.classList.add("hidden");
        return;
      }

      if (action === "send-reply") return submitComment(commentId);

      if (action === "toggle-replies") {
        if (state.openReplies.has(commentId)) state.openReplies.delete(commentId);
        else state.openReplies.add(commentId);
        render();
        return;
      }

      if (action === "edit" && comment) {
        const item = document.getElementById(`comment-${commentId}`);
        const bubble = item?.querySelector(".comment-bubble");
        if (bubble) renderEditForm(comment, bubble);
        return;
      }

      if (action === "cancel-edit") {
        render();
        return;
      }

      if (action === "save-edit") return saveEdit(commentId);
      if (action === "delete") return deleteComment(commentId);
      if (action === "hide") return hideComment(commentId);
    });

    document.addEventListener("click", (event) => {
      if (!list.contains(event.target)) closeMenus();
    });

    loadComments();

    return {
      loadComments,
      submitComment
    };
  }

  window.initCommentSection = initCommentSection;
})();
