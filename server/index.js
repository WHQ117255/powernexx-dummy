'use strict';

// 本地启动入口（非 Vercel 环境）：node server/index.js
const createApp = require('./app');

const PORT = process.env.PORT || 3000;

const app = createApp();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dummy 库存系统已启动：http://localhost:${PORT}`);
  console.log(`内网访问：http://<本机IP>:${PORT}`);
});
