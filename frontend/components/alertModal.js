// alertModal.js

// Inject modal nếu chưa có
async function loadAlertModal() {
  if (!document.getElementById("alertModal")) {
    const res = await fetch("/components/alertModal.html");
    const html = await res.text();
    document.body.insertAdjacentHTML("beforeend", html);
    initAlertModal();
  }
}

// Init modal
function initAlertModal() {
  const modal = document.getElementById("alertModal");
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) hideAlert();
  });
}

let alertModalLoaded = false;
async function ensureAlertModal() {
  if (!alertModalLoaded) {
    await loadAlertModal();
    alertModalLoaded = true;
  }
}

// Hiển thị alert đơn giản
async function showAlert(type="info", message="", title="") {
  await ensureAlertModal();

  const modal = document.getElementById("alertModal");
  const icon = document.getElementById("alertIcon");
  const t = document.getElementById("alertTitle");
  const msg = document.getElementById("alertMessage");
  const okBtn = document.getElementById("alertOkBtn");
  const cancelBtn = document.getElementById("alertCancelBtn");

  const icons = {
    success: '<i class="fa-solid fa-circle-check text-green-500"></i>',
    error: '<i class="fa-solid fa-circle-xmark text-red-500"></i>',
    info: '<i class="fa-solid fa-circle-info text-blue-500"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation text-yellow-500"></i>'
  };

  icon.innerHTML = icons[type] || icons.info;
  t.textContent = title || { success:"Thành công", error:"Lỗi", info:"Thông báo", warning:"Cảnh báo"}[type];
  msg.textContent = message;

  okBtn.style.display = "inline-block";
  cancelBtn.style.display = "none";
  okBtn.onclick = hideAlert;

  modal.classList.remove("hidden");
}

// Hiển thị confirm
async function showConfirm(message, title="Thông báo") {
  await ensureAlertModal();

  return new Promise((resolve) => {
    const modal = document.getElementById("alertModal");
    const icon = document.getElementById("alertIcon");
    const t = document.getElementById("alertTitle");
    const msg = document.getElementById("alertMessage");
    const okBtn = document.getElementById("alertOkBtn");
    const cancelBtn = document.getElementById("alertCancelBtn");

    icon.innerHTML = '<i class="fa-solid fa-circle-question text-blue-500"></i>';
    t.textContent = title;
    msg.textContent = message;

    okBtn.style.display = "inline-block";
    cancelBtn.style.display = "inline-block";

    okBtn.onclick = () => { hideAlert(); resolve(true); };
    cancelBtn.onclick = () => { hideAlert(); resolve(false); };

    modal.classList.remove("hidden");
  });
}

function hideAlert() {
  document.getElementById("alertModal")?.classList.add("hidden");
}

// ── Toast (bottom-right, tự ẩn) ──────────────────────────────────────────
let _toastTimer = null;
function showToast(message, type = "success", duration = 3000) {
  let toast = document.getElementById("_sharedToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "_sharedToast";
    document.body.appendChild(toast);
  }

  const cfg = {
    success: { icon: "fa-circle-check",        bg: "bg-green-600" },
    error:   { icon: "fa-circle-xmark",         bg: "bg-red-600"   },
    warning: { icon: "fa-triangle-exclamation", bg: "bg-yellow-500 text-gray-900" },
    info:    { icon: "fa-circle-info",           bg: "bg-blue-600"  },
  };
  const { icon, bg } = cfg[type] || cfg.success;

  toast.className =
    `fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3 ` +
    `rounded-xl shadow-2xl font-medium text-sm text-white transition-all duration-300 pointer-events-none ` +
    `opacity-0 translate-y-2 ${bg}`;
  toast.innerHTML =
    `<i class="fa-solid ${icon} text-lg flex-shrink-0"></i><span>${message}</span>`;

  requestAnimationFrame(() => {
    toast.classList.remove("opacity-0", "translate-y-2");
    toast.classList.add("opacity-100", "translate-y-0");
  });

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add("opacity-0", "translate-y-2");
  }, duration);
}

document.addEventListener("DOMContentLoaded", loadAlertModal);
