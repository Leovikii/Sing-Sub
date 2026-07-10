<template>
  <div class="relative flex flex-col mb-6 gap-y-4">
    <!-- Global fixed toast -->
    <div
      class="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 backdrop-blur-md"
      :class="saveStatus !== 'idle'
        ? 'opacity-100 bg-[#1c1c1e]/90 border-[#38383a] shadow-xl translate-y-0'
        : 'opacity-0 pointer-events-none border-transparent -translate-y-4'"
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

    <!-- Row 1: Actions -->
    <div class="flex items-center justify-end w-full min-h-[42px]">
    <!-- Right: Unified Action Island -->
      <div class="flex items-center gap-0.5 p-1 bg-[#1c1c1e]/80 backdrop-blur-xl border border-[#38383a] rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)]">

        <!-- Dynamic Buttons -->
        <AppleToolbarButton
          :icon="RotateCcw"
          label="复位"
          :disabled="!isDirty"
          @click="$emit('reset')"
        />

        <AppleToolbarButton
          :icon="saveStatusIcon"
          label="保存"
          :variant="saveStatusVariant"
          :disabled="saveStatus !== 'idle'"
          :loading="saveStatus === 'saving'"
          @click="handleSave"
        />

        <!-- Static Buttons -->
        <AppleToolbarButton
          :icon="RefreshCw"
          label="刷新"
          :disabled="refreshing"
          :loading="refreshing"
          @click="handleRefresh"
        />

        <AppleToolbarButton
          :icon="Plus"
          label="新建"
          variant="primary"
          :class="{ 'scale-90 opacity-80': addBounce }"
          @click="handleAdd"
        />
      </div>
    </div>

    <!-- Center/Row 2: Category Switcher (only visible in Assets tab) -->
    <Transition name="fade-scale">
      <div v-if="activeTab === 'assets'" class="flex justify-center md:absolute md:left-1/2 md:top-[21px] md:-translate-x-1/2 md:-translate-y-1/2 pointer-events-auto z-10 w-full md:w-auto">
        <AppleSegmentedControl
          :modelValue="assetType ?? 'node'"
          @update:modelValue="$emit('update:assetType', $event as 'node' | 'template' | 'patch' | 'ruleset')"
          :options="assetTypeOptions"
          labelBreakpoint="sm"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { RefreshCw, Plus, Save, Check, X, RotateCcw, Network, LayoutTemplate, Puzzle, Shield } from 'lucide-vue-next';
import AppleToolbarButton from '../ui/AppleToolbarButton.vue';
import AppleSegmentedControl from '../ui/AppleSegmentedControl.vue';

const props = defineProps<{
  saveStatus: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  statusMessage?: string;
  refreshing: boolean;
  isDirty: boolean;
  activeTab?: 'config' | 'assets' | 'settings';
  assetType?: 'node' | 'template' | 'patch' | 'ruleset';
}>();

const assetTypeOptions = [
  { value: 'node', label: '节点', icon: Network },
  { value: 'template', label: '模板', icon: LayoutTemplate },
  { value: 'patch', label: '补丁', icon: Puzzle },
  { value: 'ruleset', label: '规则集', icon: Shield },
];

const saveStatusIcon = computed(() => {
  switch (props.saveStatus) {
    case 'success': return Check;
    case 'error': return X;
    default: return Save;
  }
});

const saveStatusVariant = computed(() => {
  switch (props.saveStatus) {
    case 'success': return 'success';
    case 'error': return 'danger';
    default: return 'primary';
  }
});

const emit = defineEmits<{
  refresh: [];
  add: [];
  save: [];
  reset: [];
  'update:assetType': [value: 'node' | 'template' | 'patch' | 'ruleset'];
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
