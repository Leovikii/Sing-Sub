<template>
  <button
    type="button"
    :aria-label="label"
    :aria-current="active ? 'page' : undefined"
    class="group relative flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink md:grid md:h-16 md:w-full md:flex-none md:grid-cols-[72px_minmax(0,1fr)] md:items-center md:gap-0 md:overflow-hidden md:px-0 md:rounded-lg"
    :class="[
      active
        ? 'bg-brand-pink/18 text-[#ffc4d0] md:bg-transparent'
        : 'text-[#b5b5bc] hover:bg-bg-elevated hover:text-text-primary',
    ]"
    @click="$emit('select')"
  >
    <span
      class="pointer-events-none absolute left-1 top-0 hidden h-16 w-[calc(100%-0.5rem)] rounded-lg bg-brand-pink/18 shadow-[inset_0_0_0_1px_rgba(245,150,170,0.22)] transition-opacity duration-150 md:block"
      :class="active ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    />
    <component :is="icon" :size="20" class="relative z-10 md:col-start-1 md:justify-self-center" aria-hidden="true" />
    <span class="text-[11px] font-medium leading-tight md:hidden">{{ label }}</span>
    <span v-if="showLabel" class="hidden min-w-0 whitespace-nowrap text-sm font-medium leading-tight md:block md:justify-self-start">
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
