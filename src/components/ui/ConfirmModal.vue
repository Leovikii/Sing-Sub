<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-bg-page/80 backdrop-blur-md"
      @click.self="$emit('cancel')"
      @keydown.esc="$emit('cancel')"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        tabindex="-1"
        ref="dialogRef"
        class="w-full max-w-sm bg-bg-surface border border-border-base rounded-2xl shadow-xl p-6 space-y-4"
      >
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
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import Button from './Button.vue';

const props = defineProps<{
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
}>();

defineEmits<{
  confirm: [];
  cancel: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);

watch(() => props.visible, (visible) => {
  if (visible) {
    nextTick(() => dialogRef.value?.focus());
  }
});
</script>
