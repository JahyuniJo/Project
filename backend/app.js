// backend/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const userRoutes = require('./routers/userRoutes'); // Gửi yêu cầu request API sang file userRoutes.js
const storyRoutes = require("./routers/storyRoutes");
const session = require('express-session');
const app = express();
// Tạo session
app.use(
  session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: false, // Phải có nếu chưa dùng giao thức https
      maxAge: 1000*60*60*24,

     } 
  })
);

app.use(cors());
app.use(bodyParser.json());
// Bảo vệ index2.html chỉ đăng nhập mới vào được
app.get('/index2.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '../frontend/private/index2.html'));
});

app.get('/admin.html', (req,res) =>{
  if(!req.session.userId || req.session.role !== 'admin'){
    return res.status(403).send('Bạn không có quyền truy cập trang này');
  }
  res.sendFile(path.join(__dirname, '../frontend/private/admin.html'));
});
app.get('/info.html', (req,res) =>{
  if(!req.session.userId){
    return res.status(403).send('Bạn không có quyền truy cập trang này');
  }
  res.sendFile(path.join(__dirname, '../frontend/private/info.html'));
});
app.get('/stories.html', (req,res) =>{
  if(req.session.role !== 'admin'){
    return res.status(403).send('Bạn không có quyền truy cập trang này');
  }
  res.sendFile(path.join(__dirname, '../frontend/private/stories.html'));
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
const PORT = 3000;
app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
