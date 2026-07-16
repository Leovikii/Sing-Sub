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
        <div class="editor-metadata min-w-0">
          <slot name="title">
            <div v-if="viewMode !== 'preview'" class="editor-metadata-fields min-w-0">
              <IftaLabel v-if="editableTitle" class="editor-title-field">
                <InputText
                  :id="`${fieldId}-title`"
                  :model-value="title"
                  :aria-label="titlePlaceholder || t('common.name')"
                  class="w-full min-w-0 font-semibold"
                  @update:model-value="$emit('update:title', $event || '')"
                />
                <label :for="`${fieldId}-title`">{{ titlePlaceholder || t('common.name') }}</label>
              </IftaLabel>
              <span v-else class="editor-title-field truncate text-base font-semibold">{{ title || t('common.untitled') }}</span>

              <IftaLabel v-if="editableNote !== false" class="editor-note-field">
                <InputText
                  :id="`${fieldId}-note`"
                  :model-value="note"
                  :aria-label="t('common.note')"
                  class="w-full min-w-0"
                  @update:model-value="$emit('update:note', $event || '')"
                />
                <label :for="`${fieldId}-note`">{{ t('common.note') }}</label>
              </IftaLabel>
            </div>
            <div v-else class="editor-metadata-preview min-w-0">
              <span class="editor-preview-title truncate text-lg font-semibold">{{ title || t('common.untitled') }}</span>
              <span v-if="note" class="editor-preview-note truncate text-sm text-text-muted" :title="note">{{ note }}</span>
            </div>
          </slot>
        </div>

        <div class="editor-mode flex shrink-0 items-center justify-center">
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
              <component :is="option.icon" :size="15" class="hidden sm:block" aria-hidden="true" />
              <span class="whitespace-nowrap">{{ option.label }}</span>
            </template>
          </SelectButton>
        </div>

        <div class="editor-actions flex min-w-0 items-center justify-end gap-2">
          <slot name="header-actions" />
          <Button
            v-if="showSave"
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
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import IftaLabel from 'primevue/iftalabel';
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
const fieldId = useId();
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
  grid-template-areas: "metadata mode actions";
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.75rem;
}

.editor-metadata {
  grid-area: metadata;
}

.editor-metadata-fields {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 3.5rem;
}

.editor-title-field {
  min-width: 10rem;
  max-width: 14rem;
  flex: 0 1 14rem;
}

.editor-note-field {
  min-width: 14rem;
  max-width: 20rem;
  flex: 0 1 20rem;
}

.editor-metadata-preview {
  display: flex;
  min-height: 3.5rem;
  align-items: baseline;
  gap: 1rem;
}

.editor-preview-title {
  max-width: 14rem;
  flex: 0 1 auto;
}

.editor-preview-note {
  min-width: 0;
  max-width: 20rem;
  flex: 0 1 auto;
}

.editor-mode {
  grid-area: mode;
  position: relative;
  width: 11rem;
  min-width: 11rem;
  min-height: 44px;
}

.editor-actions {
  grid-area: actions;
}

.editor-mode :deep(.p-selectbutton) {
  position: absolute;
  inset: 0;
  display: flex;
  width: 100%;
  margin: 0;
}

.editor-mode :deep(.p-togglebutton) {
  box-sizing: border-box;
  flex: 1 1 50%;
  width: 50%;
  justify-content: center;
}

@media (max-width: 900px) {
  .editor-header-grid {
    grid-template-areas:
      "metadata metadata"
      "mode actions";
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .editor-mode {
    justify-self: end;
  }
}

@media (max-width: 640px) {
  .editor-metadata-fields {
    align-items: stretch;
    flex-direction: column;
  }

  .editor-title-field,
  .editor-note-field {
    width: 100%;
    min-width: 0;
    max-width: none;
    flex: none;
  }

  .editor-metadata-preview {
    min-height: 5.5rem;
    align-items: stretch;
    flex-direction: column;
    justify-content: center;
    gap: 0.25rem;
  }

  .editor-mode {
    justify-self: start;
    justify-content: flex-start;
  }

  .editor-actions {
    min-width: 6rem;
  }
}
</style>
