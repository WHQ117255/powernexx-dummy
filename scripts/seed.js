'use strict';

// 一次性初始化脚本：建表 + 导入 dummy.xlsx 初始数据到 Neon。
// 用法：先设置 DATABASE_URL 环境变量，再 node scripts/seed.js
const { initDb, ensureSchema, run } = require('../server/db');
const { importDummyXlsx } = require('../server/importer');

async function main() {
  initDb();
  await ensureSchema();
  // 清空历史变动 + 重置使用中状态，便于重复初始化/重置
  await run('DELETE FROM inventory_transactions');
  await run('UPDATE dummy_items SET in_use = 0');
  const count = await importDummyXlsx();
  console.log(`✅ 已建表并导入 ${count} 行初始数据到 Neon`);
}

main().catch((e) => {
  console.error('seed 失败：', e);
  process.exit(1);
});
