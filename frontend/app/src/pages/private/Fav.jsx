import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFavLists, createFavList, renameFavList, deleteFavList, getListStories, removeFromList } from '../../api/favorites';
import { useAlert } from '../../context/AlertContext';

// ── Single story thumbnail inside a list ──────────────────────────────────────
function StoryThumb({ story, onRemoved }) {
  return (
    <div className="relative group bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <Link to={`/read2?id=${story.id}`} className="block">
        <div className="relative h-40 overflow-hidden bg-gray-100">
          <img
            src={story.cover_url || '/assets/images/Logo.png'}
            alt={story.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { e.currentTarget.src = '/assets/images/Logo.png'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          {/* [2] Hover overlay "Xem truyện" */}
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-xs font-medium bg-indigo-600/90 px-3 py-1 rounded-full shadow">
              <i className="fa-solid fa-book-open mr-1" />Xem truyện
            </span>
          </div>
        </div>
        <p className="px-2 py-1.5 text-xs font-medium text-gray-800 line-clamp-2 leading-tight min-h-[2.5rem]">
          {story.title}
        </p>
      </Link>
      <button
        onClick={onRemoved}
        title="Xóa khỏi danh sách"
        className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-md"
      >
        <i className="fa-solid fa-xmark text-xs" />
      </button>
    </div>
  );
}

// ── Single list row (collapsible) ─────────────────────────────────────────────
function ListRow({ list, onDeleted }) {
  const { toast, confirm } = useAlert();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(list.name);
  const inputRef = useRef(null);

  const { data: stories = [], isLoading: loadingStories } = useQuery({
    queryKey: ['fav-stories', list.id],
    queryFn: () => getListStories(list.id),
    enabled: open,
  });

  const { mutate: doRename } = useMutation({
    mutationFn: () => renameFavList(list.id, nameVal.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['favlists'] }); toast('Đã đổi tên danh sách!', 'success'); },
    onError: (err) => { toast(err.message || 'Không thể đổi tên!', 'error'); setNameVal(list.name); },
  });

  const { mutate: doRemove } = useMutation({
    mutationFn: (storyId) => removeFromList(list.id, storyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fav-stories', list.id] });
      qc.invalidateQueries({ queryKey: ['favlists'] });
      toast('Đã xóa truyện khỏi danh sách!', 'success');
    },
    onError: () => toast('Không thể xóa truyện', 'error'),
  });

  const startRename = (e) => {
    e.stopPropagation();
    setRenaming(true);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50);
  };

  const finishRename = () => {
    setRenaming(false);
    const trimmed = nameVal.trim();
    if (!trimmed || trimmed === list.name) { setNameVal(list.name); return; }
    doRename();
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    const ok = await confirm('Bạn có chắc muốn xóa danh sách này?', 'Xác nhận');
    if (ok) onDeleted(list.id);
  };

  const handleRemoveStory = async (storyId) => {
    const ok = await confirm('Xóa truyện khỏi danh sách?', 'Xác nhận');
    if (ok) doRemove(storyId);
  };

  return (
    // [4] White card với left accent border thay vì bg-indigo-50
    <div className="bg-white border border-gray-200 border-l-4 border-l-indigo-500 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition">
      <div
        className="flex justify-between items-center cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0" onDoubleClick={startRename}>
          <i className="fa-solid fa-heart text-pink-500 flex-shrink-0" />
          {renaming ? (
            <input
              ref={inputRef}
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={finishRename}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur(); }
                if (e.key === 'Escape') { setNameVal(list.name); setRenaming(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              className="border-b-2 border-indigo-400 bg-transparent font-semibold text-gray-800 text-base outline-none px-1 min-w-0 max-w-[200px]"
            />
          ) : (
            <span className="font-semibold text-gray-800 text-base truncate" title="Nhấp đúp để đổi tên">
              {nameVal}
            </span>
          )}
          <span className="flex-shrink-0 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">
            {list.story_count}
          </span>
        </div>

        {/* [1][5] Nút bút chì rõ ràng + trash tách biệt khỏi chevron */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={startRename}
            title="Đổi tên danh sách"
            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
          >
            <i className="fa-solid fa-pen-to-square text-xs" />
          </button>
          <button
            onClick={handleDelete}
            title="Xóa danh sách"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
          >
            <i className="fa-solid fa-trash text-xs" />
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <i className={`fa-solid fa-chevron-down text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {open && (
        <div className="mt-4">
          {loadingStories ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-7 w-7 border-2 border-indigo-400 border-t-transparent" />
            </div>
          ) : stories.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Danh sách này chưa có truyện nào.</p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {stories.map((s) => (
                <StoryThumb
                  key={s.id}
                  story={s}
                  onRemoved={() => handleRemoveStory(s.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Fav() {
  const { toast } = useAlert();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['favlists'],
    queryFn: getFavLists,
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: (id) => deleteFavList(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['favlists'] }); toast('Đã xóa danh sách!', 'success'); },
    onError: (err) => toast(err.message || 'Không thể xóa', 'error'),
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { toast('Vui lòng nhập tên danh sách!', 'warning'); return; }
    setCreating(true);
    try {
      await createFavList(name);
      setNewName('');
      qc.invalidateQueries({ queryKey: ['favlists'] });
      toast('Đã tạo danh sách yêu thích!', 'success');
    } catch (err) {
      toast(err.message || 'Không thể tạo danh sách!', 'error');
    } finally { setCreating(false); }
  };

  // [3] Tổng số truyện trên tất cả danh sách
  const totalStories = lists.reduce((sum, l) => sum + (l.story_count || 0), 0);

  return (
    <main className="flex-grow container mx-auto py-10 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-6">

        {/* [3] Header với tổng số */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Danh sách yêu thích</h2>
          {lists.length > 0 && (
            <span className="text-sm text-gray-400">
              {lists.length} danh sách · {totalStories} truyện
            </span>
          )}
        </div>

        {/* Create form */}
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 mb-8">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nhập tên danh sách (VD: Truyện ngôn tình)"
            className="flex-grow border border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 active:scale-95 transition disabled:opacity-60"
          >
            {creating
              ? <><i className="fa-solid fa-spinner fa-spin mr-1" />Đang tạo...</>
              : <><i className="fa-solid fa-plus mr-1" />Tạo</>
            }
          </button>
        </form>

        {/* List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-gray-100 px-5 py-4 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-2/5" />
              </div>
            ))}
          </div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
              <i className="fa-regular fa-heart text-3xl text-indigo-400" />
            </div>
            <p className="text-gray-600 font-medium">Chưa có danh sách yêu thích nào</p>
            <p className="text-gray-400 text-sm mt-1 mb-4">Hãy tạo danh sách đầu tiên để lưu truyện!</p>
            <Link to="/home" className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm">
              <i className="fa-solid fa-magnifying-glass mr-1" /> Khám phá truyện
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {lists.map((l) => (
              <ListRow key={l.id} list={l} onDeleted={(id) => doDelete(id)} />
            ))}
          </div>
        )}

        {/* [6] Nút quay lại đồng bộ với indigo theme */}
        <div className="mt-8 flex justify-center">
          <Link
            to="/info"
            className="flex items-center gap-2 px-5 py-2 bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-xl hover:bg-indigo-200 transition text-sm"
          >
            <i className="fa-solid fa-user" /> Trang cá nhân
          </Link>
        </div>
      </div>
    </main>
  );
}
