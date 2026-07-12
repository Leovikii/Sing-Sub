<template>
  <div
    class="relative grid h-[46px] items-center rounded-full border border-border-base bg-bg-surface p-0 shadow-md md:h-9 md:p-0.5"
    :style="{ gridTemplateColumns: `repeat(${segmentCount}, minmax(0, 1fr))` }"
  >
    <!-- Animated slider background -->
    <div
      class="pointer-events-none absolute left-0.5 top-0.5 h-[calc(100%-4px)] rounded-full bg-border-base shadow-sm transition-transform duration-[220ms] ease-[cubic-bezier(0.2,0,0,1)]"
      :style="sliderStyle"
    />

    <!-- Buttons -->
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      :aria-pressed="opt.value === modelValue"
      @click="handleSelect(opt.value)"
      :class="[
        'relative flex items-center justify-center rounded-full font-medium cursor-pointer z-10 transition-[color,transform] duration-200 active:scale-95',
        opt.value === modelValue ? 'text-text-primary' : 'text-text-muted hover:text-text-primary',
        sizeClass
      ]"
      :title="opt.label"
    >
      <component :is="opt.icon" :size="iconSize" />
      <span :class="labelBreakpoint === 'sm' ? 'hidden sm:inline' : 'hidden md:inline'">{{ opt.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: string;
  options: { value: string; label: string; icon: Component }[];
  labelBreakpoint?: 'sm' | 'md';
  size?: 'sm' | 'md' | 'lg';
}>(), {
  labelBreakpoint: 'md',
  size: 'md',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const segmentCount = computed(() => Math.max(props.options.length, 1));
const selectedIndex = computed(() => Math.max(props.options.findIndex(option => option.value === props.modelValue), 0));
const sliderStyle = computed(() => ({
  width: `calc((100% - 4px) / ${segmentCount.value})`,
  transform: `translateX(${selectedIndex.value * 100}%)`,
}));

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'h-full min-w-11 gap-1 px-2 text-[11px] md:min-w-0';
    case 'lg':
      return 'h-full min-w-11 gap-2 px-4 text-sm md:min-w-0';
    case 'md':
    default:
      return 'h-full min-w-11 gap-1.5 px-3 text-xs md:min-w-0';
  }
});

const iconSize = computed(() => {
  switch (props.size) {
    case 'sm':
      return 12;
    case 'lg':
      return 16;
    case 'md':
    default:
      return 14;
  }
});

function handleSelect(value: string) {
  emit('update:modelValue', value);
}
</script>
