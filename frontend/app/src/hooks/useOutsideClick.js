import { useEffect } from 'react';

/**
 * Hook gọi `callback` khi người dùng click BÊN NGOÀI element được ref trỏ tới —
 * dùng đóng dropdown/menu/popup khi click ra chỗ khác (NotificationBell,
 * SelectDropdown, menu user...). Nghe `mousedown` trên document và tự gỡ
 * listener khi component unmount.
 * @param {React.RefObject} ref - Ref tới element gốc của popup.
 * @param {Function} callback - Hàm đóng popup.
 */
export default function useOutsideClick(ref, callback) {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) callback();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, callback]);
}
