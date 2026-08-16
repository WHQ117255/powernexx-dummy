<script setup>
import { ref, computed } from 'vue';
import Dashboard from './views/Dashboard.vue';
import Update from './views/Update.vue';
import Upload from './views/Upload.vue';
import History from './views/History.vue';

const tabs = [
  { key: 'dashboard', label: '总览', component: Dashboard },
  { key: 'update', label: '手动更新', component: Update },
  { key: 'upload', label: '上传同步', component: Upload },
  { key: 'history', label: '历史明细', component: History },
];

const view = ref('dashboard');
const viewComponent = computed(() => tabs.find((t) => t.key === view.value)?.component);
</script>

<template>
  <header class="app-header">
    <h1>powernexx dummy管理</h1>
    <nav>
      <button
        v-for="t in tabs"
        :key="t.key"
        :class="{ active: view === t.key }"
        @click="view = t.key"
      >
        {{ t.label }}
      </button>
    </nav>
  </header>
  <main class="app-main">
    <component :is="viewComponent" />
  </main>
</template>
