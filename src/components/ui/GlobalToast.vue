<template>
  <Teleport to="body">
    <div
      class="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 backdrop-blur-md pointer-events-none"
      :class="status !== 'idle'
        ? 'opacity-100 bg-[#1c1c1e]/90 border-[#38383a] shadow-xl translate-y-0'
        : 'opacity-0 border-transparent -translate-y-4'"
    >
      <span v-if="status !== 'idle'" class="relative flex h-2 w-2 shrink-0">
        <span
          v-if="status === 'saving' || status === 'refreshing'"
          class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
          :class="status === 'saving' ? 'bg-[#F596AA]' : 'bg-blue-400'"
        />
        <span
          class="relative inline-flex rounded-full h-2 w-2"
          :class="{
            'bg-[#F596AA]': status === 'saving',
            'bg-blue-400': status === 'refreshing',
            'bg-emerald-400': status === 'success',
            'bg-amber-400': status === 'warning',
            'bg-red-400': status === 'error',
          }"
        />
      </span>
      <span class="text-xs text-[#f5f5f7] whitespace-nowrap">{{ displayMessage }}</span>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  message?: string;
}>();

const displayMessage = computed(() => {
  switch (props.status) {
    case 'saving': return '正在保存...';
    case 'refreshing': return '正在刷新...';
    case 'success': return props.message || '操作成功';
    case 'warning': return props.message || '操作完成，但有警告';
    case 'error': return props.message || '操作失败';
    default: return '';
  }
});
</script>
