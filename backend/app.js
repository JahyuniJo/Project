const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = express();
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_DIR = path.join(__dirname, "../frontend");
const PUBLIC_PAGES_DIR = path.join(FRONTEND_DIR, "pages/public");
const PRIVATE_PAGES_DIR = path.join(FRONTEND_DIR, "pages/private");
const ASSETS_DIR = path.join(FRONTEND_DIR, "assets");
const COMPONENTS_DIR = path.join(FRONTEND_DIR, "components");

// ========== HTTP + SOCKET ==========
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Lưu socket theo email
const userSockets = {};

// ========== MIDDLEWARE CƠ BẢN ==========
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ========== GẮN SOCKET VÀO REQUEST (ĐÚNG VỊ TRÍ) ==========
app.use((req, res, next) => {
  req.io = io;
  req.userSockets = userSockets;
  next();
});

// ========== SOCKET LOGIC ==========
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("registerEmail", (email) => {
    if (!email) return;
    socket.join(email);
    userSockets[email] = socket.id;
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// ========== AUTHENTICATE HTML ==========
const authenticateHTML = (allowedRoles = []) => (req, res, next) => {
  const token = req.cookies.authToken;
  if (!token) return res.redirect("/");

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      res.clearCookie("authToken");
      return res.redirect("/");
    }

    req.user = user;
    if (allowedRoles.length && !allowedRoles.includes(user.role)) {
      return res.status(403).send("Bạn không có quyền truy cập");
    }
    next();
  });
};

// ========== HTML ROUTES ==========
// // Bảo vệ index2.html chỉ đăng nhập mới vào được
app.get('/index2.html', authenticateHTML(), (req, res) => {
    res.sendFile(path.join(PRIVATE_PAGES_DIR, 'index2.html'));
});

// admin.html (Chỉ dành cho admin)
app.get('/admin.html', authenticateHTML(['admin']), (req, res) => {
  res.sendFile(path.join(PRIVATE_PAGES_DIR, 'admin.html'));
});
// info.html (Dành cho người dùng đã đăng nhập)
app.get('/info.html', authenticateHTML(), (req, res) => {
  res.sendFile(path.join(PRIVATE_PAGES_DIR, 'info.html'));
});
// stories.html (Chỉ dành cho admin)
app.get('/stories.html', authenticateHTML(['admin']), (req, res) => {
  res.sendFile(path.join(PRIVATE_PAGES_DIR, 'stories.html'));
});
// user.html (Chỉ dành cho admin)
app.get('/user.html', authenticateHTML(['admin']), (req, res) => {
  res.sendFile(path.join(PRIVATE_PAGES_DIR, 'user.html'));
});
app.get('/read2.html', authenticateHTML(['user']), (req, res) => {
  res.sendFile(path.join(PRIVATE_PAGES_DIR, 'read2.html'));
});
app.get('/fav.html', authenticateHTML(['user']), (req, res) => {
  res.sendFile(path.join(PRIVATE_PAGES_DIR, 'fav.html'));
});
app.get('/error-report.html', authenticateHTML(['user']), (req, res) => {
  res.sendFile(path.join(PRIVATE_PAGES_DIR, 'error-report.html'));
});
app.get('/admin-report.html', authenticateHTML(['admin']), (req, res) => {
  res.sendFile(path.join(PRIVATE_PAGES_DIR, 'admin-report.html'));
});
// stat.html (Chỉ dành cho admin)
app.get('/stat.html', authenticateHTML(['admin']), (req, res) => {
  res.sendFile(path.join(PRIVATE_PAGES_DIR, 'stat.html'));
});
// 🟢 Route chính: hiển thị index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_PAGES_DIR, 'index.html'));
});


// ========== API ROUTES ==========
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/stories", require("./routes/storyRoutes"));
app.use("/api/usercontroll", require("./routes/usercontrollRoutes"));
app.use("/api/stat", require("./routes/statRoutes"));
app.use("/api/favlists", require("./routes/interaction"));
app.use("/api/auth", require("./controllers/authController"));
app.use("/api/import", require("./routes/auth"));
app.use("/api/rating", require("./routes/ratingRoutes"));
app.use("/api", require("./routes/report")(io, userSockets));
app.use("/api/comments", require("./routes/commentRoutes")(io, userSockets));
app.use("/api/ai", require("./routes/aiRoutes"));
app.use("/api/recommend", require("./routes/recommendRoutes"));
// ========== STATIC ==========
app.use(express.static(PUBLIC_PAGES_DIR));
app.use("/assets", express.static(ASSETS_DIR));
app.use("/components", express.static(COMPONENTS_DIR));
app.use("/uploads", express.static(path.join(__dirname, "../backend/uploads")));

// ========== START ==========
const PORT = 3000;
server.listen(PORT, () =>
  console.log(`Server chạy tại http://localhost:${PORT}`)
);
