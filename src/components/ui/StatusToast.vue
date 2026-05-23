<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 translate-y-4"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-4"
  >
    <div v-if="status !== 'idle'" class="fixed bottom-6 left-6 z-50 md:left-6 max-md:left-4 max-md:right-4 max-md:bottom-4">
      <div class="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full glass !rounded-full !shadow-lg">
        <span class="relative flex h-2.5 w-2.5">
          <span
            v-if="status === 'saving' || status === 'refreshing'"
            class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
            :class="status === 'saving' ? 'bg-[#F596AA]' : 'bg-blue-400'"
          />
          <span
            class="relative inline-flex rounded-full h-2.5 w-2.5"
            :class="{
              'bg-[#F596AA]': status === 'saving',
              'bg-blue-400': status === 'refreshing',
              'bg-emerald-400': status === 'success',
              'bg-amber-400': status === 'warning',
              'bg-red-400': status === 'error',
            }"
          />
        </span>
        <span class="text-sm text-[#f5f5f7] whitespace-nowrap">{{ displayMessage }}</span>
      </div>
    </div>
  </Transition>
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
