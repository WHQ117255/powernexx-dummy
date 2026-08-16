'use strict';

const express = require('express');
const { get, all } = require('../db');

const router = express.Router();

/** GET /api/transactions?page=1&pageSize=50 —— 历史变动明细（分页）。 */
router.get('/transactions', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const offset = (page - 1) * pageSize;

    const total = Number((await get('SELECT COUNT(*) AS c FROM inventory_transactions')).c);
    const rows = await all(
      `SELECT t.id, t.created_at, t.change_qty, t.change_type, t.source_text, t.remark, t.machine,
              i.wire_size, i.mbd
       FROM inventory_transactions t
       LEFT JOIN dummy_items i ON i.id = t.dummy_item_id
       ORDER BY t.id DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    res.json({ total, page, pageSize, rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
