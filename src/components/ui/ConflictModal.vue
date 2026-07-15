<template>
  <Dialog
    :visible="visible"
    modal
    :header="t('common.conflictTitle')"
    class="w-[min(92vw,28rem)]"
    @update:visible="value => { if (!value) $emit('cancel'); }"
  >
    <p class="text-sm leading-relaxed text-text-muted">
      {{ t('common.conflictMessage') }}
    </p>
    <template #footer>
      <Button severity="secondary" outlined @click="$emit('reload')">
        {{ t('common.reload') }}
      </Button>
      <Button severity="danger" @click="$emit('overwrite')">
        {{ t('common.replace') }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';

defineProps<{ visible: boolean }>();
defineEmits<{ reload: []; overwrite: []; cancel: [] }>();
const { t } = useI18n();
</script>
