<template>
  <div class="flex items-center gap-1 p-2 bg-bg-surface border-b border-border-base overflow-x-auto hide-scrollbar shrink-0">
    <!-- Action group -->
    <div class="flex items-center gap-1 bg-[#0a0a0a] rounded-lg p-1 border border-bg-elevated">
      <button @click="$emit('undo')" :disabled="!canUndo" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0" title="撤销 (Ctrl+Z)">
        <Undo2 class="w-4 h-4" />
        <span class="hidden sm:inline text-xs font-medium">撤销</span>
      </button>
      <button @click="$emit('redo')" :disabled="!canRedo" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0" title="重做 (Ctrl+Y)">
        <Redo2 class="w-4 h-4" />
        <span class="hidden sm:inline text-xs font-medium">重做</span>
      </button>
    </div>

    <!-- Edit group -->
    <div class="flex items-center gap-1 bg-[#0a0a0a] rounded-lg p-1 border border-bg-elevated">
      <button @click="$emit('format')" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-amber-500/90 hover:text-amber-400 hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0" title="格式化 JSON (Shift+Alt+F)">
        <Wand2 class="w-4 h-4" />
        <span class="hidden sm:inline text-xs font-medium">格式化</span>
      </button>
    </div>

    <!-- Search/Replace group -->
    <div class="flex items-center gap-1 bg-[#0a0a0a] rounded-lg p-1 border border-bg-elevated ml-auto">
      <button @click="$emit('replace')" class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0" title="查找/替换 (Ctrl+F/H)">
        <Search class="w-4 h-4" />
        <span class="hidden sm:inline text-xs font-medium">查找 / 替换</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Undo2, Redo2, Wand2, Search } from 'lucide-vue-next';

defineProps<{
  canUndo?: boolean;
  canRedo?: boolean;
}>();

defineEmits(['undo', 'redo', 'format', 'replace']);
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
