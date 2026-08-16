<script setup>
import { ref, onMounted, computed } from 'vue';
import { getStats, getItems, getMeta, exportUrl } from '../api';

const stats = ref(null);
const items = ref([]);
const meta = ref(null);
const search = ref('');
const loading = ref(true);
const activeWire = ref(null);
const sortAsc = ref(true); // true=从低到高，false=从高到低

const WIRE_ORDER = ['0.7PCC', '0.8PCC', '0.96CU', '1.0PCC', '1.3CU', '2.0CU'];

function level(qty, t) {
  if (!t) return 'gray';
  if (qty <= t.danger) return 'red';
  if (qty <= t.warn) return 'yellow';
  return 'green';
}
const levelText = { green: '充足', yellow: '偏低', red: '告急', gray: '-' };

// 全部 MBD 按剩余量排序（可切换低到高 / 高到低）
const sortedItems = computed(() =>
  [...items.value].sort((a, b) => {
    const d = sortAsc.value ? a.current_qty - b.current_qty : b.current_qty - a.current_qty;
    return d || a.wire_size.localeCompare(b.wire_size);
  })
);

const groups = computed(() => {
  const map = new Map();
  for (const it of items.value) {
    if (!map.has(it.wire_size)) map.set(it.wire_size, []);
    map.get(it.wire_size).push(it);
  }
  return [...map.entries()]
    .map(([wire_size, list]) => ({
      wire_size,
      items: list,
      total: list.reduce((s, i) => s + i.current_qty, 0),
      inUseCount: list.filter((i) => i.in_use).length,
    }))
    .sort((a, b) => {
      const ia = WIRE_ORDER.indexOf(a.wire_size);
      const ib = WIRE_ORDER.indexOf(b.wire_size);
      if (ia === -1 && ib === -1) return a.wire_size.localeCompare(b.wire_size);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
});

const activeGroup = computed(() => groups.value.find((g) => g.wire_size === activeWire.value));

function toggle(wire) {
  activeWire.value = activeWire.value === wire ? null : wire;
}

async function load() {
  loading.value = true;
  try {
    const [s, m] = await Promise.all([getStats(), getMeta()]);
    stats.value = s;
    meta.value = m;
    await loadItems();
  } finally {
    loading.value = false;
  }
}

async function loadItems() {
  const params = {};
  if (search.value) params.q = search.value;
  items.value = await getItems(params);
}

function doExport(type, format) {
  window.location.href = exportUrl(type, format);
}

onMounted(load);
</script>

<template>
  <div>
    <!-- KPI -->
    <div v-if="stats" class="kpi-grid">
      <div class="card kpi">
        <div class="label">Dummy 型号数</div>
        <div class="value">{{ stats.kinds }}</div>
      </div>
      <div class="card kpi">
        <div class="label">当前总剩余</div>
        <div class="value">{{ stats.total }}</div>
      </div>
      <div class="card kpi">
        <div class="label">偏低（≤5）</div>
        <div class="value warn">{{ stats.warnCount }}</div>
      </div>
      <div class="card kpi">
        <div class="label">告急（≤1）</div>
        <div class="value danger">{{ stats.dangerCount }}</div>
      </div>
      <div class="card kpi">
        <div class="label">使用中</div>
        <div class="value">{{ stats.inUseCount }}</div>
      </div>
    </div>

    <!-- 顶部窗口：全部 MBD 从低到高 -->
    <div class="card" style="margin-bottom: 20px">
      <div class="toolbar">
        <h2 class="section-title" style="margin: 0">全部 MBD 数量</h2>
        <button class="btn" @click="sortAsc = !sortAsc">
          {{ sortAsc ? '从低到高 ↑' : '从高到低 ↓' }}
        </button>
        <input v-model="search" placeholder="搜索料号…" style="max-width: 200px" @keyup.enter="loadItems" />
        <button class="btn" @click="loadItems">搜索</button>
        <div class="grow"></div>
        <button class="btn" @click="doExport('snapshot', 'xlsx')">快照 XLSX</button>
        <button class="btn" @click="doExport('snapshot', 'csv')">快照 CSV</button>
        <button class="btn" @click="doExport('transactions', 'xlsx')">明细 XLSX</button>
        <button class="btn" @click="doExport('transactions', 'csv')">明细 CSV</button>
      </div>

      <div v-if="loading" class="empty">加载中…</div>
      <div v-else class="scroll-window">
        <table>
          <thead>
            <tr>
              <th>线径</th>
              <th>MBD（料号）</th>
              <th>剩余量</th>
              <th>状态</th>
              <th>使用情况</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in sortedItems" :key="it.id">
              <td>{{ it.wire_size }}</td>
              <td style="font-variant-numeric: tabular-nums">{{ it.mbd }}</td>
              <td><span class="qty-num">{{ it.current_qty }}</span></td>
              <td>
                <span class="badge" :class="level(it.current_qty, stats?.thresholds)">
                  {{ levelText[level(it.current_qty, stats?.thresholds)] }}
                </span>
              </td>
              <td>
                <span v-if="it.in_use" class="badge in-use">使用中</span>
                <span v-else class="badge gray">在库</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 线径模块 -->
    <div class="wire-grid">
      <div
        v-for="g in groups"
        :key="g.wire_size"
        class="card wire-module"
        :class="{ active: activeWire === g.wire_size }"
        @click="toggle(g.wire_size)"
      >
        <div class="wire-module-name">{{ g.wire_size }}</div>
        <div class="wire-module-meta">{{ g.items.length }} 种料号 · 剩余 {{ g.total }} 条</div>
        <span v-if="g.inUseCount" class="badge in-use">使用中 {{ g.inUseCount }}</span>
        <span v-else class="badge gray">无使用</span>
      </div>
    </div>

    <!-- 点击线径后的详情 -->
    <div v-if="activeGroup" class="card" style="margin-top: 20px">
      <div class="toolbar">
        <h2 class="section-title" style="margin: 0">{{ activeGroup.wire_size }} 的 MBD 剩余情况</h2>
        <div class="grow"></div>
        <button class="btn" @click="activeWire = null">收起</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>MBD（料号）</th>
            <th>剩余量</th>
            <th>状态</th>
            <th>使用情况</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in activeGroup.items" :key="it.id">
            <td style="font-variant-numeric: tabular-nums">{{ it.mbd }}</td>
            <td><span class="qty-num">{{ it.current_qty }}</span></td>
            <td>
              <span class="badge" :class="level(it.current_qty, stats?.thresholds)">
                {{ levelText[level(it.current_qty, stats?.thresholds)] }}
              </span>
            </td>
            <td>
              <span v-if="it.in_use" class="badge in-use">使用中</span>
              <span v-else class="badge gray">在库</span>
            </td>
            <td class="muted">{{ it.remark || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.scroll-window {
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-top: 8px;
}
.scroll-window thead th {
  position: sticky;
  top: 0;
  background: #f8fafc;
  z-index: 1;
}
.wire-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.wire-module {
  cursor: pointer;
  text-align: center;
  padding: 20px;
  transition: all 0.15s;
  user-select: none;
}
.wire-module:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
}
.wire-module.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}
.wire-module-name {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 6px;
}
.wire-module-meta {
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 10px;
}
.badge.in-use {
  background: #ffedd5;
  color: #c2410c;
}
@media (max-width: 800px) {
  .wire-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
