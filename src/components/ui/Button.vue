<template>
  <button
    :class="[
      'rounded-xl px-6 py-2.5 font-medium text-[14px] transition-all duration-200 cursor-pointer border-none inline-flex justify-center items-center',
      variant === 'primary' ? 'bg-brand-pink text-bg-page hover:bg-brand-pink-hover hover:scale-[1.02] shadow-lg shadow-brand-pink/20' :
      variant === 'danger' ? 'bg-danger text-bg-page hover:bg-danger-hover hover:scale-[1.02] shadow-lg shadow-danger/20' :
      'bg-bg-elevated text-text-primary hover:bg-bg-hover',
      { 'opacity-70 cursor-not-allowed': loading }
    ]"
    :disabled="loading"
    :type="type"
  >
    <Loader2 v-if="loading" :size="16" class="mr-2 animate-spin" :class="variant === 'primary' ? 'text-bg-page' : (variant === 'danger' ? 'text-bg-page' : 'text-brand-pink')" />
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';

withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
}>(), {
  variant: 'primary',
  loading: false,
  type: 'button'
});
</script>
