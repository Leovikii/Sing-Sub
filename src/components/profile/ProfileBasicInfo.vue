<template>
  <div class="border-b border-[#38383a] pb-6">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="space-y-2">
        <label class="text-sm font-medium text-[#86868b] block">生成产物文件名 (Profile Name)</label>
        <div class="flex items-center bg-[#1c1c1e]/80 border border-[#38383a] rounded-xl px-4 py-2 w-full focus-within:border-[#F596AA] focus-within:ring-4 focus-within:ring-[#F596AA]/20 transition-all duration-200">
          <input v-model="profile.name" class="bg-transparent text-[#f5f5f7] outline-none text-xl font-bold w-full" placeholder="例如: la" />
          <span class="text-[#86868b] font-mono text-lg ml-2 select-none">.json</span>
        </div>
      </div>
      <div class="space-y-2">
        <label class="text-sm font-medium text-[#86868b] block">备注</label>
        <AppleInput :modelValue="profile.note ?? ''" @update:modelValue="profile.note = $event" placeholder="例如: 洛杉矶节点" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppleInput from '../ui/AppleInput.vue';
import type { Profile } from '../../types';

defineProps<{
  profile: Profile;
}>();
</script>
