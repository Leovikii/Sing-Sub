<template>
  <div class="min-h-screen bg-bg-page text-text-primary" @keydown.esc="closeMobileNavigation">
    <aside
      v-if="props.showNavigation"
      :aria-hidden="!isDesktop && !mobileNavigationOpen"
      class="sidebar-motion fixed inset-y-0 left-0 z-40 flex w-[min(86vw,16rem)] flex-col border-r border-border-base bg-bg-surface lg:w-64 lg:shadow-none"
      :class="{
        'sidebar-open': isDesktop || mobileNavigationOpen,
        'sidebar-desktop': isDesktop,
      }"
    >
      <div class="flex h-16 items-center gap-3 border-b border-border-base px-5">
        <img src="/favicon.svg" alt="" class="h-9 w-9" />
        <span class="text-lg font-semibold">{{ t('common.appName') }}</span>
        <Button
          severity="secondary"
          text
          rounded
          class="ml-auto lg:!hidden"
          :aria-label="t('nav.closeMenu')"
          v-tooltip.bottom="t('nav.closeMenu')"
          @click="closeMobileNavigation"
        >
          <X :size="20" aria-hidden="true" />
        </Button>
      </div>
      <AppNavigation
        :aria-label="mobileNavigationOpen ? t('nav.mobile') : t('nav.main')"
        close-on-select
        class="min-h-0 flex-1 overflow-y-auto p-3"
        @selected="closeMobileNavigation"
      />
      <div class="border-t border-border-base p-3">
        <Button
          severity="secondary"
          text
          class="w-full justify-start"
          :aria-label="t('nav.logout')"
          @click="handleLogout"
        >
          <LogOut :size="18" aria-hidden="true" />
          <span>{{ t('nav.logout') }}</span>
        </Button>
      </div>
    </aside>

    <Transition name="backdrop-fade">
      <div
        v-if="props.showNavigation && mobileNavigationOpen"
        class="fixed inset-0 z-[35] bg-black/55 lg:hidden"
        aria-hidden="true"
        @click="closeMobileNavigation"
      />
    </Transition>

    <header
      class="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border-base bg-bg-surface/95 px-4 backdrop-blur lg:px-8"
      :class="props.showNavigation ? 'lg:ml-64' : ''"
    >
      <Button
        v-if="props.showNavigation"
        severity="secondary"
        text
        rounded
        class="lg:!hidden"
        :aria-label="t('nav.openMenu')"
        v-tooltip.bottom="t('nav.openMenu')"
        @click="openMobileNavigation"
      >
        <Menu :size="20" aria-hidden="true" />
      </Button>
      <h1 class="min-w-0 flex-1 truncate text-lg font-semibold">{{ pageTitle }}</h1>
      <Button
        v-if="user && props.showNavigation"
        severity="secondary"
        text
        rounded
        :aria-label="t('nav.repository')"
        v-tooltip.bottom="user?.login || t('nav.repository')"
        @click="router.push('/settings/repository')"
      >
        <Avatar
          v-if="user.avatar_url"
          :image="user.avatar_url"
          shape="circle"
          :aria-label="user.login"
        />
        <User v-else :size="20" aria-hidden="true" />
      </Button>
    </header>

    <main :class="props.showNavigation ? 'lg:ml-64' : ''" class="min-h-[calc(100dvh-4rem)]">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { usePrimeVue } from 'primevue/config';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import { LogOut, Menu, User, X } from 'lucide-vue-next';
import { primeVueLocales } from '../../i18n/primevue';
import { usePreferencesStore } from '../../stores/preferences';
import AppNavigation from './AppNavigation.vue';
import type { GithubUser } from '../../types';

const props = defineProps<{
  user: GithubUser | null;
  showNavigation: boolean;
}>();

const emit = defineEmits<{
  logout: [];
}>();

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const primevue = usePrimeVue();
const preferences = usePreferencesStore();
const mobileNavigationOpen = ref(false);
const isDesktop = ref(typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches);
const pageTitle = computed(() => t(String(route.meta.titleKey || 'common.appName')));
let mediaQuery: MediaQueryList | null = null;

function updateViewport() {
  isDesktop.value = mediaQuery?.matches ?? false;
  if (isDesktop.value) closeMobileNavigation();
}

function openMobileNavigation() {
  mobileNavigationOpen.value = true;
}

function closeMobileNavigation() {
  mobileNavigationOpen.value = false;
}

function handleLogout() {
  closeMobileNavigation();
  emit('logout');
}

watch(() => route.fullPath, closeMobileNavigation);

onMounted(() => {
  mediaQuery = window.matchMedia('(min-width: 1024px)');
  mediaQuery.addEventListener('change', updateViewport);
  updateViewport();
});

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', updateViewport);
});

watch(() => preferences.locale, (locale) => {
  primevue.config.locale = primeVueLocales[locale];
}, { immediate: true });
</script>

<style scoped>
.sidebar-motion {
  pointer-events: none;
  transform: translateX(-100%);
  visibility: hidden;
  transition: transform 200ms ease-out, visibility 0s linear 200ms;
}

.sidebar-motion.sidebar-open {
  pointer-events: auto;
  transform: translateX(0);
  visibility: visible;
  transition: transform 200ms ease-out, visibility 0s linear 0s;
}

.sidebar-motion.sidebar-open:not(.sidebar-desktop) {
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
}

.backdrop-fade-enter-active,
.backdrop-fade-leave-active {
  transition: opacity 180ms ease;
}

.backdrop-fade-enter-from,
.backdrop-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-motion,
  .backdrop-fade-enter-active,
  .backdrop-fade-leave-active {
    transition: none !important;
  }
}
</style>
