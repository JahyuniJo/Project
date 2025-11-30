// backend/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const app = express();
require('dotenv').config({path: path.join(__dirname, '../.env')});
const JWT_SECRET = process.env.JWT_SECRET
const cookieParser = require('cookie-parser');
// Routers
const userRoutes = require('./routers/userRoutes'); // Gửi yêu cầu request API sang file userRoutes.js
const storyRoutes = require("./routers/storyRoutes");
const usercontrollRoutes = require('./routers/usercontrollRoutes'); // Gửi yêu cầu đến adminRoutes (Quán lý người dùng)
const statRoutes = require('./routers/statRoutes');
const favListRouter = require("./routers/interaction");
const authRoutes = require("./routers/auth");
// Tạo server HTTP và tích hợp Socket.io
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server);
const userSockets = {};
const reportRoutes = require("./routers/report")(io, userSockets);

app.use(cors({
  origin: 'http://localhost:3000', // Đảm bảo domain của client
    credentials: true
}));
app.use(bodyParser.json());
app.use(cookieParser());



//Middleware để gắn io và userSockets vào request
app.use((req, res, next) => {
  req.io = io;
  req.userSockets = userSockets;
  next();
});


const authenticateHTML = (allowedRoles = []) => (req, res, next) => {
    // 1. Lấy token từ HttpOnly Cookie
    const token = req.cookies.authToken;

    if (!token) {
        // Nếu không có token, chuyển hướng về trang chủ/đăng nhập
        return res.redirect('/');
    }

    // 2. Xác thực token
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            // Token không hợp lệ/hết hạn
            res.clearCookie('authToken'); // Xóa cookie không hợp lệ
            return res.redirect('/');
        }

        // Token hợp lệ, gắn thông tin người dùng vào request
        req.user = user; // user = { userId: ..., role: ... }

        // 3. Kiểm tra quyền (nếu có allowedRoles)
        if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
            // Nếu không có quyền, trả về lỗi 403
            return res.status(403).send('Bạn không có quyền truy cập trang này');
        }

        next(); // Cho phép truy cập file
    });
  }

// Bảo vệ index2.html chỉ đăng nhập mới vào được
app.get('/index2.html', authenticateHTML(), (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/private/index2.html'));
});

// admin.html (Chỉ dành cho admin)
app.get('/admin.html', (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/admin.html'));
});
// info.html (Dành cho người dùng đã đăng nhập)
app.get('/info.html', authenticateHTML(), (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/info.html'));
});
// stories.html (Chỉ dành cho admin)
app.get('/stories.html', (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/stories.html'));
});

// user.html (Chỉ dành cho admin)
app.get('/user.html', (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/user.html'));
});
//
app.get('/read2.html', authenticateHTML(['user']), (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/read2.html'));
});
app.get('/fav.html', authenticateHTML(['user']), (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/fav.html'));
});
app.get('/error-report.html', authenticateHTML(['user']), (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/error-report.html'));
});
app.get('/admin-report.html', (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/admin-report.html'));
});
// stat.html (Chỉ dành cho admin)
app.get('/stat.html', (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/stat.html'));
});
// 🟢 Route chính: hiển thị index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/stories', storyRoutes);
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use('/components', express.static(path.join(__dirname, '../frontend/src/components')));
app.use('/uploads', express.static(path.join(__dirname, '../backend/uploads')));
app.use('/api/usercontroll', usercontrollRoutes);
app.use('/api/stat', statRoutes);
app.use("/api/favlists", favListRouter);
app.use("/api/auth", require("./controllers/authController"));
app.use("/api", reportRoutes);
app.use("/api/import", authRoutes);
app.use("/api/comments", require("./routers/commentRoutes"));
app.use("/api/rating", require("./routers/ratingRoutes"));

// Socket.IO kết nối
io.on("connection", socket => {
  console.log("New socket connected:", socket.id);

  socket.on("registerEmail", (email) => {
    userSockets[email] = socket.id; // Lưu socketId theo email
    console.log("User registered socket:", email, socket.id);
  });

  socket.on("disconnect", () => {
    // Xóa khỏi userSockets nếu cần
    for (let email in userSockets) {
      if (userSockets[email] === socket.id) delete userSockets[email];
    }
  });
});
const PORT = 3000;
server.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
