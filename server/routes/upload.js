'use strict';

const express = require('express');
const multer = require('multer');
const { getDb } = require('../db');
const { loadRowsFromBuffer } = require('../importer');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('仅支持 .xlsx / .csv 文件'), ok);
  },
});

/**
 * 快照覆盖：以上传表格为准刷新库存，差异生成 upload 变动记录。
 * 返回 { created, changed, unchanged, total }。
 */
async function applySnapshot(rows, sourceText) {
  const client = await getDb().connect();
  try {
    await client.query('BEGIN');
    let created = 0;
    let changed = 0;
    let unchanged = 0;

    for (const r of rows) {
      const item = (
        await client.query('SELECT * FROM dummy_items WHERE wire_size = $1 AND mbd = $2', [r.wire_size, r.mbd])
      ).rows[0];

      if (!item) {
        const ins = await client.query(
          'INSERT INTO dummy_items (wire_size, mbd, current_qty, remark) VALUES ($1, $2, $3, $4) RETURNING id',
          [r.wire_size, r.mbd, r.qty, r.remark]
        );
        const id = ins.rows[0].id;
        await client.query(
          'INSERT INTO inventory_transactions (dummy_item_id, change_qty, change_type, source_text, remark) VALUES ($1, $2, $3, $4, $5)',
          [id, r.qty, 'upload', sourceText, '新增物料']
        );
        created++;
      } else {
        const diff = r.qty - item.current_qty;
        if (diff !== 0) {
          await client.query(
            `UPDATE dummy_items
             SET current_qty = $1,
                 remark = COALESCE($2, remark),
                 updated_at = to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS')
             WHERE id = $3`,
            [r.qty, r.remark, item.id]
          );
          await client.query(
            'INSERT INTO inventory_transactions (dummy_item_id, change_qty, change_type, source_text, remark) VALUES ($1, $2, $3, $4, $5)',
            [item.id, diff, 'upload', sourceText, '快照同步']
          );
          changed++;
        } else {
          unchanged++;
        }
      }
    }

    await client.query('COMMIT');
    return { created, changed, unchanged, total: rows.length };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

/** POST /api/upload —— 上传 xlsx/csv，快照覆盖。 */
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    const rows = await loadRowsFromBuffer(req.file.buffer, req.file.originalname);
    if (rows.length === 0) return res.status(400).json({ error: '文件中没有有效数据行' });
    const result = await applySnapshot(rows, req.file.originalname);
    res.json({ parsed: rows.length, ...result });
  } catch (e) {
    next(e);
  }
});

module.exports = { router, applySnapshot };
