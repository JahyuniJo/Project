/**
 * Pagination — Thanh phân trang dùng chung: nút Trước/Sau, cửa sổ trượt tối đa
 * 5 nút số quanh trang hiện tại, kèm nút trang 1/trang cuối + dấu "…" khi
 * cửa sổ không chạm biên. Ẩn hoàn toàn khi chỉ có 1 trang.
 *
 * Props:
 *   current - trang hiện tại (1-based).
 *   total   - tổng số trang.
 *   onPage  - callback(page) khi người dùng chọn trang.
 */
export default function Pagination({ current, total, onPage }) {
  if (total <= 1) return null;

  const maxButtons = 5;
  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, current - half);
  let end   = Math.min(total, start + maxButtons - 1);
  if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);

  const btnCls = (active) =>
    `px-3 py-1 text-sm rounded-lg transition ${
      active
        ? 'bg-indigo-600 text-white'
        : 'bg-white text-indigo-600 hover:bg-indigo-100'
    }`;

  const disabledCls =
    'px-3 py-1 text-sm rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed';

  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex flex-wrap justify-center items-center gap-1 sm:gap-2 mt-8">
      {current === 1 ? (
        <span className={disabledCls}>« Trước</span>
      ) : (
        <button onClick={() => onPage(current - 1)} className={btnCls(false)}>
          « Trước
        </button>
      )}

      {start > 1 && (
        <>
          <button onClick={() => onPage(1)} className={btnCls(false)}>1</button>
          {start > 2 && <span className="px-2 text-gray-500">…</span>}
        </>
      )}

      {pages.map((p) => (
        <button key={p} onClick={() => onPage(p)} className={btnCls(p === current)}>
          {p}
        </button>
      ))}

      {end < total && (
        <>
          {end < total - 1 && <span className="px-2 text-gray-500">…</span>}
          <button onClick={() => onPage(total)} className={btnCls(false)}>{total}</button>
        </>
      )}

      {current === total ? (
        <span className={disabledCls}>Sau »</span>
      ) : (
        <button onClick={() => onPage(current + 1)} className={btnCls(false)}>
          Sau »
        </button>
      )}
    </div>
  );
}
