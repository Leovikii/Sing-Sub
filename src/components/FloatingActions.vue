<template>
  <div class="fab-container">
    <div class="flex flex-col gap-3 p-2 rounded-[28px] glass !rounded-[28px]">
      <button
        @click="handleRefresh"
        :disabled="refreshing"
        class="fab-btn group"
        title="刷新"
      >
        <RefreshCw
          :size="20"
          class="fab-icon transition-colors duration-200 group-hover:text-[#f5f5f7]"
          :class="refreshing ? 'fab-spin text-[#F596AA]' : 'text-[#86868b]'"
        />
      </button>

      <button
        @click="handleAdd"
        class="fab-btn group"
        :class="{ 'fab-bounce': addBounce }"
        title="新增配置"
      >
        <Plus
          :size="20"
          class="fab-icon text-[#86868b] transition-colors duration-200 group-hover:text-[#f5f5f7]"
        />
      </button>

      <button
        @click="handleSort"
        class="fab-btn group"
        :class="{ 'fab-bounce': sortBounce }"
        title="按名称排序"
      >
        <ArrowDownAZ
          :size="20"
          class="fab-icon text-[#86868b] transition-colors duration-200 group-hover:text-[#f5f5f7]"
        />
      </button>

      <button
        @click="handleSave"
        :disabled="saveState !== 'idle'"
        class="fab-btn fab-save group"
        :class="{
          'fab-success': saveState === 'success',
          'fab-error': saveState === 'error',
        }"
        title="保存所有配置"
      >
        <Loader2
          v-if="saveState === 'saving'"
          :size="20"
          class="fab-icon fab-spin text-[#F596AA]"
        />
        <Check
          v-else-if="saveState === 'success'"
          :size="20"
          class="fab-icon text-emerald-400"
        />
        <X
          v-else-if="saveState === 'error'"
          :size="20"
          class="fab-icon text-red-400"
        />
        <Save
          v-else
          :size="20"
          class="fab-icon text-[#F596AA] transition-colors duration-200 group-hover:text-[#f5f5f7]"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RefreshCw, Plus, ArrowDownAZ, Save, Check, X, Loader2 } from 'lucide-vue-next';

const props = defineProps<{
  saveState: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  refreshing: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  add: [];
  sort: [];
  save: [];
}>();

const addBounce = ref(false);
const sortBounce = ref(false);

function handleRefresh() {
  if (props.refreshing) return;
  emit('refresh');
}

function handleAdd() {
  addBounce.value = true;
  setTimeout(() => { addBounce.value = false; }, 300);
  emit('add');
}

function handleSort() {
  sortBounce.value = true;
  setTimeout(() => { sortBounce.value = false; }, 300);
  emit('sort');
}

function handleSave() {
  if (props.saveState !== 'idle') return;
  emit('save');
}
</script>

<style scoped>
.fab-container {
  position: fixed;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  z-index: 40;
}

.fab-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(44, 44, 46, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.fab-btn:hover:not(:disabled) {
  border-color: rgba(245, 150, 170, 0.4);
  box-shadow: 0 0 12px rgba(245, 150, 170, 0.15);
  transform: scale(1.05);
}

.fab-btn:active:not(:disabled) {
  transform: scale(0.9);
}

.fab-btn:disabled {
  cursor: default;
}

.fab-icon {
  transition: color 0.2s ease;
}

.fab-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.fab-success {
  background: rgba(16, 185, 129, 0.15) !important;
  border-color: rgba(16, 185, 129, 0.3) !important;
}

.fab-error {
  background: rgba(239, 68, 68, 0.15) !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
}

.fab-save {
  border-color: rgba(245, 150, 170, 0.25);
}

.fab-bounce {
  animation: bounce-scale 0.3s ease;
}

@keyframes bounce-scale {
  0% { transform: scale(1); }
  40% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

@media (max-width: 767px) {
  .fab-container {
    top: auto;
    bottom: 6rem;
    right: 1rem;
    transform: none;
  }

  .fab-btn {
    width: 40px;
    height: 40px;
  }

  .fab-icon {
    width: 18px;
    height: 18px;
  }
}

@media (min-width: 768px) {
  .fab-container {
    right: 1.5rem;
  }
}
</style>
