/**
 * app.js — Entry point của backend: dựng Express app + HTTP server + Socket.io,
 * mount toàn bộ API routes, serve SPA React đã build và xử lý graceful shutdown.
 * Chạy qua `npm start` (nodemon → node backend/app.js), lắng nghe PORT (mặc định 3001).
 */
const express = require("express");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || `http://localhost:${PORT}`;
const FRONTEND_DIR = path.join(__dirname, "../frontend");
const ASSETS_DIR = path.join(FRONTEND_DIR, "assets");
const SPA_DIST = path.join(__dirname, "../frontend/app/dist");

// ========== HTTP + SOCKET ==========
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Lưu socket theo email
const userSockets = {};

// ========== MIDDLEWARE CƠ BẢN ==========
app.use(cors({
  origin: CORS_ORIGIN,
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
// Realtime notification: client emit `registerEmail` sau khi đăng nhập → socket
// join room theo email. Từ đó server (report.js, commentRoutes.js) chỉ cần
// io.to(email).emit("newNotification", ...) là đến đúng user, kể cả nhiều tab.
io.on("connection", (socket) => {
  socket.on("registerEmail", (email) => {
    if (!email) return;
    socket.join(email);
    userSockets[email] = socket.id;
  });

  socket.on("disconnect", () => {
    for (const [email, id] of Object.entries(userSockets)) {
      if (id === socket.id) { delete userSockets[email]; break; }
    }
  });
});

// ========== API ROUTES ==========
// Mount tất cả router theo prefix /api/*. Các router cần emit realtime
// (report, comments) là factory nhận `io`; chatbot đăng ký socket event
// riêng qua initChat(io).
const { router: chatRouter, adminRouter: adminChatRouter, initChat } = require("./routes/chatRoutes");
initChat(io);
app.use("/api/chat", chatRouter);
app.use("/api/admin/chat", adminChatRouter);

app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/stories", require("./routes/storyRoutes"));
app.use("/api/usercontroll", require("./routes/usercontrollRoutes"));
app.use("/api/stat", require("./routes/statRoutes"));
app.use("/api/favlists", require("./routes/interaction"));
app.use("/api/auth", require("./controllers/authController"));
app.use("/api/import", require("./routes/auth"));
app.use("/api/rating", require("./routes/ratingRoutes"));
app.use("/api", require("./routes/report")(io));
app.use("/api/comments", require("./routes/commentRoutes")(io));
app.use("/api/ai", require("./routes/aiRoutes"));
app.use("/api/recommend", require("./routes/recommendRoutes"));
app.use("/api/chapters", require("./routes/chapterRoutes"));
// ========== STATIC + SPA ==========
// Production: Express serve luôn frontend — build Vite (dist), assets tĩnh
// (logo, favicon) và file upload (avatar, screenshot báo lỗi).
app.use(express.static(SPA_DIST));
app.use("/assets", express.static(ASSETS_DIR));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// SPA catch-all — mọi đường dẫn KHÔNG bắt đầu bằng /api đều trả index.html
// để React Router xử lý phía client (F5 tại /admin/users vẫn hoạt động).
app.get(/^(?!\/api).*/, (req, res) =>
  res.sendFile(path.join(SPA_DIST, "index.html")));

// ========== START ==========
server.listen(PORT, () =>
  console.log(`Server chạy tại cổng :${PORT}`)
);

// ========== GRACEFUL SHUTDOWN ==========
// Đóng HTTP server + connection pool sạch khi container/orchestrator gửi tín hiệu tắt,
// tránh cắt ngang request đang xử lý và để pg pool đóng connection đúng cách.
const pool = require("./config/pool");
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[app] Nhận ${signal} — đang tắt server...`);

  // Ép thoát nếu quá trình đóng bị treo (request không kết thúc)
  const forceExit = setTimeout(() => {
    console.error("[app] Tắt quá hạn — buộc thoát");
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    io.close();
    await pool.end();
    console.log("[app] Đã đóng server và connection pool");
    process.exit(0);
  } catch (err) {
    console.error("[app] Lỗi khi tắt:", err.message);
    process.exit(1);
  }
}

["SIGTERM", "SIGINT"].forEach((sig) => process.on(sig, () => shutdown(sig)));
