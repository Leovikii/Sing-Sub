<template>
  <Toolbar class="mb-6 !border-0 !bg-transparent !p-0">
    <template #start>
      <span />
    </template>
    <template #end>
      <div class="flex items-center gap-2">
        <Button
          v-if="showSave"
          severity="secondary"
          outlined
          :disabled="!isDirty || saveStatus !== 'idle'"
          :loading="saveStatus === 'saving'"
          @click="$emit('save')"
        >
          <Save :size="17" aria-hidden="true" />
          <span>{{ t('common.save') }}</span>
        </Button>
        <Button @click="$emit('add')">
          <Plus :size="17" aria-hidden="true" />
          <span>{{ t('common.add') }}</span>
        </Button>
      </div>
    </template>
  </Toolbar>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Toolbar from 'primevue/toolbar';
import { Plus, Save } from 'lucide-vue-next';

defineProps<{
  saveStatus: 'idle' | 'saving' | 'refreshing' | 'success' | 'warning' | 'error';
  isDirty: boolean;
  showSave: boolean;
}>();

defineEmits<{
  add: [];
  save: [];
}>();

const { t } = useI18n();
</script>
