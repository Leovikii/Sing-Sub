<template>
  <div class="flex-1 relative flex flex-col h-full w-full min-h-[60vh] bg-[#0d0d0d]">
    <!-- Loading State -->
    <div v-if="loading" class="absolute inset-0 flex flex-col justify-center items-center z-10 bg-[#0d0d0d]/80 backdrop-blur-sm">
      <Loader2 class="w-8 h-8 text-[#F596AA] animate-spin mb-4" />
      <span class="text-[#86868b]">{{ loadingText || '加载中...' }}</span>
    </div>
    
    <!-- Error State -->
    <div v-else-if="error" class="flex-1 p-6 text-[#ff6961] overflow-auto">
      <h3 class="font-bold mb-2">错误:</h3>
      <pre class="text-sm whitespace-pre-wrap">{{ error }}</pre>
    </div>

    <!-- Readonly Preview -->
    <pre 
      v-else-if="readonly" 
      class="flex-1 w-full h-full p-6 text-[#a1a1aa] font-mono text-sm leading-relaxed overflow-auto selection:bg-[#F596AA]/30 selection:text-[#f5f5f7] m-0"
    >{{ modelValue }}</pre>

    <!-- Editable Textarea -->
    <textarea
      v-else
      :value="modelValue"
      @input="updateValue"
      class="flex-1 w-full h-full p-6 bg-transparent text-[#a1a1aa] font-mono text-sm leading-relaxed resize-none outline-none selection:bg-[#F596AA]/30 selection:text-[#f5f5f7] m-0"
      spellcheck="false"
    ></textarea>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';

const props = defineProps<{
  modelValue: string;
  readonly?: boolean;
  loading?: boolean;
  loadingText?: string;
  error?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

function updateValue(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value);
}
</script>
