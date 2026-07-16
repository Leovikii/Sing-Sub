<template>
  <nav :aria-label="ariaLabel" class="app-navigation">
    <PanelMenu
      v-model:expandedKeys="expandedKeys"
      :model="items"
      multiple
      class="w-full"
    >
      <template #item="{ item, props, hasSubmenu }">
        <RouterLink
          v-if="item.route"
          :to="item.route"
          class="nav-link flex min-h-11 items-center gap-3 rounded-md px-3 text-sm"
          :class="{ 'nav-link-active': item.route === route.path }"
          :aria-current="item.route === route.path ? 'page' : undefined"
          @click="onLeafSelect"
        >
          <component :is="item.iconComponent" :size="18" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
        </RouterLink>
        <a
          v-else
          v-bind="props.action"
          class="nav-group flex min-h-11 items-center gap-3 rounded-md px-3 text-sm"
        >
          <component :is="item.iconComponent" :size="18" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
          <ChevronDown
            v-if="hasSubmenu"
            :size="15"
            class="transition-transform"
            :class="expandedKeys[item.key as string] ? 'rotate-180' : ''"
            aria-hidden="true"
          />
        </a>
      </template>
    </PanelMenu>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PanelMenu from 'primevue/panelmenu';
import type { MenuItem } from 'primevue/menuitem';
import {
  ArrowLeftRight,
  Boxes,
  ChevronDown,
  FileCog,
  Github,
  Info,
  Layers3,
  Link2,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Waypoints,
  Wrench,
} from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  ariaLabel?: string;
  closeOnSelect?: boolean;
}>(), {
  ariaLabel: 'Navigation',
  closeOnSelect: false,
});

const emit = defineEmits<{
  selected: [];
}>();

const route = useRoute();
const { t } = useI18n();
const expandedKeys = ref<Record<string, boolean>>({ resources: true, settings: true });

type NavigationItem = Omit<MenuItem, 'icon' | 'items'> & {
  route?: string;
  key: string;
  iconComponent: Component;
  items?: NavigationItem[];
};

const items = computed<NavigationItem[]>(() => [
  { key: 'profiles', label: t('nav.profiles'), iconComponent: FileCog, route: '/profiles' },
  {
    key: 'resources',
    label: t('nav.resources'),
    iconComponent: Boxes,
    items: [
      { key: 'nodes', label: t('nav.nodes'), iconComponent: Waypoints, route: '/resources/nodes' },
      { key: 'templates', label: t('nav.templates'), iconComponent: Layers3, route: '/resources/templates' },
      { key: 'adapters', label: t('nav.adapters'), iconComponent: Wrench, route: '/resources/adapters' },
      { key: 'rulesets', label: t('nav.rulesets'), iconComponent: ShieldCheck, route: '/resources/rulesets' },
    ],
  },
  { key: 'sync', label: t('nav.sync'), iconComponent: ArrowLeftRight, route: '/sync' },
  {
    key: 'settings',
    label: t('nav.settings'),
    iconComponent: Settings,
    items: [
      { key: 'general', label: t('nav.general'), iconComponent: SlidersHorizontal, route: '/settings/general' },
      { key: 'subscription', label: t('nav.subscription'), iconComponent: Link2, route: '/settings/subscription' },
      { key: 'repository', label: t('nav.repository'), iconComponent: Github, route: '/settings/repository' },
      { key: 'about', label: t('nav.about'), iconComponent: Info, route: '/settings/about' },
    ],
  },
]);

function onLeafSelect() {
  if (props.closeOnSelect) emit('selected');
}
</script>

<style scoped>
.app-navigation :deep(.p-panelmenu-panel) {
  border: 0;
  background: transparent;
}

.app-navigation :deep(.p-panelmenu-header-content),
.app-navigation :deep(.p-panelmenu-content) {
  border: 0;
  background: transparent;
}

.app-navigation :deep(.p-panelmenu-item-content),
.app-navigation :deep(.p-panelmenu-item-content:hover) {
  background: transparent;
}

.app-navigation :deep(.p-panelmenu-content) {
  padding: 0 0 0.25rem 0.75rem;
}

.nav-link,
.nav-group {
  color: var(--color-text-nav);
  transition: background-color 150ms ease, color 150ms ease;
}

.nav-link:hover,
.nav-group:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.nav-link-active,
.nav-link-active:hover {
  background: var(--color-bg-nav-active);
  color: var(--color-text-nav-active);
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .nav-link,
  .nav-group {
    transition: none;
  }
}
</style>
