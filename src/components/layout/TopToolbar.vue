<template>
  <div class="flex items-center justify-end mb-6">
    <!-- Right: Unified Action Island -->
    <div class="flex items-center gap-1 p-1 bg-[#1c1c1e]/80 backdrop-blur-xl border border-[#38383a] rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
      
      <!-- Dynamic Buttons (Left side to prevent pushing static buttons) -->
      <button
        v-if="isDirty"
        @click="$emit('reset')"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e] transition-colors cursor-pointer"
        title="复位"
      >
        <RotateCcw :size="14" />
        <span class="hidden md:inline">复位</span>
      </button>

      <button
        v-show="isDirty || saveState !== 'idle'"
        @click="handleSave"
        :disabled="saveState !== 'idle'"
        :class="[
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
          saveState === 'idle' ? 'bg-[#F596AA]/10 text-[#F596AA] hover:bg-[#F596AA]/20 shadow-sm shadow-[#F596AA]/10 cursor-pointer' : '',
          saveState === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : '',
          saveState === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : '',
          saveState === 'saving' ? 'bg-[#2c2c2e] text-[#86868b] cursor-not-allowed' : ''
        ]"
        title="保存"
      >
        <Loader2 v-if="saveState === 'saving'" :size="14" class="tb-spin text-[#F596AA]" />
        <Check v-else-if="saveState === 'success'" :size="14" />
        <X v-else-if="saveState === 'error'" :size="14" />
        <Save v-else :size="14" />
        <span class="hidden md:inline">保存</span>
      </button>

      <div v-if="isDirty || saveState !== 'idle'" class="w-px h-3.5 bg-[#38383a] mx-0.5"></div>

      <!-- Static Buttons -->
      <button
        @click="handleRefresh"
        :disabled="refreshing"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="刷新"
      >
        <RefreshCw :size="14" :class="{ 'tb-spin text-[#F596AA]': refreshing }" />
        <span class="hidden md:inline">刷新</span>
      </button>

      <div class="w-px h-3.5 bg-[#38383a] mx-0.5"></div>

      <button
        @click="handleAdd"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#F596AA] text-[#121212] hover:bg-[#F596AA]/90 transition-colors shadow-md shadow-[#F596AA]/20 cursor-pointer"
        title="新建配置"
      >
        <span class="inline-block" :class="{ 'tb-bounce': addBounce }"><Plus :size="14" /></span>
        <span class="hidden md:inline">新建</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RefreshCw, Plus, Save, Check, X, Loader2, RotateCcw } from 'lucide-vue-next';

const props = defineProps<{
  saveState: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  refreshing: boolean;
  isDirty: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  add: [];
  save: [];
  reset: [];
}>();

const addBounce = ref(false);

function handleRefresh() {
  if (props.refreshing) return;
  emit('refresh');
}

function handleAdd() {
  addBounce.value = true;
  setTimeout(() => { addBounce.value = false; }, 300);
  emit('add');
}

function handleSave() {
  if (props.saveState !== 'idle') return;
  emit('save');
}
</script>

<style scoped>
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
  40% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.menu-enter-active,
.menu-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
