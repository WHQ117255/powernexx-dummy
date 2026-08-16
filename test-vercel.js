'use strict';

const BASE = 'https://powernexx-dummy.vercel.app';

async function main() {
  // 读操作验证（不污染数据）
  const items = await fetch(`${BASE}/api/items`).then((r) => r.json());
  console.log('① items 数量:', items.length);

  const meta = await fetch(`${BASE}/api/meta`).then((r) => r.json());
  console.log('② wire_sizes:', meta.wire_sizes.join(','));

  const parseRes = await fetch(`${BASE}/api/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '拿给7086两条10002220dummy' }),
  }).then((r) => r.json());
  const p = parseRes.results[0];
  console.log('③ parse:', JSON.stringify({ wire_size: p.wire_size, mbd: p.mbd, qty: p.qty, direction: p.direction, machine: p.machine, matched: p.matched }));

  const csv = await fetch(`${BASE}/api/export?type=snapshot&format=csv`).then((r) => r.text());
  console.log('④ 导出csv前2行:', csv.split('\r\n').slice(0, 2).join(' | '));

  // 写操作验证（一次更新）
  const updRes = await fetch(`${BASE}/api/items/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ wire_size: '1.0PCC', mbd: '10002220', qty: 1, direction: 1, source_text: '公网测试', machine: null }] }),
  }).then((r) => r.json());
  console.log('⑤ update:', JSON.stringify(updRes.applied[0]));

  // 上传验证
  const csvData = 'Wire Size,MBD,Dummy QTY,Remark\n1.0PCC,10002220,5,PPF\n';
  const form = new FormData();
  form.append('file', new Blob([csvData], { type: 'text/csv' }), 't.csv');
  const upRes = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form }).then((r) => r.json());
  console.log('⑥ upload:', JSON.stringify(upRes));

  // 历史明细（确认落库）
  const tx = await fetch(`${BASE}/api/transactions?pageSize=2`).then((r) => r.json());
  console.log('⑦ 最新变动:', JSON.stringify(tx.rows[0]));
}

main().catch((e) => {
  console.error('测试失败:', e);
  process.exit(1);
});
