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

document.addEventListener("DOMContentLoaded", loadAlertModal);
