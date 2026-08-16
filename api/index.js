'use strict';

// Vercel Serverless 函数入口：导出 Express app。
// vercel.json 通过 rewrites 把 /api/* 请求转发到本函数。
const createApp = require('../server/app');

module.exports = createApp();
