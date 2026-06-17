import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { getComments, addComment, editComment, deleteComment, likeComment } from '../api/comments';
import useOutsideClick from '../hooks/useOutsideClick';

const MAX_VISUAL_DEPTH = 3;
const MAX_COMMENT_LENGTH = 2000;

function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function Avatar({ src, name }) {
  return (
    <img
      src={src || '/assets/images/Logo.png'}
      alt={name || 'User'}
      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
      onError={(e) => { e.currentTarget.src = '/assets/images/Logo.png'; }}
    />
  );
}

function CommentMenu({ comment, onEdit, onDelete, onHide }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false));

  if (!comment.canEdit && !comment.canDelete && !comment.canHide) return null;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Tùy chọn bình luận"
        className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded-full hover:bg-gray-200 text-sm leading-none"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-7 min-w-[8rem] bg-white rounded-lg shadow-lg z-50 border border-gray-100 overflow-hidden">
          {comment.canEdit && (
            <button
              onClick={() => { setOpen(false); onEdit(); }}
              className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
            >
              Chỉnh sửa
            </button>
          )}
          {comment.canDelete && (
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-red-600"
            >
              Xóa
            </button>
          )}
          {comment.canHide && (
            <button
              onClick={() => { setOpen(false); onHide(); }}
              className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-500"
            >
              Ẩn
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CommentItem({ comment, depth, storyId, openReplies, onToggleReplies }) {
  const { user } = useAuth();
  const { toast, confirm } = useAlert();
  const qc = useQueryClient();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState(comment.content || '');
  const [isHidden, setIsHidden] = useState(false);

  const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);
  const hasReplies = Array.isArray(comment.replies) && comment.replies.length > 0;
  const repliesOpen = openReplies.has(comment.id);
  const liked = comment.likedByMe || comment.liked_by_me;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['comments', storyId] });

  const { mutate: doLike } = useMutation({
    mutationFn: () => likeComment({ comment_id: comment.id }),
    onSuccess: invalidate,
    onError: (err) => toast(err.message, 'warning'),
  });

  const { mutate: doReply, isPending: sendingReply } = useMutation({
    mutationFn: () => addComment({ story_id: storyId, parent_id: comment.id, content: replyText.trim() }),
    onSuccess: () => {
      setReplyOpen(false);
      setReplyText('');
      onToggleReplies(comment.id, true);
      invalidate();
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const { mutate: doEdit, isPending: saving } = useMutation({
    mutationFn: () => editComment({ comment_id: comment.id, content: editText.trim() }),
    onSuccess: () => {
      setEditMode(false);
      invalidate();
      toast('Đã cập nhật bình luận', 'success');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: () => deleteComment({ comment_id: comment.id }),
    onSuccess: () => { invalidate(); toast('Đã xóa bình luận', 'success'); },
    onError: (err) => toast(err.message, 'error'),
  });

  const handleDelete = async () => {
    const ok = await confirm('Bạn có chắc muốn xóa bình luận này? Các phản hồi bên trong cũng sẽ bị xóa.');
    if (ok) doDelete();
  };

  const handleEditStart = () => {
    setEditText(comment.content || '');
    setEditMode(true);
  };

  return (
    <article
      id={`comment-${comment.id}`}
      className={`mt-4 ${visualDepth ? 'ml-8 sm:ml-10 border-l border-gray-200 pl-4' : ''}`}
    >
      <div className="flex items-start gap-3">
        <Avatar src={comment.avatar_url} name={comment.username} />

        <div className="min-w-0 flex-1">
          {/* Bubble or edit form */}
          <div className="flex items-start gap-2">
            {isHidden ? (
              <div className="bg-gray-100 rounded-xl px-4 py-2 inline-flex items-center gap-2 text-sm text-gray-400 italic">
                <span>Bình luận đã bị ẩn</span>
                <button
                  onClick={() => setIsHidden(false)}
                  className="text-indigo-500 hover:underline font-medium not-italic"
                >
                  Hiện
                </button>
              </div>
            ) : editMode ? (
              <div className="flex-1">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  maxLength={MAX_COMMENT_LENGTH}
                  className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                />
                <div className="flex gap-2 mt-2 justify-end">
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={() => { if (editText.trim()) doEdit(); }}
                    disabled={saving || !editText.trim()}
                    className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Lưu
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-gray-100 rounded-xl px-4 py-3 inline-block max-w-full">
                  <p className="font-semibold text-indigo-700 leading-tight">
                    {comment.username || 'Người dùng'}
                  </p>
                  <p className="text-gray-900 mt-1 break-words whitespace-pre-wrap">
                    {comment.content}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{formatTime(comment.created_at)}</p>
                </div>
                <CommentMenu
                  comment={comment}
                  onEdit={handleEditStart}
                  onDelete={handleDelete}
                  onHide={() => setIsHidden(true)}
                />
              </>
            )}
          </div>

          {/* Action row */}
          {!editMode && !isHidden && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mt-1 ml-2">
              {user ? (
                <>
                  <button
                    onClick={() => doLike()}
                    className={`transition ${liked ? 'font-medium text-indigo-600 hover:text-indigo-800' : 'hover:text-indigo-600'}`}
                  >
                    {liked ? 'Đã thích' : 'Thích'} ({comment.likes || 0})
                  </button>
                  <button
                    onClick={() => setReplyOpen((v) => !v)}
                    className="hover:text-indigo-600 transition"
                  >
                    Trả lời
                  </button>
                </>
              ) : (
                <span className="text-xs italic text-gray-400">Đăng nhập để tương tác</span>
              )}
              {hasReplies && (
                <button
                  onClick={() => onToggleReplies(comment.id)}
                  className="font-medium hover:text-indigo-600 transition"
                >
                  {repliesOpen ? 'Ẩn' : 'Xem'} {comment.replyCount || comment.replies.length} phản hồi
                </button>
              )}
            </div>
          )}

          {/* Reply input */}
          {replyOpen && user && !isHidden && (
            <div className="ml-14 mt-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                maxLength={MAX_COMMENT_LENGTH}
                placeholder="Viết phản hồi..."
                className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
              />
              <div className="mt-2 flex gap-2 justify-end">
                <button
                  onClick={() => { setReplyOpen(false); setReplyText(''); }}
                  className="px-3 py-1 rounded text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  Hủy
                </button>
                <button
                  onClick={() => { if (replyText.trim()) doReply(); }}
                  disabled={sendingReply || !replyText.trim()}
                  className="px-3 py-1 rounded text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Gửi
                </button>
              </div>
            </div>
          )}

          {/* Nested replies */}
          {hasReplies && repliesOpen && (
            <div className="mt-3">
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  depth={depth + 1}
                  storyId={storyId}
                  openReplies={openReplies}
                  onToggleReplies={onToggleReplies}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ── Top-level component ───────────────────────────────────────────────────────

export default function CommentTree({ storyId }) {
  const { user } = useAuth();
  const { toast } = useAlert();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [openReplies, setOpenReplies] = useState(new Set());
  const [scrollSignal, setScrollSignal] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['comments', storyId, !!user],
    queryFn: () => getComments(storyId),
    enabled: !!storyId,
  });

  const comments = Array.isArray(data?.comments)
    ? data.comments
    : Array.isArray(data) ? data : [];

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () => addComment({ story_id: storyId, content: text.trim() }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['comments', storyId] });
      toast('Đã gửi bình luận', 'success');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const onToggleReplies = useCallback((id, forceOpen = false) => {
    setOpenReplies((prev) => {
      const next = new Set(prev);
      if (forceOpen) { next.add(id); return next; }
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const scrollTargetRef = useRef(null);

  // Phase 1: when comments load, parse hash, expand parent chain, store scroll target
  useEffect(() => {
    if (!comments.length) return;
    const match = window.location.hash.match(/^#comment-(\d+)$/);
    if (!match) return;
    const targetId = Number(match[1]);

    function findPath(nodes, id, path = []) {
      for (const c of nodes) {
        if (c.id === id) return path;
        if (c.replies?.length) {
          const found = findPath(c.replies, id, [...path, c.id]);
          if (found !== null) return found;
        }
      }
      return null;
    }

    const path = findPath(comments, targetId);
    if (path === null) return;

    scrollTargetRef.current = targetId;

    if (path.length > 0) {
      // Nested reply: expand parent chain → Phase 2 fires via openReplies change
      setOpenReplies((prev) => {
        const next = new Set(prev);
        path.forEach((id) => next.add(id));
        return next;
      });
    } else {
      // Root-level comment: no expansion needed, fire Phase 2 via scrollSignal
      setScrollSignal((v) => v + 1);
    }
  }, [comments]);

  // Phase 2: after DOM is updated (openReplies expanded or scrollSignal bumped), scroll to target
  useEffect(() => {
    const targetId = scrollTargetRef.current;
    if (!targetId) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`comment-${targetId}`);
      if (!el) return;
      scrollTargetRef.current = null;
      const headerOffset = (document.querySelector('header')?.offsetHeight ?? 0) + 24;
      const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-indigo-400', 'rounded-xl');
      setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-400', 'rounded-xl'), 3000);
    }, 0);

    return () => clearTimeout(timer);
  }, [openReplies, scrollSignal]);

  return (
    <div className="bg-white shadow-lg rounded-2xl p-6 mt-6">
      <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
        <i className="fa-solid fa-comments text-indigo-600"></i>
        Bình luận
      </h2>

      {/* Composer */}
      {user ? (
        <div className="mb-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="Viết bình luận... (Ctrl+Enter để gửi)"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) submit();
            }}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          />
          <button
            onClick={() => { if (text.trim()) submit(); }}
            disabled={isPending || !text.trim()}
            className="mt-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {isPending ? 'Đang gửi...' : 'Gửi bình luận'}
          </button>
        </div>
      ) : (
        <Link
          to="/login"
          className="inline-block mb-6 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition"
        >
          Đăng nhập để bình luận
        </Link>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-sm">Đang tải bình luận...</div>
      ) : comments.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4 italic">Chưa có bình luận nào</p>
      ) : (
        <div>
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              depth={0}
              storyId={storyId}
              openReplies={openReplies}
              onToggleReplies={onToggleReplies}
            />
          ))}
        </div>
      )}
    </div>
  );
}
