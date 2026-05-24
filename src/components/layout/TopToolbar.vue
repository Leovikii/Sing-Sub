<template>
  <div class="flex items-center justify-between mb-6">
    <!-- Left: Status indicator -->
    <div
      class="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300"
      :class="saveStatus !== 'idle'
        ? 'opacity-100 bg-[#1c1c1e]/60 border-[#2c2c2e] shadow-sm'
        : 'opacity-0 pointer-events-none border-transparent'"
    >
      <span v-if="saveStatus !== 'idle'" class="relative flex h-2 w-2 shrink-0">
        <span
          v-if="saveStatus === 'saving' || saveStatus === 'refreshing'"
          class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
          :class="saveStatus === 'saving' ? 'bg-[#F596AA]' : 'bg-blue-400'"
        />
        <span
          class="relative inline-flex rounded-full h-2 w-2"
          :class="{
            'bg-[#F596AA]': saveStatus === 'saving',
            'bg-blue-400': saveStatus === 'refreshing',
            'bg-emerald-400': saveStatus === 'success',
            'bg-amber-400': saveStatus === 'warning',
            'bg-red-400': saveStatus === 'error',
          }"
        />
      </span>
      <span v-if="saveStatus !== 'idle'" class="text-xs text-[#a1a1a6] whitespace-nowrap">{{ displayMessage }}</span>
    </div>

    <!-- Right: Unified Action Island -->
    <div class="flex items-center gap-1 p-1 bg-[#1c1c1e]/80 backdrop-blur-xl border border-[#38383a] rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)]">

      <!-- Dynamic Buttons -->
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
        v-show="isDirty || saveStatus !== 'idle'"
        @click="handleSave"
        :disabled="saveStatus !== 'idle'"
        :class="[
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
          saveStatus === 'idle' ? 'bg-[#F596AA]/10 text-[#F596AA] hover:bg-[#F596AA]/20 shadow-sm shadow-[#F596AA]/10 cursor-pointer' : '',
          saveStatus === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : '',
          saveStatus === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : '',
          saveStatus === 'saving' ? 'bg-[#2c2c2e] text-[#86868b] cursor-not-allowed' : ''
        ]"
        title="保存"
      >
        <Loader2 v-if="saveStatus === 'saving'" :size="14" class="tb-spin text-[#F596AA]" />
        <Check v-else-if="saveStatus === 'success'" :size="14" />
        <X v-else-if="saveStatus === 'error'" :size="14" />
        <Save v-else :size="14" />
        <span class="hidden md:inline">保存</span>
      </button>

      <div v-if="isDirty || saveStatus !== 'idle'" class="w-px h-3.5 bg-[#38383a] mx-0.5"></div>

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
import { ref, computed } from 'vue';
import { RefreshCw, Plus, Save, Check, X, Loader2, RotateCcw } from 'lucide-vue-next';

const props = defineProps<{
  saveStatus: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  statusMessage?: string;
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

const displayMessage = computed(() => {
  switch (props.saveStatus) {
    case 'saving': return '正在保存...';
    case 'refreshing': return '正在刷新...';
    case 'success': return props.statusMessage || '操作成功';
    case 'warning': return props.statusMessage || '操作完成，但有警告';
    case 'error': return props.statusMessage || '操作失败';
    default: return '';
  }
});

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
  if (props.saveStatus !== 'idle') return;
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
</style>
