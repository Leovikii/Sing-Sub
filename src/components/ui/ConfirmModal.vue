<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#121212]/90 backdrop-blur-lg" @click.self="$emit('cancel')">
      <div class="w-full max-w-sm bg-[#1c1c1e] border border-[#38383a] rounded-2xl shadow-2xl p-6 space-y-4">
        <h3 class="text-lg font-semibold text-[#f5f5f7]">{{ title }}</h3>
        <p class="text-sm text-[#86868b] leading-relaxed">{{ message }}</p>
        <div class="flex gap-3 pt-2">
          <AppleButton @click="$emit('cancel')" variant="secondary" class="flex-1">取消</AppleButton>
          <AppleButton
            @click="$emit('confirm')"
            variant="danger"
            class="flex-1"
          >
            {{ confirmText }}
          </AppleButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import AppleButton from './AppleButton.vue';

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
