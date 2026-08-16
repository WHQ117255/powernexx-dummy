<script setup>
import { ref, onMounted, computed } from 'vue';
import { parseMessage, updateItems, getMeta } from '../api';

const meta = ref(null);
const text = ref('');
const parsed = ref([]);
const parsing = ref(false);
const submitting = ref(false);
const message = ref(null);

// 饱嗝 toast
const toasts = ref([]);
let toastSeq = 0;

// 手动表单
const mWire = ref('');
const mMbd = ref('');
const mQty = ref(1);
const mDir = ref(1);
const mMachine = ref('');

const mbdOptions = computed(() => (mWire.value ? meta.value?.byWireSize?.[mWire.value] || [] : []));
const dirText = (d) => (d >= 0 ? '新增 (+) ' : '拿走 (−)');

onMounted(async () => {
  meta.value = await getMeta();
  if (meta.value.wire_sizes.length) mWire.value = meta.value.wire_sizes[0];
});

function mbdOptionsFor(wire) {
  return wire ? meta.value?.byWireSize?.[wire] || [] : [];
}

/** 饱嗝提示语映射：基于带符号的 change_qty（正=新增，负=减少）。 */
function getFeedback(changeQty) {
  if (changeQty >= 0) {
    if (changeQty >= 4) return '对对对对就这样备 狠狠的备dummy';
    if (changeQty === 3) return '不错知道喂饱我了';
    if (changeQty === 2) return '行吧 也就小小满足';
    return '怎么只喂这么点dummy';
  }
  const n = Math.abs(changeQty);
  if (n >= 3) return '当家的 稳重啊啊啊啊！';
  if (n === 2) return '要勤俭持家啊啊啊！';
  return '你注意点昂 省着点用';
}

function showToast(text, kind) {
  const id = ++toastSeq;
  toasts.value.push({ id, text, kind });
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 4000);
}

function feedToasts(applied) {
  for (const a of applied) {
    showToast(getFeedback(a.change_qty), a.change_qty >= 0 ? 'full' : 'warn');
  }
}

async function doParse() {
  message.value = null;
  if (!text.value.trim()) return;
  parsing.value = true;
  try {
    const res = await parseMessage(text.value);
    parsed.value = res.results.map((r) => ({
      raw: r.raw,
      warnings: r.warnings,
      wire_size: r.wire_size || '',
      mbd: r.mbd || '',
      qty: r.qty,
      direction: r.direction,
      machine: r.machine || '',
      checked: true,
    }));
  } finally {
    parsing.value = false;
  }
}

const validItems = computed(() =>
  parsed.value
    .filter((p) => p.checked && p.wire_size && p.mbd && p.qty != null)
    .map((p) => ({
      wire_size: p.wire_size,
      mbd: p.mbd,
      qty: Number(p.qty),
      direction: p.direction,
      machine: p.machine || null,
      source_text: p.raw,
    }))
);

async function submitParsed() {
  if (!validItems.value.length) return;
  submitting.value = true;
  message.value = null;
  try {
    const res = await updateItems(validItems.value);
    feedToasts(res.applied);
    if (res.errors.length) {
      message.value = { type: 'error', text: res.errors.map((e) => `${e.mbd}: ${e.error}`).join('；') };
    } else {
      message.value = { type: 'success', text: `成功更新 ${res.applied.length} 条` };
    }
    parsed.value = [];
    text.value = '';
  } catch (e) {
    message.value = { type: 'error', text: e.message };
  } finally {
    submitting.value = false;
  }
}

async function submitManual() {
  if (!mWire.value || !mMbd.value || mQty.value == null) {
    message.value = { type: 'error', text: '请填写线径、料号和数量' };
    return;
  }
  submitting.value = true;
  message.value = null;
  try {
    const res = await updateItems([{
      wire_size: mWire.value,
      mbd: mMbd.value,
      qty: Number(mQty.value),
      direction: mDir.value,
      machine: mMachine.value || null,
      source_text: `手动：${mWire.value} ${mMbd.value} ${dirText(mDir.value)}${mQty.value}条${mMachine.value ? ' 机台' + mMachine.value : ''}`,
    }]);
    feedToasts(res.applied);
    if (res.errors.length) {
      message.value = { type: 'error', text: res.errors[0].error };
    } else {
      message.value = { type: 'success', text: `已更新：${res.applied[0]?.mbd} 现剩余 ${res.applied[0]?.current_qty}` };
      mMbd.value = '';
      mQty.value = 1;
      mMachine.value = '';
    }
  } catch (e) {
    message.value = { type: 'error', text: e.message };
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div>
    <!-- 饱嗝 toast -->
    <div class="toast-container">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">
        <span class="toast-icon">{{ t.kind === 'full' ? '🤤' : '😤' }}</span>
        <span>{{ t.text }}</span>
      </div>
    </div>

    <div v-if="message" class="alert" :class="message.type">{{ message.text }}</div>

    <!-- 消息解析 -->
    <div class="card" style="margin-bottom: 20px">
      <h2 class="section-title">根据消息更新</h2>
      <div class="hint">
        粘贴消息，例如「上来俩条」（新增 2 条）、「拿给7086两条1000253dummy」（机台 7086 拿走 2 条料号 1000253）、
        「给成杰10002220俩条dummy」（拿走 2 条）。机台号可不填；未识别到线径/料号的行可在下方补选。
      </div>
      <textarea v-model="text" rows="4" placeholder="上来俩条&#10;拿给7086两条1000253dummy"></textarea>
      <div style="margin-top: 12px; display: flex; gap: 12px">
        <button class="btn primary" :disabled="parsing || !text.trim()" @click="doParse">解析预览</button>
      </div>

      <div v-if="parsed.length" style="margin-top: 16px">
        <table>
          <thead>
            <tr>
              <th style="width: 30px"></th>
              <th>原始消息</th>
              <th>线径</th>
              <th>料号</th>
              <th style="width: 80px">数量</th>
              <th>方向</th>
              <th style="width: 90px">机台号</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in parsed" :key="i">
              <td><input type="checkbox" v-model="p.checked" /></td>
              <td>{{ p.raw }}</td>
              <td>
                <select v-model="p.wire_size">
                  <option value="">选择线径…</option>
                  <option v-for="ws in meta?.wire_sizes || []" :key="ws" :value="ws">{{ ws }}</option>
                </select>
              </td>
              <td>
                <select v-model="p.mbd">
                  <option value="">选择料号…</option>
                  <option v-for="m in mbdOptionsFor(p.wire_size)" :key="m" :value="m">{{ m }}</option>
                </select>
              </td>
              <td><input v-model.number="p.qty" type="number" min="0" /></td>
              <td>
                <select v-model="p.direction">
                  <option :value="1">新增 (+)</option>
                  <option :value="-1">拿走 (−)</option>
                </select>
              </td>
              <td><input v-model="p.machine" placeholder="可选" /></td>
              <td>
                <span v-if="p.wire_size && p.mbd && p.qty != null" class="badge green">可提交</span>
                <span v-else class="badge red" :title="p.warnings.join('；')">需补选</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top: 12px">
          <button class="btn primary" :disabled="submitting || !validItems.length" @click="submitParsed">
            提交（{{ validItems.length }} 条）
          </button>
        </div>
      </div>
    </div>

    <!-- 手动录入 -->
    <div class="card">
      <h2 class="section-title">手动录入</h2>
      <div class="hint">料号可直接输入新号（不在本地列表里也可新增）；机台号可不填。</div>
      <div class="form-row">
        <label>线径</label>
        <select v-model="mWire">
          <option v-for="ws in meta?.wire_sizes || []" :key="ws" :value="ws">{{ ws }}</option>
        </select>
        <label>料号</label>
        <input v-model="mMbd" list="mbd-list" placeholder="输入或选择料号…" data-testid="mMbd" />
        <datalist id="mbd-list">
          <option v-for="m in mbdOptions" :key="m" :value="m">{{ m }}</option>
        </datalist>
      </div>
      <div class="form-row">
        <label>数量</label>
        <input v-model.number="mQty" type="number" min="0" style="max-width: 120px" data-testid="mQty" />
        <label>方向</label>
        <select v-model="mDir" style="max-width: 150px" data-testid="mDir">
          <option :value="1">新增（增加）</option>
          <option :value="-1">拿走（减少）</option>
        </select>
        <label>机台号</label>
        <input v-model="mMachine" placeholder="可选" style="max-width: 120px" data-testid="mMachine" />
        <button class="btn primary" :disabled="submitting" @click="submitManual">提交</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 76px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}
.toast {
  background: #1f2937;
  color: #fff;
  padding: 12px 18px;
  border-radius: 12px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 340px;
  animation: toast-in 0.25s ease;
}
.toast.full {
  background: #15803d;
}
.toast.warn {
  background: #c2410c;
}
.toast-icon {
  font-size: 18px;
}
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
