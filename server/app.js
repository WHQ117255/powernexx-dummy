'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const { initDb, ensureSchema } = require('./db');
const itemsRouter = require('./routes/items');
const uploadRouter = require('./routes/upload').router;
const exportRouter = require('./routes/export');
const transactionsRouter = require('./routes/transactions');

/** 构建 Express app（不含 listen）。本地与 Vercel Serverless 共用。 */
function createApp() {
  initDb(); // 创建连接池（连接串来自 DATABASE_URL）

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // 简单 CORS
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // 惰性建表（幂等，首次 /api 请求时执行）
  let schemaReady = null;
  app.use('/api', async (req, res, next) => {
    try {
      if (!schemaReady) schemaReady = ensureSchema();
      await schemaReady;
      next();
    } catch (e) {
      next(e);
    }
  });

  // API 路由
  app.use('/api', itemsRouter);
  app.use('/api', uploadRouter);
  app.use('/api', exportRouter);
  app.use('/api', transactionsRouter);

  // 静态托管前端构建产物 + SPA fallback（仅本地运行用；Vercel 由平台托管静态）
  const distDir = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // 错误处理
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    res.status(500).json({ error: err.message || '服务器内部错误' });
  });

  return app;
}

module.exports = createApp;
