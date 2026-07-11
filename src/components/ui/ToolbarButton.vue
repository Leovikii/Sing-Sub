<template>
  <button
    :disabled="disabled || loading"
    :title="tooltip || label"
    :aria-label="tooltip || label"
    :class="[
      sizeClass,
      'toolbar-button group relative transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink',
      stateClass
    ]"
  >
    <Loader2 v-if="loading" :size="iconSize" class="animate-spin" />
    <component :is="icon" v-else :size="iconSize" aria-hidden="true" />
    <span v-if="label && !iconOnly" class="toolbar-button-label whitespace-nowrap" :class="mobileLabel ? 'inline' : 'hidden md:inline'">{{ label }}</span>
    <span v-if="showTooltip && (tooltip || label)" class="toolbar-button-tooltip pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border-base bg-bg-elevated px-2 py-1 text-xs font-medium text-text-primary opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      {{ tooltip || label }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Loader2 } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  icon: Component;
  label?: string;
  tooltip?: string;
  variant?: 'secondary' | 'primary' | 'danger' | 'success' | 'emphasis';
  size?: 'compact' | 'card';
  iconOnly?: boolean;
  mobileLabel?: boolean;
  showTooltip?: boolean;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
}>(), {
  variant: 'secondary',
  size: 'compact',
  iconOnly: false,
  mobileLabel: false,
  showTooltip: false,
  disabled: false,
  loading: false,
  active: false,
});

const sizeClass = computed(() => {
  if (props.size === 'card') {
    return props.iconOnly
      ? 'h-9 w-9 inline-flex items-center justify-center rounded-lg text-sm'
      : 'h-9 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm';
  }
  return props.label && !props.iconOnly
    ? 'h-9 inline-flex items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium'
    : 'h-8 w-8 inline-flex items-center justify-center rounded-full';
});

const iconSize = computed(() => props.size === 'card' ? 18 : (props.label && !props.iconOnly ? 14 : 16));

const stateClass = computed(() => {
  if (props.variant === 'success') {
    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-not-allowed';
  }

  if (props.variant === 'emphasis') {
    return props.disabled || props.loading
      ? 'border border-brand-pink/10 bg-brand-pink/5 text-brand-pink/40 cursor-not-allowed'
      : 'border border-brand-pink/20 bg-brand-pink/10 text-brand-pink hover:bg-brand-pink/20 cursor-pointer';
  }

  if (props.variant === 'danger' && (props.disabled || props.loading)) {
    return 'bg-red-500/10 text-red-400 border border-red-500/20 cursor-not-allowed';
  }

  if (props.active) {
    return props.variant === 'danger'
      ? 'bg-danger/20 text-danger cursor-pointer'
      : props.variant === 'primary'
        ? 'bg-brand-pink/20 text-brand-pink cursor-pointer'
        : 'bg-bg-elevated text-text-primary cursor-pointer';
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
