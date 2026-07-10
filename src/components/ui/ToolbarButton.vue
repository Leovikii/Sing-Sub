<template>
  <button
    :disabled="disabled || loading"
    :title="label"
    :class="[
      label
        ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium'
        : 'w-8 h-8 flex items-center justify-center rounded-full',
      'transition-colors',
      stateClass
    ]"
  >
    <Loader2 v-if="loading" :size="label ? 14 : 16" class="animate-spin" />
    <component :is="icon" v-else :size="label ? 14 : 16" />
    <span v-if="label" class="hidden md:inline">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Loader2 } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  icon: Component;
  label?: string;
  variant?: 'ghost' | 'primary' | 'danger' | 'success';
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
}>(), {
  variant: 'ghost',
  disabled: false,
  loading: false,
  active: false,
});

const stateClass = computed(() => {
  if (props.variant === 'success') {
    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-not-allowed';
  }

  if (props.variant === 'danger' && (props.disabled || props.loading)) {
    return 'bg-red-500/10 text-red-400 border border-red-500/20 cursor-not-allowed';
  }

  if (props.active) {
    return props.variant === 'danger'
      ? 'bg-[#ff6961]/20 text-[#ff6961] cursor-pointer'
      : 'bg-[#F596AA]/20 text-[#F596AA] cursor-pointer';
  }

  if (props.disabled || props.loading) {
    return props.variant === 'primary'
      ? 'bg-[#2c2c2e] text-[#86868b] border border-[#38383a] cursor-not-allowed'
      : 'text-[#86868b]/40 cursor-not-allowed';
  }

  if (props.variant === 'primary') {
    return 'bg-[#F596AA] text-[#f5f5f7] hover:bg-[#F596AA]/90 cursor-pointer shadow-lg shadow-[#F596AA]/20';
  }

  return 'text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e] cursor-pointer';
});
</script>
