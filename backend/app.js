// backend/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const userRoutes = require('./routers/userRoutes'); // Gửi yêu cầu request API sang file userRoutes.js
const storyRoutes = require("./routers/storyRoutes");
const usercontrollRoutes = require('./routers/usercontrollRoutes'); // Gửi yêu cầu đến adminRoutes (Quán lý người dùng)
const statRoutes = require('./routers/statRoutes');
const favListRouter = require("./routers/interaction");
const jwt = require('jsonwebtoken');
const app = express();
const JWT_SECRET = 'dieu002016';
const cookieParser = require('cookie-parser');


app.use(cors({
  origin: 'http://localhost:3000', // Đảm bảo domain của client
    credentials: true
}));
app.use(bodyParser.json());
app.use(cookieParser());
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
app.get('/admin.html', authenticateHTML(['admin']), (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/admin.html'));
});
// info.html (Dành cho người dùng đã đăng nhập)
app.get('/info.html', authenticateHTML(), (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/info.html'));
});
// stories.html (Chỉ dành cho admin)
app.get('/stories.html', authenticateHTML(['admin']), (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/stories.html'));
});

// user.html (Chỉ dành cho admin)
app.get('/user.html', authenticateHTML(['admin']), (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/user.html'));
});
//
app.get('/read2.html', authenticateHTML(['user']), (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/read2.html'));
});
app.get('/fav.html', authenticateHTML(['user']), (req,res) =>{
    res.sendFile(path.join(__dirname, '../frontend/private/fav.html'));
});
// stat.html (Chỉ dành cho admin)
app.get('/stat.html', authenticateHTML(['admin']), (req,res) =>{
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
const PORT = 3000;
app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
