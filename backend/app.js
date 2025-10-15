// backend/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const userRoutes = require('./routers/userRoutes'); // Gửi yêu cầu request API sang file userRoutes.js
const session = require('express-session');
const app = express();
// Tạo session
app.use(
  session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
    ookie: { secure: false } // Phải có nếu chưa dùng giao thức https
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
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use('/components', express.static(path.join(__dirname, '../frontend/src/components')));

// 🟢 Route chính: hiển thị index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});


// Routes
app.use('/api/users', userRoutes);
const PORT = 5000;
app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
