<template>
  <nav
    aria-label="主导航"
    class="fixed inset-x-0 bottom-0 z-50 flex h-[72px] items-center justify-around gap-2 border-t border-border-base bg-bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:inset-x-auto md:bottom-0 md:left-0 md:top-36 md:h-auto md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:px-3 md:py-5 md:transition-[width] md:duration-200 md:ease-out"
    :class="isPanelExpanded ? 'md:w-52' : 'md:w-24'"
    @mouseenter="isHoverExpanded = true"
    @mouseleave="isHoverExpanded = false"
  >
      <AppNavigationItem label="配置" :icon="Settings2" :active="activeTab === 'config'" :expanded="isPanelExpanded" :show-label="showLabels" @select="$emit('update:activeTab', 'config')" />
      <AppNavigationItem label="组件" :icon="Box" :active="activeTab === 'assets'" :expanded="isPanelExpanded" :show-label="showLabels" @select="$emit('update:activeTab', 'assets')" />
      <div class="flex flex-1 justify-center md:mt-auto md:w-full md:flex-none">
        <AppNavigationItem label="设置" :icon="User" :active="activeTab === 'settings'" :expanded="isPanelExpanded" :show-label="showLabels" @select="$emit('update:activeTab', 'settings')" />
      </div>
      <button
        v-if="canExpand"
        type="button"
        class="hidden h-10 w-full items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink md:inline-flex"
        :title="expanded ? '折叠侧栏' : '展开侧栏'"
        :aria-label="expanded ? '折叠侧栏' : '展开侧栏'"
        @click="togglePanel"
      >
        <PanelLeft :size="18" aria-hidden="true" />
      </button>
  </nav>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { Settings2, Box, User, PanelLeft } from 'lucide-vue-next';
import AppNavigationItem from './AppNavigationItem.vue';

const props = defineProps<{
  activeTab: 'config' | 'assets' | 'settings';
  expanded: boolean;
  canExpand: boolean;
}>();

const emit = defineEmits<{
  'update:activeTab': [value: 'config' | 'assets' | 'settings'];
  'update:expanded': [value: boolean];
}>();

const isHoverExpanded = ref(false);
const isPanelExpanded = ref(props.expanded);
const showLabels = ref(props.expanded);
const targetExpanded = computed(() => props.expanded || isHoverExpanded.value);
let labelTimer: ReturnType<typeof window.setTimeout> | null = null;
let collapseFrame: number | null = null;

function clearTransitionWork() {
  if (labelTimer !== null) {
    window.clearTimeout(labelTimer);
    labelTimer = null;
  }
  if (collapseFrame !== null) {
    window.cancelAnimationFrame(collapseFrame);
    collapseFrame = null;
  }
}

function togglePanel() {
  // A direct toggle takes precedence over the pointer's current hover state.
  isHoverExpanded.value = false;
  if (props.expanded) {
    collapsePanel();
  } else {
    expandPanel();
  }
  emit('update:expanded', !props.expanded);
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
  // Remove text before width changes so the collapsing rail never reflows labels.
  showLabels.value = false;
  collapseFrame = window.requestAnimationFrame(() => {
    isPanelExpanded.value = false;
    collapseFrame = null;
  });
}

watch(targetExpanded, (shouldExpand) => {
  if (shouldExpand) {
    expandPanel();
  } else {
    collapsePanel();
  }
});

onUnmounted(clearTransitionWork);
</script>
