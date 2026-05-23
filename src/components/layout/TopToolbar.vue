<template>
  <div class="flex items-center justify-between mb-6">
    <!-- Left: Sort (Minimalist Text Dropdown Style) -->
    <div class="relative z-50" ref="sortMenuRef">
      <button
        @click.stop="sortMenuOpen = !sortMenuOpen"
        class="flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer outline-none"
        :class="sortMenuOpen ? 'text-[#f5f5f7]' : 'text-[#86868b] hover:text-[#f5f5f7]'"
        title="更改排序方式"
      >
        <span class="inline-block" :class="{ 'tb-bounce': sortBounce }">
          <Clock v-if="sortType === 'updated'" :size="16" />
          <Calendar v-else-if="sortType === 'created'" :size="16" />
          <ArrowDownAZ v-else :size="16" />
        </span>
        <span>{{ currentSortLabel }}</span>
        <ChevronDown :size="14" class="transition-transform duration-200" :class="{ 'rotate-180': sortMenuOpen }" />
      </button>

      <Transition name="menu">
        <div
          v-if="sortMenuOpen"
          @click.stop
          class="absolute left-0 top-full mt-2 w-44 rounded-xl bg-[#1c1c1e] border border-[#38383a] shadow-[0_8px_30px_rgba(0,0,0,0.5)] overflow-hidden transform origin-top-left"
        >
          <button
            v-for="opt in sortOptions"
            :key="opt.value"
            @click="selectSort(opt.value)"
            class="w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors cursor-pointer"
            :class="opt.value === sortType ? 'bg-[#F596AA]/10 text-[#F596AA]' : 'text-[#f5f5f7] hover:bg-[#2c2c2e]'"
          >
            <Check :size="14" :class="opt.value === sortType ? 'opacity-100' : 'opacity-0'" />
            {{ opt.label }}
          </button>
        </div>
      </Transition>
    </div>

    <!-- Right: Unified Action Island -->
    <div class="flex items-center gap-1 p-1 bg-[#1c1c1e]/80 backdrop-blur-xl border border-[#38383a] rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { RefreshCw, Plus, ArrowDownAZ, Save, Check, X, Loader2, RotateCcw, Clock, Calendar, ChevronDown } from 'lucide-vue-next';

const props = defineProps<{
  saveState: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  refreshing: boolean;
  isDirty: boolean;
  sortType: 'name' | 'updated' | 'created';
}>();

const emit = defineEmits<{
  refresh: [];
  add: [];
  'update:sortType': [value: 'name' | 'updated' | 'created'];
  save: [];
  reset: [];
}>();

const addBounce = ref(false);
const sortBounce = ref(false);

const sortMenuOpen = ref(false);
const sortMenuRef = ref<HTMLElement | null>(null);

const sortOptions = [
  { label: '按更新时间排序', value: 'updated' as const },
  { label: '按创建时间排序', value: 'created' as const },
  { label: '按字母顺序排序', value: 'name' as const }
];

const currentSortLabel = computed(() => {
  return sortOptions.find(o => o.value === props.sortType)?.label || '按更新时间排序';
});

function selectSort(val: 'name' | 'updated' | 'created') {
  if (val === props.sortType) {
    sortMenuOpen.value = false;
    return;
  }
  sortBounce.value = true;
  setTimeout(() => { sortBounce.value = false; }, 300);
  emit('update:sortType', val);
  sortMenuOpen.value = false;
}

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

function onClickOutside(e: MouseEvent) {
  if (sortMenuRef.value && !sortMenuRef.value.contains(e.target as Node)) {
    sortMenuOpen.value = false;
  }
}

onMounted(() => document.addEventListener('click', onClickOutside));
onUnmounted(() => document.removeEventListener('click', onClickOutside));
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
