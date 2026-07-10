import { createContext, useCallback, useContext, useRef, useState } from 'react';
import AlertModal, { ICONS } from '../components/AlertModal';

const AlertContext = createContext(null);

const DEFAULT_TITLES = {
  success: 'Thành công', error: 'Lỗi', info: 'Thông báo', warning: 'Cảnh báo', question: 'Xác nhận',
};

const TOAST_COLORS = {
  success: 'bg-green-600',
  error:   'bg-red-600',
  warning: 'bg-yellow-500 text-gray-900',
  info:    'bg-blue-600',
};

/**
 * AlertProvider — Hệ thống thông báo UI tập trung, thay thế alert()/confirm()
 * mặc định của browser (theo quy tắc dự án: mọi confirm đều phải là popup đẹp).
 *
 * Cung cấp qua useAlert():
 *   - toast(message, type, duration): thông báo nổi góc phải dưới, tự biến mất
 *     sau `duration` ms (mặc định 3s), xếp chồng được nhiều cái.
 *   - showAlert(type, message, title): modal chỉ có nút OK → Promise resolve
 *     khi người dùng bấm.
 *   - confirm(message, title): modal OK + Hủy → Promise<boolean> — dùng như
 *     `if (await confirm('Xóa truyện này?')) ...`.
 *
 * resolveRef giữ hàm resolve của Promise đang chờ; handleOk/handleCancel
 * resolve true/false rồi đóng modal.
 */
export function AlertProvider({ children }) {
  const [modal, setModal] = useState({ open: false });
  const [toasts, setToasts] = useState([]);
  const resolveRef = useRef(null);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const toast = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  // ── Alert (chỉ OK) ─────────────────────────────────────────────────────────
  const showAlert = useCallback((type = 'info', message = '', title = '') => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({ open: true, type, message, title: title || DEFAULT_TITLES[type], hasCancel: false });
    });
  }, []);

  // ── Confirm (OK + Hủy) → Promise<boolean> ─────────────────────────────────
  const confirm = useCallback((message, title = 'Xác nhận') => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({ open: true, type: 'question', message, title, hasCancel: true });
    });
  }, []);

  const handleOk = () => {
    resolveRef.current?.(true);
    setModal({ open: false });
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    setModal({ open: false });
  };

  return (
    <AlertContext.Provider value={{ toast, confirm, showAlert }}>
      {children}

      <AlertModal modal={modal} onOk={handleOk} onCancel={handleCancel} />

      {/* ── Toasts ────────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl font-medium text-sm text-white
                        animate-in fade-in slide-in-from-bottom-2 duration-300 ${TOAST_COLORS[t.type] || TOAST_COLORS.success}`}
          >
            <i className={`fa-solid ${ICONS[t.type]?.cls || ICONS.success.cls} text-lg`}></i>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </AlertContext.Provider>
  );
}

export const useAlert = () => useContext(AlertContext);
// Alias riêng lẻ để dùng như useConfirm() giống design cũ
export const useConfirm = () => useContext(AlertContext).confirm;
