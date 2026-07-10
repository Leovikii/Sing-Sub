<template>
  <div class="flex items-center p-1 bg-[#1c1c1e]/80 backdrop-blur-xl border border-[#38383a] rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
    <button
      v-for="opt in options"
      :key="opt.value"
      @click="$emit('update:modelValue', opt.value)"
      :class="opt.value === modelValue ? 'bg-[#38383a] text-[#f5f5f7] shadow' : 'text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e]'"
      class="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer"
      :title="opt.label"
    >
      <component :is="opt.icon" :size="14" />
      <span :class="labelBreakpoint === 'sm' ? 'hidden sm:inline' : 'hidden md:inline'">{{ opt.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  modelValue: string;
  options: { value: string; label: string; icon: Component }[];
  labelBreakpoint?: 'sm' | 'md';
}>();

defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();
</script>
