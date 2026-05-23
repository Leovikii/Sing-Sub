<template>
  <div v-if="visible" class="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-12 bg-[#121212]/90 backdrop-blur-lg" @click.self="$emit('close')">
    <div class="w-full h-full max-w-6xl bg-[#0a0a0a] border border-[#38383a] rounded-2xl flex flex-col shadow-2xl overflow-hidden relative">
      <div class="flex items-center justify-between p-4 border-b border-[#38383a] bg-[#1c1c1e]">
        <div class="flex items-center gap-3">
          <span class="text-[#F596AA] font-mono text-sm">{{ title }}.json</span>
          <span v-if="loading" class="flex items-center gap-1.5 text-xs text-[#86868b]">
            <Loader2 :size="12" class="animate-spin text-[#F596AA]" />
            加载中...
          </span>
        </div>
        <button @click="$emit('close')" class="text-[#86868b] hover:text-[#f5f5f7] transition-colors cursor-pointer">✕ 关闭</button>
      </div>
      <div class="flex-1 overflow-auto p-6">
        <pre class="font-mono text-sm text-[#f5f5f7] leading-relaxed whitespace-pre-wrap"><code v-text="content"></code></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';

defineProps<{
  visible: boolean;
  title: string;
  content: string;
  loading: boolean;
}>();

defineEmits<{
  close: [];
}>();
</script>
