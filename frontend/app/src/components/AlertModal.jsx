export const ICONS = {
  success: { cls: 'fa-circle-check',        color: 'text-green-500',  bg: 'bg-green-100'  },
  error:   { cls: 'fa-circle-xmark',         color: 'text-red-500',    bg: 'bg-red-100'    },
  info:    { cls: 'fa-circle-info',           color: 'text-blue-500',   bg: 'bg-blue-100'   },
  warning: { cls: 'fa-triangle-exclamation', color: 'text-yellow-500', bg: 'bg-yellow-100' },
  question:{ cls: 'fa-circle-question',      color: 'text-indigo-500', bg: 'bg-indigo-100' },
};

/**
 * AlertModal — Modal dùng chung cho confirm và alert, do AlertProvider render
 * (component khác dùng qua useAlert(): confirm(), showAlert() — KHÔNG render trực tiếp).
 *
 * Giao diện theo `modal.type` (success/error/info/warning/question — icon + màu
 * từ bảng ICONS, accent bar trên cùng cùng tông). `modal.hasCancel` quyết định
 * hiện 1 nút OK (alert) hay OK + Hủy (confirm). Click nền tối bên ngoài = Hủy.
 */
export default function AlertModal({ modal, onOk, onCancel }) {
  if (!modal.open) return null;

  const icon = ICONS[modal.type] || ICONS.info;

  return (
    <div
      className="fixed inset-0 bg-black/55 backdrop-blur-[2px] flex items-center justify-center z-[200] animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in zoom-in-95 fade-in duration-150">
        {/* Accent bar trên cùng — màu khớp với type */}
        <div className={`h-1 w-full ${icon.bg.replace('bg-', 'bg-').replace('-100', '-400')}`} />

        <div className="p-7">
          <div className="flex flex-col items-center text-center gap-3">
            <div className={`flex items-center justify-center h-14 w-14 rounded-full ${icon.bg}`}>
              <i className={`fa-solid ${icon.cls} ${icon.color} text-2xl`} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{modal.title}</h3>
            {modal.message && (
              <p className="text-sm text-gray-500 leading-relaxed">{modal.message}</p>
            )}
          </div>

          <div className={`mt-6 flex gap-3 ${modal.hasCancel ? 'flex-row' : 'flex-col'}`}>
            {modal.hasCancel && (
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Hủy
              </button>
            )}
            <button
              onClick={onOk}
              className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 active:scale-95 transition"
            >
              {modal.hasCancel ? 'Xác nhận' : 'OK'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
