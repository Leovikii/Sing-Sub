<template>
  <button
    type="button"
    :aria-label="label"
    :aria-current="active ? 'page' : undefined"
    class="group relative flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink md:grid md:h-12 md:w-full md:flex-none md:grid-cols-[72px_minmax(0,1fr)] md:items-center md:gap-0 md:overflow-hidden md:px-0 md:rounded-lg"
    :class="[
      active
        ? 'bg-brand-pink/18 text-[#ffc4d0] md:shadow-[inset_0_0_0_1px_rgba(245,150,170,0.22)]'
        : 'text-text-muted hover:bg-bg-elevated hover:text-text-primary'
    ]"
    @click="$emit('select')"
  >
    <component :is="icon" :size="20" class="md:justify-self-center" aria-hidden="true" />
    <span class="text-[11px] font-medium leading-tight md:hidden">{{ label }}</span>
    <span
      class="hidden min-w-0 whitespace-nowrap text-sm font-medium leading-tight transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none md:block md:justify-self-start"
      :class="showLabel ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-1 opacity-0'"
    >
      {{ label }}
    </span>
  </button>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  label: string;
  icon: Component;
  active: boolean;
  showLabel: boolean;
}>();

defineEmits<{
  select: [];
}>();
</script>
