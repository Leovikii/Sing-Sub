<template>
  <div class="flex min-h-9 items-center justify-between gap-4 mb-6">
    <!-- Left: Asset type selector (replaces old status toast position) -->
    <div class="flex min-h-9 items-center">
      <SegmentedControl
        v-if="activeTab === 'assets'"
        :modelValue="assetType ?? 'node'"
        @update:modelValue="$emit('update:assetType', $event as 'node' | 'template' | 'patch' | 'ruleset')"
        :options="assetTypeOptions"
        size="md"
        labelBreakpoint="sm"
      />
    </div>

    <!-- Right: Action buttons -->
    <div class="flex items-center gap-2">
      <ToolbarButton
        class="order-2"
        :icon="saveStatusIcon"
        label="保存"
        :variant="saveStatusVariant"
        :disabled="!isDirty || saveStatus !== 'idle'"
        :loading="saveStatus === 'saving'"
        @click="handleSave"
      />

      <ToolbarButton
        class="order-1"
        :icon="RefreshCw"
        label="刷新"
        :disabled="refreshing || saveStatus !== 'idle'"
        :loading="refreshing"
        @click="handleRefresh"
      />

      <ToolbarButton
        :icon="Plus"
        label="新建"
        variant="primary"
        :class="['order-3', { 'scale-90 opacity-80': addBounce }]"
        @click="handleAdd"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { RefreshCw, Plus, Save, Check, X, Network, LayoutTemplate, Puzzle, Shield } from 'lucide-vue-next';
import ToolbarButton from '../ui/ToolbarButton.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';

const props = defineProps<{
  saveStatus: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  refreshing: boolean;
  isDirty: boolean;
  activeTab: 'config' | 'assets' | 'settings';
  assetType: 'node' | 'template' | 'patch' | 'ruleset' | null;
}>();

const emit = defineEmits<{
  refresh: [];
  add: [];
  save: [];
  'update:assetType': [value: 'node' | 'template' | 'patch' | 'ruleset'];
}>();

const addBounce = ref(false);

const assetTypeOptions = computed(() => [
  { value: 'node', label: '节点', icon: Network },
  { value: 'template', label: '模板', icon: LayoutTemplate },
  { value: 'patch', label: '补丁', icon: Puzzle },
  { value: 'ruleset', label: '规则集', icon: Shield },
]);

const saveStatusIcon = computed(() => {
  switch (props.saveStatus) {
    case 'success': return Check;
    case 'error': return X;
    default: return Save;
  }
});

const saveStatusVariant = computed<'secondary' | 'primary' | 'danger' | 'success'>(() => {
  if (props.saveStatus === 'idle' && props.isDirty) return 'primary';

  switch (props.saveStatus) {
    case 'success': return 'success';
    case 'error': return 'danger';
    default: return 'secondary';
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
