<template>
  <button
    type="button"
    :aria-label="label"
    :aria-current="active ? 'page' : undefined"
    class="nav-item group relative flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink md:grid md:h-16 md:w-full md:max-w-none md:flex-none md:grid-cols-[72px_minmax(0,1fr)] md:items-center md:gap-0 md:overflow-hidden md:px-0 md:rounded-lg"
    :class="[
      active
        ? 'text-text-nav-active'
        : 'text-text-nav',
    ]"
    @click="$emit('select')"
  >
    <span
      class="pointer-events-none absolute inset-y-1 left-1/2 w-[calc(100%-0.5rem)] max-w-28 -translate-x-1/2 rounded-xl bg-brand-pink/18 shadow-[inset_0_0_0_1px_rgba(245,150,170,0.22)] transition-opacity duration-150 md:inset-0 md:left-0 md:w-auto md:max-w-none md:translate-x-0 md:rounded-lg"
      :class="active ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    />
    <span
      v-if="!active"
      class="nav-hover-indicator pointer-events-none absolute inset-y-1 left-1/2 w-[calc(100%-0.5rem)] max-w-28 -translate-x-1/2 rounded-xl bg-bg-elevated opacity-0 transition-opacity duration-150 md:inset-0 md:left-0 md:w-auto md:max-w-none md:translate-x-0 md:rounded-lg"
      aria-hidden="true"
    />
    <component :is="icon" :size="20" class="relative z-10 h-[22px] w-[22px] md:col-start-1 md:h-5 md:w-5 md:justify-self-center" aria-hidden="true" />
    <span class="relative z-10 text-[11px] font-medium leading-tight md:hidden">{{ label }}</span>
    <span v-if="showLabel" class="relative z-10 hidden min-w-0 whitespace-nowrap text-sm font-medium leading-tight md:block md:justify-self-start">
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

<style scoped>
@media (hover: hover) and (pointer: fine) {
  .nav-item:not([aria-current='page']):hover {
    color: var(--color-text-primary);
  }

  .nav-item:not([aria-current='page']):hover .nav-hover-indicator {
    opacity: 1;
  }
}
</style>
