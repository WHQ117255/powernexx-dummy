'use strict';

const express = require('express');
const { get, all, run, getThresholds } = require('../db');
const { findItem, findItemByMbd, applyChange } = require('../store');
const { parseMessageBatch } = require('../parser');

const router = express.Router();

/** GET /api/items —— 库存列表，支持 ?wire_size= 筛选、?q= 搜索料号。 */
router.get('/items', async (req, res, next) => {
  try {
    const { wire_size, q } = req.query;
    const conds = [];
    const params = [];
    if (wire_size) {
      conds.push(`wire_size = $${params.length + 1}`);
      params.push(wire_size);
    }
    if (q) {
      conds.push(`mbd LIKE $${params.length + 1}`);
      params.push(`%${q}%`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await all(`SELECT * FROM dummy_items ${where} ORDER BY wire_size ASC, mbd ASC`, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/** GET /api/stats —— 看板 KPI。 */
router.get('/stats', async (req, res, next) => {
  try {
    const { warn, danger } = await getThresholds();
    const kinds = Number((await get('SELECT COUNT(DISTINCT wire_size) AS c FROM dummy_items')).c);
    const total = Number((await get('SELECT COALESCE(SUM(current_qty), 0) AS s FROM dummy_items')).s);
    const warnCount = Number(
      (await get('SELECT COUNT(*) AS c FROM dummy_items WHERE current_qty <= $1 AND current_qty > $2', [warn, danger])).c
    );
    const dangerCount = Number(
      (await get('SELECT COUNT(*) AS c FROM dummy_items WHERE current_qty <= $1', [danger])).c
    );
    const inUseCount = Number((await get('SELECT COUNT(*) AS c FROM dummy_items WHERE in_use = 1')).c);
    res.json({ kinds, total, warnCount, dangerCount, inUseCount, thresholds: { warn, danger } });
  } catch (e) {
    next(e);
  }
});

/** GET /api/meta —— 线径枚举、阈值、按线径分组的料号。 */
router.get('/meta', async (req, res, next) => {
  try {
    const wireSizeRows = await all('SELECT DISTINCT wire_size FROM dummy_items ORDER BY wire_size ASC');
    const wireSizes = wireSizeRows.map((r) => r.wire_size);
    const byWireSize = {};
    for (const ws of wireSizes) {
      const rows = await all('SELECT mbd FROM dummy_items WHERE wire_size = $1 ORDER BY mbd ASC', [ws]);
      byWireSize[ws] = rows.map((r) => r.mbd);
    }
    res.json({ wire_sizes: wireSizes, thresholds: await getThresholds(), byWireSize });
  } catch (e) {
    next(e);
  }
});

/** POST /api/parse —— 解析消息（预览，不落库）。body: { text }。 */
router.post('/parse', async (req, res, next) => {
  try {
    const { text } = req.body || {};
    const results = await parseMessageBatch(text);
    res.json({ results });
  } catch (e) {
    next(e);
  }
});

/** POST /api/items/update —— 手动更新。body: 单条 或 {items:[...]}。 */
router.post('/items/update', async (req, res, next) => {
  try {
    const body = req.body || {};
    const list = Array.isArray(body.items) ? body.items : [body];

    const applied = [];
    const errors = [];

    for (const it of list) {
      try {
        const { wire_size, mbd, qty, direction = 1, source_text = null, machine = null, remark = null } = it;
        if (!wire_size || !mbd || qty == null) {
          errors.push({ wire_size, mbd, error: '缺少线径/料号/数量' });
          continue;
        }
        const changeQty = Math.round(Number(qty)) * (Number(direction) >= 0 ? 1 : -1);

        let item = await findItem(wire_size, mbd);
        if (!item) item = await findItemByMbd(mbd);
        if (!item) {
          // 新 MBD：仅「新增（增加）」方向允许创建新物料
          if (changeQty <= 0) {
            errors.push({ wire_size, mbd, error: '物料不存在，无法减少' });
            continue;
          }
          const r = await run(
            'INSERT INTO dummy_items (wire_size, mbd, current_qty, remark) VALUES ($1, $2, 0, $3) RETURNING id',
            [wire_size, mbd, remark || null]
          );
          item = { id: r.rows[0].id, wire_size, mbd, current_qty: 0 };
        }
        await applyChange(item.id, changeQty, 'manual', source_text, null, machine);
        const fresh = await get('SELECT * FROM dummy_items WHERE id = $1', [item.id]);
        applied.push({
          id: fresh.id,
          wire_size: fresh.wire_size,
          mbd: fresh.mbd,
          current_qty: fresh.current_qty,
          change_qty: changeQty,
          machine,
        });
      } catch (e) {
        errors.push({ wire_size: it.wire_size, mbd: it.mbd, error: e.message });
      }
    }

    res.json({ applied, errors, total: list.length });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
