<script setup>
import { ref } from 'vue';
import { uploadFile } from '../api';

const file = ref(null);
const uploading = ref(false);
const result = ref(null);
const message = ref(null);
const dragging = ref(false);

function onSelect(e) {
  file.value = e.target.files[0] || null;
  result.value = null;
  message.value = null;
}

function onDrop(e) {
  dragging.value = false;
  const f = e.dataTransfer.files[0];
  if (f) {
    file.value = f;
    result.value = null;
    message.value = null;
  }
}

async function doUpload() {
  if (!file.value) return;
  uploading.value = true;
  message.value = null;
  result.value = null;
  try {
    result.value = await uploadFile(file.value);
    message.value = { type: 'success', text: '同步完成，库存已按快照刷新' };
  } catch (e) {
    message.value = { type: 'error', text: e.message };
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div>
    <div class="card" style="max-width: 720px">
      <h2 class="section-title">上传表格同步</h2>
      <div class="hint">
        上传与 dummy.xlsx 相同格式的文件（列：<b>Wire Size | MBD | Dummy QTY | Remark</b>），
        支持 .xlsx 或 .csv（CSV 请另存为「CSV UTF-8」）。系统会以该表为最新快照刷新库存，并记录差异变动。
      </div>

      <div
        class="dropzone"
        :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <input type="file" accept=".xlsx,.csv" @change="onSelect" />
        <div v-if="file" style="margin-top: 8px">已选择：<b>{{ file.name }}</b></div>
        <div v-else class="muted">点击选择或拖拽文件到此处</div>
      </div>

      <div v-if="message" class="alert" :class="message.type" style="margin-top: 12px">{{ message.text }}</div>

      <div v-if="result" class="result-box" style="margin-top: 16px">
        <p><b>解析行数：</b>{{ result.parsed }}</p>
        <p><b>新增物料：</b>{{ result.created }} 种</p>
        <p><b>库存变化：</b>{{ result.changed }} 条</p>
        <p><b>无变化：</b>{{ result.unchanged }} 条</p>
      </div>

      <div style="margin-top: 16px">
        <button class="btn primary" :disabled="uploading || !file" @click="doUpload">
          {{ uploading ? '上传中…' : '上传并同步' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dropzone {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
}
.dropzone.dragging {
  border-color: var(--primary);
  background: #eff6ff;
}
.result-box {
  background: #f8fafc;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}
.result-box p {
  margin: 4px 0;
  font-size: 14px;
}
</style>
