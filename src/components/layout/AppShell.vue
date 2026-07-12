<template>
  <div class="min-h-screen bg-bg-page">
    <header
      class="sticky top-0 z-40 h-16 border-b border-border-base bg-bg-surface md:h-24 md:transition-[margin] md:duration-200 md:ease-out"
      :class="showNavigation ? (expanded ? 'md:ml-56' : 'md:ml-24') : ''"
    >
      <div class="flex h-full items-center justify-between px-5 md:px-8">
        <h1 class="text-lg font-semibold text-text-primary md:text-2xl">{{ pageTitle }}</h1>
        <button
          v-if="user"
          type="button"
          class="flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-lg text-text-primary transition-colors hover:text-brand-pink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink md:min-h-0 md:min-w-0"
          @click="$emit('open-settings')"
        >
          <span class="hidden text-sm font-medium md:inline">{{ user.login }}</span>
          <img :src="user.avatar_url" :alt="user.login" class="h-9 w-9 rounded-full border-2 border-border-base md:h-10 md:w-10" />
        </button>
      </div>
    </header>

    <nav
      v-if="showNavigation"
      aria-label="主导航"
      class="fixed inset-x-0 bottom-0 z-50 flex h-[calc(64px+env(safe-area-inset-bottom))] items-center justify-around gap-1 border-t border-border-base bg-bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:inset-x-auto md:bottom-0 md:left-0 md:top-0 md:h-screen md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:bg-bg-surface md:px-3 md:py-0 md:backdrop-blur-none md:transition-[width,box-shadow] md:duration-200 md:ease-out"
      :class="[
        isPanelExpanded ? 'md:w-56' : 'md:w-24',
        isPanelExpanded && !expanded ? 'md:shadow-[12px_0_32px_rgba(0,0,0,0.24)]' : 'md:shadow-none'
      ]"
      @mouseenter="isHoverExpanded = true"
      @mouseleave="isHoverExpanded = false"
    >
      <div class="hidden h-24 shrink-0 items-center justify-start overflow-hidden border-b border-border-base md:flex md:w-full">
        <div class="flex h-24 w-[72px] shrink-0 items-center justify-center">
          <img src="/favicon.svg" alt="Sing Sub" class="h-11 w-11 shrink-0" />
        </div>
        <span v-if="showLabels" class="whitespace-nowrap text-xl font-semibold text-text-primary">
          Sing Sub
        </span>
      </div>

      <div class="contents md:mt-4 md:flex md:w-full md:flex-col md:gap-2">
        <AppNavigationItem label="配置" :icon="Settings2" :active="activeTab === 'config'" :show-label="showLabels" @select="$emit('update:activeTab', 'config')" />
        <AppNavigationItem label="组件" :icon="Box" :active="activeTab === 'assets'" :show-label="showLabels" @select="$emit('update:activeTab', 'assets')" />
      </div>

      <div class="flex flex-1 justify-center md:mt-auto md:w-full md:flex-none">
        <AppNavigationItem label="设置" :icon="User" :active="activeTab === 'settings'" :show-label="showLabels" @select="$emit('update:activeTab', 'settings')" />
      </div>
      <button
        type="button"
        class="hidden h-12 w-full items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink md:inline-flex"
        :title="expanded ? '折叠侧栏' : '展开侧栏'"
        :aria-label="expanded ? '折叠侧栏' : '展开侧栏'"
        @click="togglePanel"
      >
        <PanelLeft :size="18" aria-hidden="true" />
      </button>
    </nav>

    <main
      class="min-h-[calc(100dvh-4rem)] pb-[calc(80px+env(safe-area-inset-bottom))] md:min-h-[calc(100dvh-6rem)] md:pb-0 md:transition-[margin] md:duration-200 md:ease-out"
      :class="showNavigation ? (expanded ? 'md:ml-56' : 'md:ml-24') : ''"
    >
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { Box, PanelLeft, Settings2, User } from 'lucide-vue-next';
import AppNavigationItem from './AppNavigationItem.vue';
import type { GithubUser } from '../../types';

const props = defineProps<{
  user: GithubUser | null;
  activeTab: 'config' | 'assets' | 'settings';
  expanded: boolean;
  showNavigation: boolean;
}>();

const emit = defineEmits<{
  'open-settings': [];
  'update:activeTab': [value: 'config' | 'assets' | 'settings'];
  'update:expanded': [value: boolean];
}>();

const titles = { config: '配置', assets: '组件', settings: '设置' } as const;
const pageTitle = computed(() => props.showNavigation ? titles[props.activeTab] : 'Sing Sub');
const isHoverExpanded = ref(false);
const isPanelExpanded = ref(props.expanded);
const showLabels = ref(props.expanded);
const targetExpanded = computed(() => props.expanded || isHoverExpanded.value);
let labelTimer: ReturnType<typeof window.setTimeout> | null = null;

function clearTransitionWork() {
  if (labelTimer !== null) {
    window.clearTimeout(labelTimer);
    labelTimer = null;
  }
}

function expandPanel() {
  clearTransitionWork();
  isPanelExpanded.value = true;
  labelTimer = window.setTimeout(() => {
    showLabels.value = true;
    labelTimer = null;
  }, 100);
}

function collapsePanel() {
  clearTransitionWork();
  showLabels.value = false;
  isPanelExpanded.value = false;
}

function togglePanel() {
  isHoverExpanded.value = false;
  emit('update:expanded', !props.expanded);
}

watch(targetExpanded, (shouldExpand) => {
  if (shouldExpand) expandPanel();
  else collapsePanel();
});

onUnmounted(clearTransitionWork);
</script>
