<template>
  <ModalDialog :visible="visible" labelledBy="confirm-modal-title" @close="$emit('cancel')">
        <h3 id="confirm-modal-title" class="text-lg font-semibold text-text-primary">{{ title }}</h3>
        <p class="text-sm text-text-muted leading-relaxed">{{ message }}</p>
        <div class="flex gap-3 pt-2">
          <Button @click="$emit('cancel')" variant="secondary" class="flex-1">取消</Button>
          <Button
            @click="$emit('confirm')"
            variant="danger"
            class="flex-1"
          >
            {{ confirmText }}
          </Button>
        </div>
  </ModalDialog>
</template>

<script setup lang="ts">
import Button from './Button.vue';
import ModalDialog from './ModalDialog.vue';

defineProps<{
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
}>();

defineEmits<{
  confirm: [];
  cancel: [];
}>();

</script>
