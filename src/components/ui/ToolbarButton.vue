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
  variant?: 'secondary' | 'primary' | 'danger' | 'success';
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
}>(), {
  variant: 'secondary',
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
      ? 'bg-danger/20 text-danger cursor-pointer'
      : 'bg-brand-pink/20 text-brand-pink cursor-pointer';
  }

  if (props.disabled || props.loading) {
    return props.variant === 'primary'
      ? 'bg-bg-elevated text-text-muted border border-border-base cursor-not-allowed'
      : 'text-text-muted/40 cursor-not-allowed';
  }

  if (props.variant === 'primary') {
    return 'bg-brand-pink text-text-primary hover:bg-brand-pink/90 cursor-pointer shadow-lg shadow-brand-pink/20';
  }

  return 'text-text-muted hover:text-text-primary hover:bg-bg-elevated cursor-pointer';
});
</script>
