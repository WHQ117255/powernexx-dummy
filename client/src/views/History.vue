<script setup>
import { ref, onMounted } from 'vue';
import { getTransactions } from '../api';

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const loading = ref(false);

const typeLabels = {
  import: '初始导入',
  manual: '手动更新',
  upload: '上传同步',
  scheduled: '定时任务',
};

const totalPages = () => Math.max(1, Math.ceil(total.value / pageSize));

async function load() {
  loading.value = true;
  try {
    const res = await getTransactions(page.value, pageSize);
    rows.value = res.rows;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function goto(p) {
  if (p < 1 || p > totalPages()) return;
  page.value = p;
  load();
}

onMounted(load);
</script>

<template>
  <div class="card">
    <h2 class="section-title">历史变动明细（共 {{ total }} 条）</h2>
    <div v-if="loading" class="empty">加载中…</div>
    <table v-else-if="rows.length">
      <thead>
        <tr>
          <th>时间</th>
          <th>线径</th>
          <th>料号</th>
          <th>变动量</th>
          <th>类型</th>
          <th>机台号</th>
          <th>来源</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td class="muted" style="white-space: nowrap">{{ r.created_at }}</td>
          <td>{{ r.wire_size || '—' }}</td>
          <td style="font-variant-numeric: tabular-nums">{{ r.mbd || '—' }}</td>
          <td>
            <b :style="{ color: r.change_qty >= 0 ? 'var(--green)' : 'var(--red)' }">
              {{ r.change_qty > 0 ? '+' : '' }}{{ r.change_qty }}
            </b>
          </td>
          <td><span class="badge gray">{{ typeLabels[r.change_type] || r.change_type }}</span></td>
          <td style="font-variant-numeric: tabular-nums">{{ r.machine || '—' }}</td>
          <td class="muted">{{ r.source_text || '—' }}</td>
          <td class="muted">{{ r.remark || '—' }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else class="empty">暂无变动记录</div>

    <div v-if="total > pageSize" class="pagination">
      <button class="btn" :disabled="page <= 1" @click="goto(page - 1)">上一页</button>
      <span class="muted">{{ page }} / {{ totalPages() }}</span>
      <button class="btn" :disabled="page >= totalPages()" @click="goto(page + 1)">下一页</button>
    </div>
  </div>
</template>
