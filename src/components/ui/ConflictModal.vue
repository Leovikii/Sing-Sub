<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#121212]/80 backdrop-blur-md" @click.self="$emit('cancel')">
      <div class="w-full max-w-sm bg-[#1c1c1e] border border-[#38383a] rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] p-6 space-y-4">
        <h3 class="text-lg font-semibold text-[#f5f5f7]">内容已被修改</h3>
        <p class="text-sm text-[#86868b] leading-relaxed">该文件在你编辑期间已被其他方式修改。你可以放弃本地改动，重新加载最新版本；或者用你的改动强制覆盖。</p>
        <div class="flex gap-3 pt-2">
          <Button @click="$emit('reload')" variant="secondary" class="flex-1">重新加载</Button>
          <Button @click="$emit('overwrite')" variant="danger" class="flex-1">强制覆盖</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import Button from './Button.vue';

defineProps<{
  visible: boolean;
}>();

defineEmits<{
  reload: [];
  overwrite: [];
  cancel: [];
}>();
</script>
