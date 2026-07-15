import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { i18n, type AppLocale } from '../i18n';

export type Appearance = 'system' | 'light' | 'dark';

function savedAppearance(): Appearance {
  const value = localStorage.getItem('sing-sub.appearance');
  return value === 'light' || value === 'dark' ? value : 'system';
}

export const usePreferencesStore = defineStore('preferences', () => {
  const locale = ref<AppLocale>(i18n.global.locale.value as AppLocale);
  const appearance = ref<Appearance>(savedAppearance());
  const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const resolvedDark = computed(() => appearance.value === 'dark' || (appearance.value === 'system' && systemDark.value));

  function applyPreferences() {
    i18n.global.locale.value = locale.value;
    document.documentElement.lang = locale.value;
    document.documentElement.classList.toggle('app-dark', resolvedDark.value);
    localStorage.setItem('sing-sub.locale', locale.value);
    localStorage.setItem('sing-sub.appearance', appearance.value);
  }

  function onSystemTheme(event: MediaQueryListEvent) {
    systemDark.value = event.matches;
  }

  media.addEventListener('change', onSystemTheme);
  watch([locale, appearance, systemDark], applyPreferences, { immediate: true });
  return { locale, appearance, resolvedDark, applyPreferences };
});
