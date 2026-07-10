import { useRef, useState } from 'react';
import useOutsideClick from '../hooks/useOutsideClick';

/**
 * SelectDropdown — Custom select dropdown dùng chung toàn dự án, thay cho
 * <select> mặc định để style đồng nhất. Click ra ngoài tự đóng (useOutsideClick);
 * so sánh value bằng String() để chấp nhận cả số lẫn chuỗi.
 *
 * Props:
 *   options:     [{ value, label }]   — danh sách lựa chọn
 *   value:       string | number      — giá trị đang chọn
 *   onChange:    (value) => void      — nhận value trực tiếp (không phải event)
 *   placeholder: string               — hiện khi chưa chọn (default '-- Chọn --')
 *   size:        'md' | 'sm'          — md: form field, sm: inline/compact
 *   className:   string               — override width / margin
 */
export default function SelectDropdown({
  options = [],
  value,
  onChange,
  placeholder = '-- Chọn --',
  size = 'md',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false));

  const current = options.find((o) => String(o.value) === String(value ?? ''));

  const btn = size === 'sm'
    ? 'px-2.5 py-1 text-sm rounded-lg'
    : 'px-4 py-2 text-sm rounded-lg';
  const item = size === 'sm'
    ? 'px-2.5 py-1.5 text-sm'
    : 'px-3 py-1.5 text-sm';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 border transition
          ${open
            ? 'border-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,.12)] bg-indigo-50'
            : 'border-gray-200 bg-white hover:border-indigo-300'}
          ${current ? 'text-gray-700' : 'text-gray-400'}
          ${btn}`}
      >
        <span className="truncate">{current ? current.label : placeholder}</span>
        <i className={`fa-solid fa-chevron-down text-[10px] text-gray-400 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-indigo-100 rounded-xl z-50 shadow-xl">
          <div className="p-1.5 space-y-0.5 max-h-60 overflow-y-auto">
            {options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`${item} rounded-lg cursor-pointer transition-colors
                  ${String(opt.value) === String(value ?? '')
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-700 hover:bg-indigo-50'}`}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
