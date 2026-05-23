<template>
  <button
    :class="[
      'rounded-[20px] px-6 py-2.5 font-medium text-[14px] transition-all duration-200 cursor-pointer border-none inline-flex justify-center items-center',
      variant === 'primary' ? 'bg-[#F596AA] text-[#121212] hover:bg-[#ffb1c2] hover:scale-[1.02] shadow-lg shadow-[#F596AA]/20' : 
      variant === 'danger' ? 'bg-[#ff6961] text-[#121212] hover:bg-[#ff8a84] hover:scale-[1.02] shadow-lg shadow-[#ff6961]/20' :
      'bg-[#2c2c2e] text-[#f5f5f7] hover:bg-[#3a3a3c]',
      { 'opacity-70 cursor-not-allowed': loading }
    ]"
    :disabled="loading"
    :type="type"
  >
    <Loader2 v-if="loading" :size="16" class="mr-2 animate-spin" :class="variant === 'primary' ? 'text-[#121212]' : (variant === 'danger' ? 'text-[#121212]' : 'text-[#F596AA]')" />
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