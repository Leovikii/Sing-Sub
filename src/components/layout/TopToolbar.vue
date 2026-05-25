<template>
  <div class="relative flex flex-col mb-6 gap-y-4">
    <!-- Row 1: Status & Actions -->
    <div class="flex items-center justify-between w-full min-h-[42px]">
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
      <span class="text-xs text-[#a1a1a6] whitespace-nowrap transition-opacity duration-300" :class="saveStatus !== 'idle' ? 'opacity-100' : 'opacity-0 select-none'">{{ displayMessage || '就绪' }}</span>
    </div>



    <!-- Right: Unified Action Island -->
      <div class="flex items-center gap-0.5 p-1 bg-[#1c1c1e]/80 backdrop-blur-xl border border-[#38383a] rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)]">

        <!-- Dynamic Buttons -->
        <button
          v-if="isDirty"
          @click="$emit('reset')"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e] transition-colors cursor-pointer"
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
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors',
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

        <!-- Static Buttons -->
        <button
          @click="handleRefresh"
          :disabled="refreshing"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="刷新"
        >
          <RefreshCw :size="14" :class="{ 'tb-spin text-[#F596AA]': refreshing }" />
          <span class="hidden md:inline">刷新</span>
        </button>

        <button
          @click="handleAdd"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-[#F596AA] text-[#1c1c1e] hover:bg-[#f7aab9] transition-all duration-300 shadow shadow-[#F596AA]/20 cursor-pointer"
          :class="{ 'scale-90 opacity-80': addBounce }"
          title="新建"
        >
          <Plus :size="14" />
          <span class="hidden md:inline">新建</span>
        </button>
      </div>
    </div>

    <!-- Center/Row 2: Category Switcher (only visible in Assets tab) -->
    <Transition name="fade-scale">
      <div v-if="activeTab === 'assets'" class="flex justify-center md:absolute md:left-1/2 md:top-[21px] md:-translate-x-1/2 md:-translate-y-1/2 pointer-events-auto z-10 w-full md:w-auto">
        <div class="flex items-center p-1 bg-[#1c1c1e]/80 backdrop-blur-xl border border-[#38383a] rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <button @click="$emit('update:assetType', 'node')" :class="assetType === 'node' ? 'bg-[#38383a] text-[#f5f5f7] shadow' : 'text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e]'" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer">
            <Network :size="14" />
            <span class="hidden sm:inline">节点</span>
          </button>
          <button @click="$emit('update:assetType', 'template')" :class="assetType === 'template' ? 'bg-[#38383a] text-[#f5f5f7] shadow' : 'text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e]'" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer">
            <LayoutTemplate :size="14" />
            <span class="hidden sm:inline">模板</span>
          </button>
          <button @click="$emit('update:assetType', 'patch')" :class="assetType === 'patch' ? 'bg-[#38383a] text-[#f5f5f7] shadow' : 'text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e]'" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer">
            <Puzzle :size="14" />
            <span class="hidden sm:inline">补丁</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { RefreshCw, Plus, Save, Check, X, Loader2, RotateCcw, Network, LayoutTemplate, Puzzle } from 'lucide-vue-next';

const props = defineProps<{
  saveStatus: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  statusMessage?: string;
  refreshing: boolean;
  isDirty: boolean;
  activeTab?: 'config' | 'assets' | 'settings';
  assetType?: 'node' | 'template' | 'patch';
}>();

const emit = defineEmits<{
  refresh: [];
  add: [];
  save: [];
  reset: [];
  'update:assetType': [value: 'node' | 'template' | 'patch'];
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
