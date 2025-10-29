const API_URL = "http://localhost:3000/api/users";

const userTableBody = document.getElementById("userTableBody");
const userModal = document.getElementById("userModal");
const modalTitle = document.getElementById("modalTitle");
const userForm = document.getElementById("userForm");
const btnAddUser = document.getElementById("btnAddUser");
const cancelModal = document.getElementById("cancelModal");
const searchInput = document.getElementById("searchInput");
const btnSearch = document.getElementById("btnSearch");

let editingId = null;

// 🧩 Load danh sách người dùng
async function loadUsers(query = "") {
  try {
    const res = await fetch(`${API_URL}?search=${encodeURIComponent(query)}`);
    const data = await res.json();
    renderTable(data.users);
  } catch (err) {
    console.error("❌ Lỗi load users:", err);
  }
}

function renderTable(users = []) {
  userTableBody.innerHTML = users.map(user => `
    <tr>
      <td class="py-3 px-4">${user.iduser}</td>
      <td class="py-3 px-4">${user.username}</td>
      <td class="py-3 px-4">${user.email}</td>
      <td class="py-3 px-4">
        <span class="px-2 py-1 rounded text-sm ${user.role === "admin" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}">
          ${user.role}
        </span>
      </td>
      <td class="py-3 px-4 text-center">
        <button onclick="openEdit(${user.iduser}, '${user.username}', '${user.email}', '${user.role}')" class="text-blue-600 hover:text-blue-800 mx-1"><i class="fa fa-edit"></i></button>
        <button onclick="deleteUser(${user.iduser})" class="text-red-600 hover:text-red-800 mx-1"><i class="fa fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

// ➕ Mở modal thêm mới
btnAddUser.onclick = () => {
  editingId = null;
  modalTitle.textContent = "Thêm người dùng";
  userForm.reset();
  userModal.classList.remove("hidden");
  userModal.classList.add("flex");
};

// ✏️ Mở modal chỉnh sửa
function openEdit(id, username, email, role) {
  editingId = id;
  modalTitle.textContent = "Chỉnh sửa người dùng";
  document.getElementById("userId").value = id;
  document.getElementById("username").value = username;
  document.getElementById("email").value = email;
  document.getElementById("password").value = "";
  document.getElementById("role").value = role;
  userModal.classList.remove("hidden");
  userModal.classList.add("flex");
}

// 🗑️ Xóa người dùng
async function deleteUser(id) {
  if (!confirm("Bạn có chắc muốn xóa người dùng này?")) return;
  try {
    const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
    if (res.ok) {
      alert("Đã xóa người dùng!");
      loadUsers();
    }
  } catch (err) {
    console.error("❌ Lỗi xóa người dùng:", err);
  }
}

// 💾 Submit form (thêm/sửa)
userForm.onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const role = document.getElementById("role").value;

  try {
    const body = editingId
      ? { username, email, role }
      : { username, email, password, role };

    const res = await fetch(editingId ? `${API_URL}/${editingId}` : API_URL, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      userModal.classList.add("hidden");
      alert(editingId ? "Đã cập nhật người dùng" : "Đã thêm người dùng mới");
      loadUsers();
    }
  } catch (err) {
    console.error("❌ Lỗi lưu người dùng:", err);
  }
};

// 🔍 Tìm kiếm
btnSearch.onclick = () => loadUsers(searchInput.value.trim());

// ❌ Đóng modal
cancelModal.onclick = () => {
  userModal.classList.add("hidden");
};

// 🚀 Load lần đầu
loadUsers();
