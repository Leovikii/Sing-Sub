<template>
  <div class="flex items-center gap-1 p-2 bg-bg-surface border-b border-border-base overflow-x-auto hide-scrollbar shrink-0">
    <!-- Action group -->
    <div class="flex items-center gap-1 bg-bg-code-toolbar rounded-md p-1 border border-bg-elevated">
      <Button text severity="secondary" size="small" @click="$emit('undo')" :disabled="!canUndo" :aria-label="t('common.undo')" v-tooltip.bottom="`${t('common.undo')} (Ctrl+Z)`">
        <Undo2 class="w-4 h-4" />
        <span class="hidden sm:inline text-xs font-medium">{{ t('common.undo') }}</span>
      </Button>
      <Button text severity="secondary" size="small" @click="$emit('redo')" :disabled="!canRedo" :aria-label="t('common.redo')" v-tooltip.bottom="`${t('common.redo')} (Ctrl+Y)`">
        <Redo2 class="w-4 h-4" />
        <span class="hidden sm:inline text-xs font-medium">{{ t('common.redo') }}</span>
      </Button>
    </div>

    <!-- Edit group -->
    <div class="flex items-center gap-1 bg-bg-code-toolbar rounded-md p-1 border border-bg-elevated">
      <Button text severity="secondary" size="small" @click="$emit('format')" :aria-label="t('common.formatJson')" v-tooltip.bottom="`${t('common.formatJson')} (Shift+Alt+F)`">
        <Wand2 class="w-4 h-4" />
        <span class="hidden sm:inline text-xs font-medium">{{ t('common.formatJson') }}</span>
      </Button>
    </div>

    <!-- Search/Replace group -->
    <div class="flex items-center gap-1 bg-bg-code-toolbar rounded-md p-1 border border-bg-elevated ml-auto">
      <Button text severity="secondary" size="small" @click="$emit('replace')" :aria-label="t('common.searchReplace')" v-tooltip.bottom="`${t('common.searchReplace')} (Ctrl+F/H)`">
        <Search class="w-4 h-4" />
        <span class="hidden sm:inline text-xs font-medium">{{ t('common.searchReplace') }}</span>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Undo2, Redo2, Wand2, Search } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';

const { t } = useI18n();

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
