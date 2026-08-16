'use strict';

const { getDb, get } = require('./db');

/** 按 (wire_size, mbd) 查找物料。 */
async function findItem(wireSize, mbd) {
  return get('SELECT * FROM dummy_items WHERE wire_size = $1 AND mbd = $2', [wireSize, mbd]);
}

/** 按 mbd 查找物料（跨线径兜底）。 */
async function findItemByMbd(mbd) {
  return get('SELECT * FROM dummy_items WHERE mbd = $1 ORDER BY id ASC', [mbd]);
}

/** 应用一次库存变动：更新当前库存 + 写入变动明细，原子事务。 */
async function applyChange(itemId, changeQty, changeType, sourceText = null, remark = null, machine = null) {
  const client = await getDb().connect();
  try {
    await client.query('BEGIN');
    // 减少（拿走）→ 标记使用中；增加（归还/新增）→ 取消使用中
    const inUse = changeQty < 0 ? 1 : 0;
    const upd = await client.query(
      `UPDATE dummy_items
       SET current_qty = current_qty + $1,
           in_use = $2,
           updated_at = to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS')
       WHERE id = $3`,
      [changeQty, inUse, itemId]
    );
    if (upd.rowCount === 0) throw new Error(`物料不存在 id=${itemId}`);

    await client.query(
      `INSERT INTO inventory_transactions (dummy_item_id, change_qty, change_type, source_text, remark, machine)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [itemId, changeQty, changeType, sourceText, remark, machine]
    );

    await client.query('COMMIT');
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

module.exports = { findItem, findItemByMbd, applyChange };
