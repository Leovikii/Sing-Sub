<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-6 bg-[#121212]/80 backdrop-blur-md"
      >
        <div class="modal-panel w-full md:max-w-4xl md:max-h-[88vh] max-h-[92vh] bg-[#1c1c1e] border border-[#38383a] md:rounded-2xl rounded-t-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden relative">
          <!-- Header -->
          <div class="flex items-center justify-between gap-2 p-3 md:p-4 border-b border-[#38383a] bg-[#0a0a0a]/60 backdrop-blur-xl shrink-0 z-10">
            <div class="flex flex-col min-w-0 flex-1">
              <slot name="title">
                <!-- Filename area -->
                <div class="flex items-baseline min-w-0">
                  <div class="relative inline-flex min-w-[30px] max-w-[calc(100%-40px)]">
                    <span class="invisible whitespace-pre overflow-hidden font-bold text-[15px] md:text-[16px] pr-0.5">{{ title || 'untitled' }}</span>
                    <input
                      v-if="editableTitle"
                      :value="title"
                      @input="$emit('update:title', ($event.target as HTMLInputElement).value)"
                      class="absolute inset-0 bg-transparent text-[#f5f5f7] font-bold outline-none text-[15px] md:text-[16px] w-full truncate placeholder-[#555]"
                      placeholder="untitled"
                    />
                    <span v-else class="absolute inset-0 text-[#f5f5f7] font-bold text-[15px] md:text-[16px] truncate">{{ title || 'untitled' }}</span>
                  </div>
                  <span class="text-[#86868b] font-mono text-[11px] shrink-0 ml-0.5">.json</span>
                </div>

                <!-- Note area -->
                <div v-if="editableNote !== false" class="flex items-center min-w-0 mt-0.5">
                  <span class="text-[#86868b] font-medium text-[12px] shrink-0 mr-1.5 select-none">备注</span>
                  <input
                    :value="note"
                    @input="$emit('update:note', ($event.target as HTMLInputElement).value)"
                    class="bg-transparent text-[#86868b] hover:text-[#f5f5f7] focus:text-[#f5f5f7] font-medium outline-none text-[12px] min-w-[60px] flex-1 truncate transition-colors placeholder-[#444]"
                    placeholder="未添加..."
                  />
                </div>
              </slot>
            </div>
            
            <div class="flex items-center gap-1.5 md:gap-2 shrink-0">
              <slot name="header-actions"></slot>

              <!-- View Mode Toggle -->
              <div v-if="showViewToggle" class="flex items-center bg-[#2c2c2e] p-0.5 rounded-lg border border-[#38383a]">
                 <button 
                   @click="$emit('update:viewMode', 'ui')" 
                   :class="viewMode === 'ui' ? 'bg-[#38383a] text-[#f5f5f7] shadow' : 'text-[#86868b] hover:text-[#f5f5f7]'" 
                   class="flex items-center justify-center px-2 py-1 rounded-md transition-colors"
                   title="UI 面板"
                 >
                   <LayoutTemplate :size="14" />
                   <span class="hidden md:inline ml-1 text-[11px] font-medium">UI 面板</span>
                 </button>
                 <button 
                   @click="$emit('update:viewMode', 'code')" 
                   :class="viewMode === 'code' ? 'bg-[#38383a] text-[#f5f5f7] shadow' : 'text-[#86868b] hover:text-[#f5f5f7]'" 
                   class="flex items-center justify-center px-2 py-1 rounded-md transition-colors"
                   title="代码视图"
                 >
                   <Code :size="14" />
                   <span class="hidden md:inline ml-1 text-[11px] font-medium">代码视图</span>
                 </button>
              </div>

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
          <div class="flex-1 overflow-hidden relative flex flex-col min-h-[50vh]">
            <slot></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { X, Save, Loader2, RotateCcw, LayoutTemplate, Code } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  title?: string;
  note?: string;
  editableTitle?: boolean;
  editableNote?: boolean;
  extension?: string;
  isDirty?: boolean;
  isSaving?: boolean;
  showSave?: boolean;
  saveText?: string;
  showViewToggle?: boolean;
  viewMode?: 'ui' | 'code';
}>();

const emit = defineEmits<{
  (e: 'update:isOpen', value: boolean): void;
  (e: 'update:title', value: string): void;
  (e: 'update:note', value: string): void;
  (e: 'update:viewMode', value: 'ui' | 'code'): void;
  (e: 'save'): void;
  (e: 'reset'): void;
  (e: 'close'): void;
}>();

function closeModal() {
  if (props.isDirty) {
    if (confirm('有未保存的修改，是否在关闭前保存？\n\n点击"确定"保存修改并关闭，点击"取消"直接丢弃并关闭。')) {
      emit('save');
      // If we emit save, we still want to close, but let the parent handle the actual closing if needed?
      // No, we emit save, and emit close immediately. The save is usually sync or async, but parent can handle it.
    }
  }
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
