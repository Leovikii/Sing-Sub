<template>
  <header class="flex items-center justify-between">
    <div class="space-y-1">
      <div class="flex items-center gap-3">
        <h1 class="text-3xl md:text-4xl font-bold tracking-tight text-[#f5f5f7]">Sing Sub</h1>
        <span class="px-2 py-0.5 rounded-md bg-[#2c2c2e] text-[#F596AA] text-xs font-mono border border-[#38383a]">{{ appVersion }}</span>
      </div>
      <p class="text-[#86868b] font-medium text-sm md:text-base">Edge 多环境分发控制台</p>
    </div>

    <div v-if="user" class="flex items-center gap-3">
      <div class="relative">
        <div class="flex items-center gap-3 cursor-pointer group" @click.stop="showDropdown = !showDropdown">
          <div class="hidden md:block text-right">
            <div class="text-[#f5f5f7] font-medium text-sm">{{ user.login }}</div>
            <div class="text-[#86868b] text-xs group-hover:text-[#F596AA] transition-colors">设置</div>
          </div>
          <img :src="user.avatar_url" class="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-[#38383a] group-hover:border-[#F596AA] transition-all duration-200" />
        </div>

        <UserDropdown
          :visible="showDropdown"
          :user="user"
          :settings="settings"
          :loading="loading"
          @close="showDropdown = false"
          @save="showDropdown = false; $emit('save', $event)"
          @disconnect="showDropdown = false; $emit('disconnect')"
          @update:settings="$emit('update:settings', $event)"
        />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import UserDropdown from '../UserDropdown.vue';
import type { GithubUser, UserSettings } from '../../types';

defineProps<{
  user: GithubUser | null;
  appVersion: string;
  settings: UserSettings | null;
  loading: boolean;
}>();

defineEmits<{
  save: [value: any];
  disconnect: [];
  'update:settings': [value: Partial<UserSettings>];
}>();

const showDropdown = ref(false);
</script>
