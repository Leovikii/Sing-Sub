<template>
  <div class="relative" ref="containerRef">
    <!-- Trigger -->
    <div
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-activedescendant="isOpen ? `select-option-${highlightedIndex}` : undefined"
      tabindex="0"
      @click="toggleOpen"
      @keydown="handleTriggerKeydown"
      :class="[
        'appearance-none rounded-lg border bg-bg-surface/80 text-text-primary transition-[border-color,box-shadow,background-color] duration-200 outline-none py-3 px-4 w-full text-[14px] flex items-center justify-between cursor-pointer select-none',
        isOpen ? 'border-brand-pink ring-4 ring-brand-pink/20' : 'border-border-base hover:border-brand-pink/50',
        !selectedLabel && 'text-text-muted'
      ]"
    >
      <span class="truncate block pr-6">{{ selectedLabel || placeholder }}</span>
      <div class="pointer-events-none flex items-center text-text-muted shrink-0">
        <svg
          class="w-4 h-4 transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </div>
    </div>

    <!-- Dropdown menu -->
    <transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <ul
        v-if="isOpen"
        role="listbox"
        class="absolute z-50 w-full mt-2 py-1 bg-bg-elevated border border-border-base rounded-xl shadow-xl max-h-60 overflow-auto focus:outline-none"
      >
        <li
          v-for="(opt, idx) in options"
          :id="`select-option-${idx}`"
          :key="opt.value"
          role="option"
          :aria-selected="modelValue === opt.value"
          @click="selectOption(opt.value)"
          @mouseenter="highlightedIndex = idx"
          class="px-4 py-2 text-[14px] cursor-pointer transition-colors flex justify-between items-center group"
          :class="[
            modelValue === opt.value
              ? 'text-brand-pink bg-brand-pink/10'
              : idx === highlightedIndex
                ? 'text-text-primary bg-bg-hover'
                : 'text-text-primary hover:bg-bg-hover'
          ]"
        >
          <span class="truncate">{{ opt.label }}</span>
          <svg
            v-if="modelValue === opt.value"
            class="w-4 h-4 text-brand-pink shrink-0 ml-2"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </li>
      </ul>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
  options: { label: string; value: string }[];
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const isOpen = ref(false);
const containerRef = ref<HTMLElement | null>(null);
const highlightedIndex = ref(0);

const selectedLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue);
  return opt ? opt.label : '';
});

function toggleOpen() {
  isOpen.value = !isOpen.value;
}

function selectOption(val: string) {
  emit('update:modelValue', val);
  isOpen.value = false;
}

function handleTriggerKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!isOpen.value) {
      isOpen.value = true;
    } else {
      const opt = props.options[highlightedIndex.value];
      if (opt) selectOption(opt.value);
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!isOpen.value) {
      isOpen.value = true;
    } else {
      highlightedIndex.value = Math.min(highlightedIndex.value + 1, props.options.length - 1);
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (isOpen.value) {
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
    }
  } else if (e.key === 'Escape') {
    if (isOpen.value) {
      e.preventDefault();
      isOpen.value = false;
    }
  }
}

watch(isOpen, (open) => {
  if (open) {
    const idx = props.options.findIndex(o => o.value === props.modelValue);
    highlightedIndex.value = idx >= 0 ? idx : 0;
  }
});

// Click outside to close
function handleClickOutside(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>
