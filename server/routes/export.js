'use strict';

const express = require('express');
const ExcelJS = require('exceljs');
const { all } = require('../db');

const router = express.Router();

const TYPE_LABELS = {
  import: '初始导入',
  manual: '手动更新',
  upload: '上传同步',
  scheduled: '定时任务',
};

/** 生成带 BOM 的 CSV（Excel 打开中文不乱码）。 */
function toCsv(headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const r of rows) lines.push(r.map(escape).join(','));
  return '﻿' + lines.join('\r\n');
}

/** GET /api/export?type=snapshot|transactions&format=xlsx|csv */
router.get('/export', async (req, res, next) => {
  try {
    const type = req.query.type === 'transactions' ? 'transactions' : 'snapshot';
    const format = req.query.format === 'csv' ? 'csv' : 'xlsx';

    let headers;
    let rows;

    if (type === 'transactions') {
      headers = ['时间', '线径', '料号', '变动量', '类型', '机台号', '来源', '备注'];
      const list = await all(`
        SELECT t.created_at, i.wire_size, i.mbd, t.change_qty, t.change_type, t.source_text, t.remark, t.machine
        FROM inventory_transactions t
        LEFT JOIN dummy_items i ON i.id = t.dummy_item_id
        ORDER BY t.id DESC
      `);
      rows = list.map((r) => [
        r.created_at,
        r.wire_size ?? '',
        r.mbd ?? '',
        r.change_qty,
        TYPE_LABELS[r.change_type] || r.change_type,
        r.machine ?? '',
        r.source_text ?? '',
        r.remark ?? '',
      ]);
    } else {
      headers = ['Wire Size', 'MBD', 'Dummy QTY', 'Remark'];
      const list = await all(
        'SELECT wire_size, mbd, current_qty, remark FROM dummy_items ORDER BY wire_size ASC, mbd ASC'
      );
      rows = list.map((r) => [r.wire_size, r.mbd, r.current_qty, r.remark ?? '']);
    }

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const csv = toCsv(headers, rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="dummy_${type}_${stamp}.csv"`);
      return res.send(csv);
    }

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(type === 'transactions' ? '变动明细' : '库存快照');
    ws.columns = headers.map((h) => ({ header: h, width: 20 }));
    for (const r of rows) ws.addRow(r);
    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="dummy_${type}_${stamp}.xlsx"`);
    res.send(Buffer.from(buf));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
