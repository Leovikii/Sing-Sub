<template>
  <ModalDialog :visible="visible" labelledBy="conflict-modal-title" @close="$emit('cancel')">
        <h3 id="conflict-modal-title" class="text-lg font-semibold text-text-primary">内容已被修改</h3>
        <p class="text-sm text-text-muted leading-relaxed">该文件在你编辑期间已被其他方式修改。你可以放弃本地改动，重新加载最新版本；或者用你的改动强制覆盖。</p>
        <div class="flex gap-3 pt-2">
          <Button @click="$emit('reload')" variant="secondary" class="flex-1">重新加载</Button>
          <Button @click="$emit('overwrite')" variant="danger" class="flex-1">强制覆盖</Button>
        </div>
  </ModalDialog>
</template>

<script setup lang="ts">
import Button from './Button.vue';
import ModalDialog from './ModalDialog.vue';

defineProps<{
  visible: boolean;
}>();

defineEmits<{
  reload: [];
  overwrite: [];
  cancel: [];
}>();

</script>
