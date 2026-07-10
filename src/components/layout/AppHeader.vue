<template>
  <header class="flex items-center justify-between">
    <div class="flex items-center gap-3 md:gap-4">
      <!-- App Logo -->
      <div class="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-bg-elevated/40 border border-border-base flex items-center justify-center shadow-lg backdrop-blur-md shrink-0">
        <img src="/favicon.svg" alt="Sing Sub Logo" class="w-7 h-7 md:w-8 md:h-8 drop-shadow-md" />
      </div>

      <!-- Titles -->
      <div class="space-y-0.5 md:space-y-1">
        <div class="flex items-center gap-2 md:gap-3">
          <h1 class="text-2xl md:text-4xl font-bold tracking-tight text-text-primary">Sing Sub</h1>
          <span class="px-2 py-0.5 rounded-md bg-bg-elevated text-brand-pink text-[10px] md:text-xs font-mono border border-border-base">{{ appVersion }}</span>
        </div>
        <p class="text-text-muted font-medium text-xs md:text-sm">Edge 多环境分发控制台</p>
      </div>
    </div>

    <div v-if="user" class="flex items-center gap-3">
      <div class="relative">
        <div class="flex items-center gap-3">
          <div class="hidden md:block text-right cursor-pointer" @click.stop="$emit('open-settings')">
            <div class="text-text-primary font-medium text-sm hover:text-brand-pink transition-colors">{{ user.login }}</div>
          </div>
          <img :src="user.avatar_url" @click.stop="$emit('open-settings')" class="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-border-base hover:border-brand-pink transition-all duration-200 cursor-pointer" />
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { GithubUser, UserSettings } from '../../types';

defineProps<{
  user: GithubUser | null;
  appVersion: string;
  settings: UserSettings | null;
  loading: boolean;
}>();

defineEmits<{
  'open-settings': [];
}>();
</script>
