// backend/routes/userRoutes.js
// Đăng ký
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');


// Đăng ký người dùng mới
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Kiểm tra trùng email
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'Email đã tồn tại!' });
    }

    // Mã hoá mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Lưu vào DB
    await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3)',
      [username, email, hashedPassword]
    );

    res.status(201).json({ message: 'Đăng ký thành công!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server!' });
  }
});


// Đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu!' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu!' });
    }

     req.session.userId = user.id; //Lưu session
     req.session.role = user.role; // Lưu role
    res.json({ 
      message: 'Đăng nhập thành công!',
      role: user.role,
      id: user.id,
     });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

// Đăng xuất
router.get('/logout', (req, res) => {
  // Xóa session
  req.session.destroy(err => {
    if (err) {
      console.log(err);
      return res.status(500).send('Lỗi khi đăng xuất');
    }
    // Redirect về trang index
    res.redirect('/');
  });
});

// Lấy thông tin người dùng
router.get('/info', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const user = await pool.query('SELECT username, email, avatar_url FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    //const favorites = await db.query('SELECT title, author, image FROM favorites WHERE user_id = $1', [userId]);

    res.json({
      username: user.rows[0].username,
      email: user.rows[0].email,
      avatar_url: user.rows[0].avatar_url,
      //favorites: favorites.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Nơi lưu ảnh
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });
 // Tải avt
router.post('/upload-avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(403).json({ message: 'Bạn cần đăng nhập để tải ảnh đại diện' });
    }

    const filePath = `/uploads/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [filePath, req.session.userId]);

    res.json({ message: 'Cập nhật ảnh đại diện thành công', avatar_url: filePath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi khi tải ảnh đại diện' });
  }
});

module.exports = router;

