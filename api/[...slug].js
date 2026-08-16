'use strict';

// Vercel catch-all 函数：处理所有 /api/* 请求，保留原始路径给 Express 内部路由。
const createApp = require('../server/app');

module.exports = createApp();
