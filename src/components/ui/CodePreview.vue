<template>
  <div class="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-bg-code">
    <div v-if="loading" class="flex flex-1 items-center justify-center gap-2 text-sm text-text-muted">
      <Loader2 class="h-4 w-4 animate-spin text-brand-pink" aria-hidden="true" />
      <span>{{ loadingText }}</span>
    </div>
    <pre
      v-else
      class="m-0 flex-1 overflow-auto p-4 font-mono text-[13px] leading-6 text-text-code selection:bg-brand-pink/25 md:p-5"
      tabindex="0"
      aria-label="JSON 预览"
    ><code>{{ content }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';

withDefaults(defineProps<{
  content: string;
  loading?: boolean;
  loadingText?: string;
}>(), {
  loading: false,
  loadingText: '读取中...',
});
</script>
