<template>
  <Dialog
    :visible="isOpen"
    modal
    :draggable="false"
    :closable="false"
    :dismissable-mask="false"
    :close-on-escape="false"
    class="editor-dialog"
    :pt="{
      root: { class: '!flex !flex-col !overflow-hidden w-[min(96vw,64rem)] h-[min(88dvh,56rem)] max-h-[56rem] max-sm:!m-0 max-sm:!h-dvh max-sm:!max-h-dvh max-sm:!w-screen max-sm:!rounded-none' },
      header: { class: '!relative !z-10 !shrink-0 !border-b !border-border-base !bg-bg-surface !p-3 sm:!p-4' },
      content: { class: '!relative !z-0 !flex !min-h-0 !flex-1 !flex-col !overflow-hidden !p-0' },
    }"
    @update:visible="onDialogVisible"
  >
    <template #header>
      <div class="editor-header-grid min-w-0 flex-1">
        <div class="editor-title min-w-0">
          <slot name="title">
            <div class="flex min-w-0 items-center gap-1">
              <InputText
                v-if="editableTitle && viewMode !== 'preview'"
                :model-value="title"
                :placeholder="titlePlaceholder || 'untitled'"
                class="min-w-0 flex-1 font-semibold"
                @update:model-value="$emit('update:title', $event || '')"
              />
              <span v-else class="truncate text-base font-semibold">{{ title || 'untitled' }}</span>
              <code v-if="editableTitle && viewMode !== 'preview' && extension" class="shrink-0 text-xs text-text-muted">{{ extension }}</code>
            </div>
          </slot>
        </div>

        <div v-if="editableNote !== false || note" class="editor-note min-w-0">
          <InputText
            v-if="editableNote !== false && viewMode !== 'preview'"
            :model-value="note"
            :placeholder="t('common.note')"
            :aria-label="t('common.note')"
            class="w-full"
            @update:model-value="$emit('update:note', $event || '')"
          />
          <span v-else class="block truncate text-sm text-text-muted">{{ note || t('common.noNote') }}</span>
        </div>

        <div class="editor-actions flex shrink-0 items-center justify-end gap-2">
          <slot name="header-actions" />
          <SelectButton
            v-if="showViewToggle"
            :model-value="viewMode || 'edit'"
            :options="viewModeOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            class="shrink-0"
            @update:model-value="$emit('update:viewMode', $event as 'preview' | 'edit')"
          >
            <template #option="{ option }">
              <component :is="option.icon" :size="15" aria-hidden="true" />
              <span>{{ option.label }}</span>
            </template>
          </SelectButton>

          <Button
            v-if="showSave && viewMode !== 'preview'"
            :loading="isSaving"
            :disabled="!isDirty || isSaving || saveDisabled"
            :aria-label="saveText || t('common.save')"
            @click="$emit('save')"
          >
            <Save :size="17" aria-hidden="true" />
            <span class="hidden sm:inline">{{ saveText || t('common.save') }}</span>
          </Button>
          <Button
            severity="secondary"
            text
            rounded
            :aria-label="t('common.close')"
            v-tooltip.bottom="t('common.close')"
            @click="requestClose"
          >
            <X :size="19" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </template>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <slot />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import SelectButton from 'primevue/selectbutton';
import { Eye, Pencil, Save, X } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  title?: string;
  titlePlaceholder?: string;
  note?: string;
  editableTitle?: boolean;
  editableNote?: boolean;
  extension?: string;
  isDirty?: boolean;
  isSaving?: boolean;
  showSave?: boolean;
  saveDisabled?: boolean;
  saveText?: string;
  showViewToggle?: boolean;
  viewMode?: 'preview' | 'edit';
}>();

const emit = defineEmits<{
  (event: 'update:isOpen', value: boolean): void;
  (event: 'update:title', value: string): void;
  (event: 'update:note', value: string): void;
  (event: 'update:viewMode', value: 'preview' | 'edit'): void;
  (event: 'save'): void;
  (event: 'close'): void;
}>();

const { t } = useI18n();
const confirm = useConfirm();
const viewModeOptions = computed(() => [
  { value: 'edit', label: t('common.edit'), icon: Pencil },
  { value: 'preview', label: t('common.preview'), icon: Eye },
]);

function close() {
  emit('close');
  emit('update:isOpen', false);
}

function requestClose() {
  if (!props.isDirty) {
    close();
    return;
  }
  confirm.require({
    header: t('common.unsavedTitle'),
    message: t('common.unsavedMessage'),
    rejectLabel: t('common.cancel'),
    acceptLabel: t('common.discard'),
    acceptClass: 'p-button-danger',
    accept: close,
  });
}

function onDialogVisible(visible: boolean) {
  if (!visible) requestClose();
}
</script>

<style scoped>
.editor-header-grid {
  display: grid;
  grid-template-areas: "title note actions";
  grid-template-columns: minmax(0, 1fr) minmax(12rem, 18rem) auto;
  align-items: center;
  gap: 0.5rem;
}

.editor-title {
  grid-area: title;
}

.editor-note {
  grid-area: note;
}

.editor-actions {
  grid-area: actions;
}

@media (max-width: 640px) {
  .editor-header-grid {
    grid-template-areas:
      "title actions"
      "note note";
    grid-template-columns: minmax(0, 1fr) auto;
  }
}
</style>
