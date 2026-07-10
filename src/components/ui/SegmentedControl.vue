<template>
  <div class="relative flex items-center p-1 bg-bg-surface/80 backdrop-blur-xl border border-border-base rounded-full shadow-md">
    <!-- Animated slider background -->
    <div
      class="absolute rounded-full bg-border-base shadow-sm pointer-events-none"
      :class="[!ready && 'opacity-0', sliding ? 'transition-[left,width] duration-[380ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]' : 'transition-none']"
      :style="{
        left: `${sliderLeft}px`,
        width: `${sliderWidth}px`,
        height: `calc(100% - 8px)`,
        top: '4px',
      }"
    />

    <!-- Buttons -->
    <button
      v-for="(opt, index) in options"
      :key="opt.value"
      :ref="el => { if (el) buttonRefs[index] = el as HTMLButtonElement }"
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
import { computed, ref, watch, nextTick, onMounted, onUnmounted, type Component } from 'vue';

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

const buttonRefs = ref<HTMLButtonElement[]>([]);
const sliderLeft = ref(0);
const sliderWidth = ref(0);
const ready = ref(false);
const sliding = ref(false);
let resizeObserver: ResizeObserver | null = null;

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'gap-1 px-2 py-1 text-[11px]';
    case 'lg':
      return 'gap-2 px-4 py-2 text-sm';
    case 'md':
    default:
      return 'gap-1.5 px-3 py-1.5 text-xs';
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

function updateSliderPosition(animate = true) {
  const selectedIndex = props.options.findIndex(opt => opt.value === props.modelValue);
  if (selectedIndex === -1 || !buttonRefs.value[selectedIndex]) return;

  const selectedButton = buttonRefs.value[selectedIndex];
  const container = selectedButton.parentElement;
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const buttonRect = selectedButton.getBoundingClientRect();

  sliding.value = animate;
  sliderLeft.value = buttonRect.left - containerRect.left;
  sliderWidth.value = buttonRect.width;

  if (!ready.value) {
    ready.value = true;
  }

  if (animate) {
    setTimeout(() => {
      sliding.value = false;
    }, 380);
  }
}

function handleSelect(value: string) {
  emit('update:modelValue', value);
}

watch(() => props.modelValue, () => {
  nextTick(() => {
    updateSliderPosition();
  });
});

watch(() => props.options.length, () => {
  nextTick(() => {
    updateSliderPosition();
  });
});

function handleWindowResize() {
  updateSliderPosition(false);
}

onMounted(() => {
  nextTick(() => {
    updateSliderPosition(false);
  });

  // Re-calculate on window resize
  window.addEventListener('resize', handleWindowResize);

  // Observe size changes of buttons (responsive label visibility)
  if (buttonRefs.value.length > 0 && buttonRefs.value[0]) {
    resizeObserver = new ResizeObserver(() => {
      updateSliderPosition(false);
    });
    buttonRefs.value.forEach(btn => {
      if (btn) resizeObserver?.observe(btn);
    });
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize);
  resizeObserver?.disconnect();
});
</script>
