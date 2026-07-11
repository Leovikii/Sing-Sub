<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-bg-page/80 backdrop-blur-md"
      @click.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <div
        ref="dialogRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="labelledBy"
        tabindex="-1"
        class="w-full max-w-sm bg-bg-surface border border-border-base rounded-2xl shadow-xl p-6 space-y-4"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  labelledBy?: string;
}>();

defineEmits<{
  close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);

watch(() => props.visible, visible => {
  if (visible) nextTick(() => dialogRef.value?.focus());
});
</script>
