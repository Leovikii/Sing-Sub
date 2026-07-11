<template>
  <Teleport to="body">
    <div
      class="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-[9999] flex min-h-12 w-[calc(100vw-2rem)] sm:w-auto max-w-2xl items-center justify-center gap-3 px-4 sm:px-5 py-3 rounded-xl border transition-[opacity,transform,background-color,border-color] duration-300 backdrop-blur-md pointer-events-none"
      :class="status !== 'idle'
        ? 'opacity-100 bg-bg-surface/90 border-border-base shadow-xl translate-y-0'
        : 'opacity-0 border-transparent -translate-y-4'"
    >
      <span v-if="status !== 'idle'" class="relative flex h-2.5 w-2.5 shrink-0">
        <span
          v-if="status === 'saving' || status === 'refreshing'"
          class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
          :class="status === 'saving' ? 'bg-brand-pink' : 'bg-blue-400'"
        />
        <span
          class="relative inline-flex h-2.5 w-2.5 rounded-full"
          :class="{
            'bg-brand-pink': status === 'saving',
            'bg-blue-400': status === 'refreshing',
            'bg-emerald-400': status === 'success',
            'bg-amber-400': status === 'warning',
            'bg-red-400': status === 'error',
          }"
        />
      </span>
      <span class="min-w-0 break-words text-center text-sm font-medium leading-5 text-text-primary sm:text-[15px]">{{ displayMessage }}</span>
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
