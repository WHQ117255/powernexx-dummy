'use strict';

const path = require('path');
const { Readable } = require('stream');
const ExcelJS = require('exceljs');
const { run } = require('./db');

const DEFAULT_XLSX = path.join(__dirname, '..', 'dummy.xlsx');

/** 统一线径：去空白 + 大写（"2.0cu" → "2.0CU"）。 */
function normWireSize(v) {
  if (v == null) return '';
  return String(v).trim().toUpperCase();
}

/** 清理料号：去 "(1) " 之类括号标记、去 "?"、规范化逗号。 */
function cleanMbd(v) {
  if (v == null) return '';
  let s = String(v).trim();
  s = s.replace(/\(\d+\)\s*/g, '');
  s = s.replace(/\?/g, '');
  s = s.replace(/\s*,\s*/g, ',');
  return s;
}

/** 解析数量："1条"→1、"2"→2、空→0。 */
function parseQty(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim();
  const num = parseInt(s.replace(/[^0-9-]/g, ''), 10);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * 从 worksheet 提取记录数组 [{ wire_size, mbd, qty, remark }]。
 * - 空 Wire Size 向下继承上一行（合并单元格）
 * - 列：1=Wire Size, 2=MBD, 3=Dummy QTY, 4=Remark
 */
function extractRows(worksheet) {
  const rows = [];
  let lastWireSize = '';
  let rowIndex = 0;

  worksheet.eachRow((row) => {
    rowIndex++;
    if (rowIndex === 1) return; // 表头

    const rawWire = row.getCell(1).text;
    const rawMbd = row.getCell(2).text;
    const rawQty = row.getCell(3).text;
    const rawRemark = row.getCell(4).text;

    let wireSize = normWireSize(rawWire);
    if (wireSize) lastWireSize = wireSize;
    else wireSize = lastWireSize;

    const mbd = cleanMbd(rawMbd);
    if (!wireSize || !mbd) return; // 缺关键字段的行跳过

    rows.push({ wire_size: wireSize, mbd, qty: parseQty(rawQty), remark: rawRemark.trim() || null });
  });

  return rows;
}

/** 读取 xlsx / csv 文件路径，返回记录数组。 */
async function loadRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filePath)) {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }
  return extractRows(workbook.worksheets[0]);
}

/** 读取 xlsx / csv 内存 buffer（Serverless 上传用），返回记录数组。 */
async function loadRowsFromBuffer(buffer, filename) {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename)) {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer);
  }
  return extractRows(workbook.worksheets[0]);
}

/**
 * 读取 xlsx（列：Wire Size | MBD | Dummy QTY | Remark）并 upsert 进 dummy_items。
 * - 重复的 (wire_size, mbd) 以后者覆盖
 * 返回导入行数。
 */
async function importDummyXlsx(filePath = DEFAULT_XLSX) {
  const rows = await loadRows(filePath);

  for (const r of rows) {
    await run(
      `INSERT INTO dummy_items (wire_size, mbd, current_qty, remark)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wire_size, mbd) DO UPDATE SET
         current_qty = EXCLUDED.current_qty,
         remark = EXCLUDED.remark,
         updated_at = to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS')`,
      [r.wire_size, r.mbd, r.qty, r.remark]
    );
  }

  return rows.length;
}

module.exports = {
  importDummyXlsx,
  loadRows,
  loadRowsFromBuffer,
  extractRows,
  normWireSize,
  cleanMbd,
  parseQty,
};
