<template>
  <div class="relative" ref="containerRef">
    <!-- Trigger -->
    <div
      @click="isOpen = !isOpen"
      :class="[
        'appearance-none rounded-xl border bg-[#1c1c1e]/80 text-[#f5f5f7] transition-all duration-200 outline-none py-3 px-4 w-full text-[14px] flex items-center justify-between cursor-pointer select-none',
        isOpen ? 'border-[#F596AA] ring-4 ring-[#F596AA]/20' : 'border-[#38383a] hover:border-[#F596AA]/50',
        !selectedLabel && 'text-[#86868b]'
      ]"
    >
      <span class="truncate block pr-6">{{ selectedLabel || placeholder }}</span>
      <div class="pointer-events-none flex items-center text-[#86868b] shrink-0">
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
        class="absolute z-50 w-full mt-2 py-1 bg-[#2c2c2e] border border-[#38383a] rounded-xl shadow-xl max-h-60 overflow-auto focus:outline-none"
      >
        <li
          v-for="opt in options"
          :key="opt.value"
          @click="selectOption(opt.value)"
          class="px-4 py-2 text-[14px] cursor-pointer transition-colors flex justify-between items-center group"
          :class="[
            modelValue === opt.value 
              ? 'text-[#F596AA] bg-[#F596AA]/10' 
              : 'text-[#f5f5f7] hover:bg-[#3a3a3c]'
          ]"
        >
          <span class="truncate">{{ opt.label }}</span>
          <svg
            v-if="modelValue === opt.value"
            class="w-4 h-4 text-[#F596AA] shrink-0 ml-2"
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
import { ref, computed, onMounted, onUnmounted } from 'vue';

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

const selectedLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue);
  return opt ? opt.label : '';
});

function selectOption(val: string) {
  emit('update:modelValue', val);
  isOpen.value = false;
}

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
