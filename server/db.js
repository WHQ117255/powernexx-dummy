'use strict';

const { Pool } = require('@neondatabase/serverless');

let pool = null;

/** 初始化 Neon 连接池（连接串来自环境变量 DATABASE_URL）。 */
function initDb() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error('缺少环境变量 DATABASE_URL（Neon 连接串）');
  }
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** 获取连接池（需先 initDb）。 */
function getDb() {
  if (!pool) throw new Error('数据库尚未初始化，请先调用 initDb()');
  return pool;
}

/** 查询单行。 */
async function get(text, params = []) {
  const r = await getDb().query(text, params);
  return r.rows[0] || null;
}

/** 查询多行。 */
async function all(text, params = []) {
  const r = await getDb().query(text, params);
  return r.rows;
}

/** 执行写操作，返回 pg 结果（含 rows，用于 RETURNING）。 */
async function run(text, params = []) {
  return getDb().query(text, params);
}

/** 建表 + 写入默认配置（幂等）。 */
async function ensureSchema() {
  const db = getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS dummy_items (
      id SERIAL PRIMARY KEY,
      wire_size TEXT NOT NULL,
      mbd TEXT NOT NULL,
      current_qty INTEGER NOT NULL DEFAULT 0,
      in_use INTEGER NOT NULL DEFAULT 0,
      remark TEXT,
      created_at TEXT DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'),
      updated_at TEXT DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'),
      UNIQUE(wire_size, mbd)
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id SERIAL PRIMARY KEY,
      dummy_item_id INTEGER NOT NULL REFERENCES dummy_items(id),
      change_qty INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      source_text TEXT,
      remark TEXT,
      machine TEXT,
      created_at TEXT DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS')
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_logs (
      id SERIAL PRIMARY KEY,
      schedule_label TEXT NOT NULL,
      note TEXT,
      fired_at TEXT DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS')
    );
  `);

  const defaults = [
    ['warn_threshold', '5'],
    ['danger_threshold', '1'],
  ];
  for (const [k, v] of defaults) {
    await db.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }
}

/** 读取预警阈值（异步）。 */
async function getThresholds() {
  const row = (k) => get('SELECT value FROM settings WHERE key = $1', [k]);
  const warn = await row('warn_threshold');
  const danger = await row('danger_threshold');
  return {
    warn: parseInt(warn?.value ?? '5', 10),
    danger: parseInt(danger?.value ?? '1', 10),
  };
}

module.exports = { initDb, getDb, get, all, run, ensureSchema, getThresholds };
