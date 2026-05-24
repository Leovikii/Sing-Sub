<template>
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
    <div class="dock-container relative flex items-center p-1.5 rounded-full bg-[#1c1c1e]/70 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden">
      <!-- Animated slider -->
      <div 
        class="absolute top-1.5 bottom-1.5 rounded-full bg-[#38383a] transition-all duration-300 ease-out z-0"
        :style="{
          left: activeTab === 'config' ? '6px' : 'calc(50% + 3px)',
          width: 'calc(50% - 9px)'
        }"
      ></div>

      <button 
        @click="$emit('update:activeTab', 'config')"
        class="relative z-10 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-6 py-2 rounded-full transition-colors duration-300"
        :class="activeTab === 'config' ? 'text-[#F596AA]' : 'text-gray-400 hover:text-gray-200'"
      >
        <Settings2 :size="18" />
        <span class="text-[11px] md:text-sm font-medium leading-tight">配置</span>
      </button>

      <button 
        @click="$emit('update:activeTab', 'assets')"
        class="relative z-10 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-6 py-2 rounded-full transition-colors duration-300"
        :class="activeTab === 'assets' ? 'text-[#F596AA]' : 'text-gray-400 hover:text-gray-200'"
      >
        <Box :size="18" />
        <span class="text-[11px] md:text-sm font-medium leading-tight">组件</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Settings2, Box } from 'lucide-vue-next';

defineProps<{
  activeTab: 'config' | 'assets';
}>();

defineEmits<{
  'update:activeTab': [value: 'config' | 'assets'];
}>();
</script>

<style scoped>
.dock-container {
  box-shadow: 0 10px 40px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;
}
</style>
