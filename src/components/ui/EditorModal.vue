<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-6 bg-[#121212]/80 backdrop-blur-md"
        @click.self="closeModal"
      >
        <div class="modal-panel w-full md:max-w-4xl md:max-h-[88vh] max-h-[92vh] bg-[#1c1c1e] border border-[#38383a] md:rounded-2xl rounded-t-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden relative">
          <!-- Header -->
          <div class="flex items-center justify-between gap-3 p-4 border-b border-[#38383a] bg-[#0a0a0a]/60 backdrop-blur-xl shrink-0 z-10">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <slot name="title">
                <span v-if="!editableTitle" class="text-[#f5f5f7] font-semibold truncate">{{ title || 'untitled' }}</span>
                <input
                  v-else
                  :value="title"
                  @input="$emit('update:title', ($event.target as HTMLInputElement).value)"
                  class="bg-transparent text-[#f5f5f7] font-semibold outline-none border-b border-transparent focus:border-[#F596AA] transition-colors truncate min-w-[50px] max-w-[200px] px-1"
                  placeholder="untitled"
                />
                <span class="text-[#86868b] font-mono text-sm select-none">{{ extension }}</span>
              </slot>
            </div>
            
            <div class="flex items-center gap-2 shrink-0">
              <slot name="header-actions"></slot>

              <button
                v-if="showSave && isDirty"
                @click="$emit('reset')"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-[#2c2c2e] text-[#86868b] border border-[#38383a] hover:text-[#f5f5f7] cursor-pointer"
                title="复位"
              >
                <RotateCcw :size="14" /> <span class="hidden md:inline">复位</span>
              </button>

              <button
                v-if="showSave"
                @click="$emit('save')"
                :disabled="!isDirty || isSaving"
                :class="[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  (isDirty && !isSaving) ? 'bg-[#F596AA] text-[#f5f5f7] hover:bg-[#F596AA]/90 cursor-pointer shadow-lg shadow-[#F596AA]/20' : 'bg-[#2c2c2e] text-[#86868b] border border-[#38383a] cursor-not-allowed'
                ]"
                title="保存"
              >
                <Loader2 v-if="isSaving" :size="14" class="animate-spin" />
                <Save v-else :size="14" /> <span class="hidden md:inline">{{ saveText }}</span>
              </button>

              <button
                @click="closeModal"
                class="w-8 h-8 flex items-center justify-center rounded-full text-[#86868b] hover:text-[#f5f5f7] hover:bg-[#2c2c2e] transition-colors cursor-pointer"
                title="关闭"
              >
                <X :size="16" />
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-hidden relative flex flex-col">
            <slot></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { X, Save, Loader2, RotateCcw } from 'lucide-vue-next';

defineProps<{
  isOpen: boolean;
  title?: string;
  editableTitle?: boolean;
  extension?: string;
  isDirty?: boolean;
  isSaving?: boolean;
  showSave?: boolean;
  saveText?: string;
}>();

const emit = defineEmits<{
  (e: 'update:isOpen', value: boolean): void;
  (e: 'update:title', value: string): void;
  (e: 'save'): void;
  (e: 'reset'): void;
  (e: 'close'): void;
}>();

function closeModal() {
  emit('close');
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease;
}
.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: translateY(15px) scale(0.99);
}
@media (max-width: 768px) {
  .modal-enter-from .modal-panel,
  .modal-leave-to .modal-panel {
    transform: translateY(100%);
    opacity: 0;
  }
}
</style>
