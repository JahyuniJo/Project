const sequelize = require('./config/db');
const Story = require('./models/Story');

// Đồng bộ model với database
sequelize.sync({ alter: true }) // alter: cập nhật bảng nếu có thay đổi
  .then(() => console.log('✅ Database synced (bảng stories đã sẵn sàng)'))
  .catch(err => console.error('❌ Sync error:', err));
