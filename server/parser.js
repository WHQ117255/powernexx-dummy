'use strict';

/**
 * 消息解析器：把自然语言解析成结构化更新。
 *
 * 方向语义（关键）：
 *  - 增加（新增 dummy）：「上来」「来了」「新增」「归还」「放入」等 → direction = +1
 *  - 减少（拿走）：「拿给」「给」「拿」「取走」「消耗」等 → direction = -1
 *
 * 字段识别：
 *  - wire_size：从数据库线径枚举按长度降序、大小写不敏感匹配；未命中则用料号定位到的线径兜底。
 *  - mbd（料号）：匹配 6~9 位连续数字，再与库中料号做「精确 → 去前导0 → 包含」三级匹配。
 *  - qty（数量）：中文数字（俩/两/三…）或阿拉伯数字 + 条/个/枚/支/片。
 *  - 人名（如「梁安华」「成杰」）不参与定位，仅保留在 source_text 中。
 */

const { get, all } = require('./db');

const CN_NUM = {
  零: 0, 〇: 0,
  一: 1, 二: 2, 两: 2, 俩: 2,
  三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

// 减少/拿走类关键词 → direction = -1（优先判定）
const DECREASE_WORDS = [
  '拿给', '拿走', '拿', '给', '取走', '消耗', '领用', '领走', '取出', '取用',
  '用掉', '减', '扣', '发', '出库', '减少', '借走', '带走',
];

// 增加/新增类关键词 → direction = +1
const INCREASE_WORDS = [
  '上来', '来了', '进来', '送进', '送来', '新增', '归还', '放回', '放入', '入库',
  '收回', '补', '加', '还回', '进',
];

/** 从文本中提取线径（大小写不敏感，长优先）。返回规范化线径或 null。 */
function extractWireSize(text, wireSizes) {
  const lower = text.toLowerCase();
  const sorted = [...wireSizes].sort((a, b) => b.length - a.length);
  for (const ws of sorted) {
    if (lower.includes(ws.toLowerCase())) return ws;
  }
  return null;
}

/** 从文本中提取料号数字串（6~9 位连续数字，返回字符串数组）。 */
function extractMbdNumbers(text) {
  return text.match(/\d{6,9}/g) || [];
}

/** 在库中定位料号：精确 → 去前导0 → 包含。返回 { mbd, wire_size } 或 null。 */
async function findMbd(mbdNum) {
  let row = await get('SELECT mbd, wire_size FROM dummy_items WHERE mbd = $1', [mbdNum]);
  if (row) return row;

  const stripped = mbdNum.replace(/^0+/, '');
  if (stripped !== mbdNum) {
    row = await get('SELECT mbd, wire_size FROM dummy_items WHERE mbd = $1', [stripped]);
    if (row) return row;
  }

  row = await get(
    'SELECT mbd, wire_size FROM dummy_items WHERE mbd LIKE $1 ORDER BY length(mbd) ASC LIMIT 1',
    [`%${mbdNum}%`]
  );
  return row || null;
}

/** 从文本中提取数量：中文/阿拉伯数字 + 量词。返回数字或 null。 */
function extractQty(text) {
  const cn = text.match(/([零〇一二两俩三四五六七八九十]+)\s*[条个枚支片]/);
  if (cn) {
    const num = CN_NUM[cn[1]];
    if (num != null) return num;
  }
  const ar = text.match(/(\d+)\s*[条个枚支片]/);
  if (ar) return parseInt(ar[1], 10);
  return null;
}

/** 判定方向：命中减少词 → -1，命中增加词 → +1，否则默认 +1（新增）。 */
function extractDirection(text) {
  for (const w of DECREASE_WORDS) {
    if (text.includes(w)) return -1;
  }
  for (const w of INCREASE_WORDS) {
    if (text.includes(w)) return 1;
  }
  return 1;
}

/** 提取机台号：拿给/给 后面紧跟的短数字（1~5 位，且不是 MBD 号 6~9 位）。 */
function extractMachine(text) {
  const m = text.match(/(?:拿给|给)\s*(\d{1,5})(?!\d)/);
  return m ? m[1] : null;
}

/**
 * 解析单条消息。返回：
 * { raw, wire_size, mbd, qty, direction, machine, matched, warnings[] }
 * matched = wire_size 与 mbd 都定位成功且 qty 有值（可自动落库）。
 */
async function parseMessage(text) {
  const raw = String(text).trim();
  const warnings = [];
  if (!raw) {
    return { raw, wire_size: null, mbd: null, qty: null, direction: 1, machine: null, matched: false, warnings: ['空消息'] };
  }

  const wireSizeRows = await all('SELECT DISTINCT wire_size FROM dummy_items');
  const wireSizes = wireSizeRows.map((r) => r.wire_size);

  let wire_size = extractWireSize(raw, wireSizes);

  let mbd = null;
  const mbdNums = extractMbdNumbers(raw);
  if (mbdNums.length === 0) {
    if (!wire_size) warnings.push('未识别线径');
    warnings.push('未识别料号');
  } else {
    for (const num of mbdNums) {
      const found = await findMbd(num);
      if (found) {
        mbd = found.mbd;
        if (!wire_size) wire_size = found.wire_size;
        break;
      }
    }
    if (!mbd) {
      if (!wire_size) warnings.push('未识别线径');
      warnings.push(`料号 ${mbdNums.join('/')} 未在库中找到`);
    }
  }

  const qty = extractQty(raw);
  if (qty == null) warnings.push('未识别数量');

  const direction = extractDirection(raw);
  const machine = extractMachine(raw);

  const matched = Boolean(wire_size && mbd && qty != null);
  return { raw, wire_size, mbd, qty, direction, machine, matched, warnings };
}

/** 批量解析：按换行拆分，逐条 parseMessage。 */
async function parseMessageBatch(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const results = [];
  for (const line of lines) {
    results.push(await parseMessage(line));
  }
  return results;
}

module.exports = { parseMessage, parseMessageBatch };
