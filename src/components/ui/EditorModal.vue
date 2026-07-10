<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-6 bg-[#121212]/80 backdrop-blur-md"
      >
        <div class="modal-panel w-full md:max-w-4xl h-[92vh] md:h-[88vh] bg-[#1c1c1e] border border-[#38383a] md:rounded-2xl rounded-t-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden relative">
          <!-- Header -->
          <div class="flex items-center justify-between gap-2 p-3 md:p-4 border-b border-[#38383a] bg-[#0a0a0a]/60 backdrop-blur-xl shrink-0 z-10">
            <div class="flex flex-col min-w-0 flex-1">
              <slot name="title">
                <!-- Filename area -->
                <div class="flex items-baseline min-w-0">
                  <div class="relative inline-flex min-w-[30px] max-w-[calc(100%-40px)]">
                    <span class="invisible whitespace-pre overflow-hidden font-bold text-[15px] md:text-[16px] pr-0.5">{{ title || 'untitled' }}</span>
                    <input
                      v-if="editableTitle && viewMode !== 'preview'"
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
                <div v-if="editableNote !== false || (viewMode === 'preview' && note)" class="flex items-center min-w-0 mt-0.5">
                  <span class="text-[#86868b] font-medium text-[12px] shrink-0 mr-1.5 select-none">备注</span>
                  <input
                    v-if="editableNote !== false && viewMode !== 'preview'"
                    :value="note"
                    @input="$emit('update:note', ($event.target as HTMLInputElement).value)"
                    class="bg-transparent text-[#86868b] hover:text-[#f5f5f7] focus:text-[#f5f5f7] font-medium outline-none text-[12px] min-w-[60px] flex-1 truncate transition-colors placeholder-[#444]"
                    placeholder="未添加..."
                  />
                  <span v-else class="text-[#86868b] font-medium text-[12px] min-w-[60px] flex-1 truncate">{{ note || '未添加' }}</span>
                </div>
              </slot>
            </div>
            
            <div class="flex items-center gap-1.5 md:gap-2 shrink-0">
              <slot name="header-actions"></slot>

              <!-- View Mode Toggle -->
              <AppleSegmentedControl
                v-if="showViewToggle"
                :modelValue="viewMode ?? 'edit'"
                @update:modelValue="$emit('update:viewMode', $event as 'preview' | 'edit')"
                :options="viewModeOptions"
              />

              <template v-if="showSave && viewMode !== 'preview'">
                <AppleToolbarButton
                  :icon="RotateCcw"
                  label="复位"
                  :disabled="!isDirty"
                  @click="$emit('reset')"
                />

                <AppleToolbarButton
                  :icon="Save"
                  :label="saveText"
                  variant="primary"
                  :disabled="!isDirty || isSaving"
                  :loading="isSaving"
                  @click="$emit('save')"
                />
              </template>
              <PopoverMenu
                v-model:isOpen="showUnsavedConfirm"
                wrapperClass="relative flex"
                contentClass="right-0 top-full mt-2 w-[220px] p-3 rounded-2xl bg-[#2c2c2e]/95 backdrop-blur-xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] origin-top-right flex flex-col gap-2"
              >
                <template #trigger="{ toggle, isOpen }">
                  <AppleToolbarButton
                    :icon="X"
                    variant="danger"
                    :active="isOpen"
                    title="关闭"
                    @click="handleCloseClick(toggle)"
                  />
                </template>

                <template #content="{ close }">
                  <div class="flex items-center gap-1.5 text-[#ff6961]">
                    <AlertTriangle :size="14" />
                    <span class="text-[13px] font-bold">未保存的修改</span>
                  </div>
                  <span class="text-[#86868b] text-[12px] leading-relaxed">如果关闭，您刚刚修改的内容将会丢失。</span>
                  <div class="flex items-center gap-2 mt-1">
                    <button @click.stop="close" class="flex-1 px-0 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#f5f5f7] text-[12px] font-medium transition-colors cursor-pointer">取消</button>
                    <button @click.stop="handleConfirmClose" class="flex-1 px-0 py-1.5 rounded-lg bg-[#ff6961]/15 hover:bg-[#ff6961]/25 text-[#ff6961] text-[12px] font-medium transition-colors cursor-pointer">放弃修改</button>
                  </div>
                </template>
              </PopoverMenu>
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
import { X, Save, RotateCcw, Eye, Pencil, AlertTriangle } from 'lucide-vue-next';
import { ref } from 'vue';
import PopoverMenu from './PopoverMenu.vue';
import AppleSegmentedControl from './AppleSegmentedControl.vue';
import AppleToolbarButton from './AppleToolbarButton.vue';

const showUnsavedConfirm = ref(false);

const viewModeOptions = [
  { value: 'preview', label: '预览', icon: Eye },
  { value: 'edit', label: '编辑', icon: Pencil },
];

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
  viewMode?: 'preview' | 'edit';
}>();

const emit = defineEmits<{
  (e: 'update:isOpen', value: boolean): void;
  (e: 'update:title', value: string): void;
  (e: 'update:note', value: string): void;
  (e: 'update:viewMode', value: 'preview' | 'edit'): void;
  (e: 'save'): void;
  (e: 'reset'): void;
  (e: 'close'): void;
}>();

function handleCloseClick(toggleFn: () => void) {
  if (props.isDirty) {
    toggleFn();
  } else {
    handleConfirmClose();
  }
}

function handleConfirmClose() {
  showUnsavedConfirm.value = false;
  emit('close');
  emit('update:isOpen', false);
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
