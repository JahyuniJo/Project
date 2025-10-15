// backend/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const userRoutes = require('./routers/userRoutes');

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use('/components', express.static(path.join(__dirname, '../frontend/src/components')));

// 🟢 Route chính: hiển thị index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Routes
app.use('/api/users', userRoutes);
console.log('✅ Server started, routes mounted');

const PORT = 5000;
app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
