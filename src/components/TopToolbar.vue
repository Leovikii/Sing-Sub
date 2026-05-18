<template>
  <div class="toolbar-wrapper">
    <div class="toolbar flex items-center justify-between gap-3 px-3 py-2 sm:px-4 sm:py-2.5">
      <button
        @click="handleSort"
        :class="['tb-btn', { 'tb-bounce': sortBounce }]"
        title="按名称排序"
      >
        <ArrowDownAZ :size="16" class="text-[#86868b]" />
        <span class="tb-label">排序</span>
      </button>

      <div class="flex items-center gap-1.5 sm:gap-2">
        <button
          @click="handleRefresh"
          :disabled="refreshing"
          class="tb-btn"
          title="刷新"
        >
          <RefreshCw
            :size="16"
            :class="refreshing ? 'tb-spin text-[#F596AA]' : 'text-[#86868b]'"
          />
          <span class="tb-label">刷新</span>
        </button>

        <button
          @click="handleAdd"
          :class="['tb-btn', { 'tb-bounce': addBounce }]"
          title="新增配置"
        >
          <Plus :size="16" class="text-[#86868b]" />
          <span class="tb-label">新建</span>
        </button>

        <button
          @click="handleSave"
          :disabled="saveState !== 'idle'"
          :class="[
            'tb-btn tb-save',
            {
              'tb-dirty': isDirty && saveState === 'idle',
              'tb-success': saveState === 'success',
              'tb-error': saveState === 'error',
            },
          ]"
          title="保存所有配置"
        >
          <Loader2
            v-if="saveState === 'saving'"
            :size="16"
            class="tb-spin text-[#F596AA]"
          />
          <Check
            v-else-if="saveState === 'success'"
            :size="16"
            class="text-emerald-400"
          />
          <X
            v-else-if="saveState === 'error'"
            :size="16"
            class="text-red-400"
          />
          <Save
            v-else
            :size="16"
            :class="isDirty ? 'text-[#F596AA]' : 'text-[#86868b]'"
          />
          <span class="tb-label">保存</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RefreshCw, Plus, ArrowDownAZ, Save, Check, X, Loader2 } from 'lucide-vue-next';

const props = defineProps<{
  saveState: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  refreshing: boolean;
  isDirty: boolean;
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
.toolbar-wrapper {
  position: sticky;
  top: 0;
  z-index: 30;
  padding-top: 4px;
  padding-bottom: 8px;
  background: linear-gradient(to bottom, rgba(18, 18, 18, 0.95) 0%, rgba(18, 18, 18, 0.7) 80%, transparent 100%);
}

.toolbar {
  background: rgba(30, 30, 32, 0.78);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  position: relative;
}

.toolbar::after {
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: -10px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(245, 150, 170, 0.45), transparent);
  pointer-events: none;
}

.tb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  color: #86868b;
  background: rgba(44, 44, 46, 0.6);
  border: 1px solid rgba(56, 56, 58, 0.8);
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, transform 0.15s ease;
}

.tb-btn:hover:not(:disabled) {
  color: #f5f5f7;
  border-color: #86868b;
}

.tb-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.tb-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.tb-label {
  display: none;
}

@media (min-width: 640px) {
  .tb-label {
    display: inline;
  }
}

.tb-spin {
  animation: tb-spin 1s linear infinite;
}

@keyframes tb-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tb-bounce {
  animation: tb-bounce-anim 0.3s ease;
}

@keyframes tb-bounce-anim {
  0% { transform: scale(1); }
  40% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.tb-save.tb-dirty {
  border-color: rgba(245, 150, 170, 0.55);
  background: rgba(245, 150, 170, 0.08);
  color: #F596AA;
  animation: tb-pulse 2.2s ease-in-out infinite;
}

.tb-save.tb-dirty:hover {
  border-color: rgba(245, 150, 170, 0.9);
  background: rgba(245, 150, 170, 0.14);
}

@keyframes tb-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 150, 170, 0.35); }
  50% { box-shadow: 0 0 0 4px rgba(245, 150, 170, 0); }
}

.tb-success {
  background: rgba(16, 185, 129, 0.15) !important;
  border-color: rgba(16, 185, 129, 0.4) !important;
  color: #34d399 !important;
}

.tb-error {
  background: rgba(239, 68, 68, 0.15) !important;
  border-color: rgba(239, 68, 68, 0.4) !important;
  color: #f87171 !important;
}
</style>
