import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../api/endpoints';
import type { BootstrapResult, LoginResult, PublicUserSettings, SetupData, UpdateSettingsRequest } from '../../shared';

export const useSessionStore = defineStore('session', () => {
  const settings = ref<PublicUserSettings | null>(null);
  const setupRequired = ref(false);
  const initializing = ref(true);
  const loading = ref(false);
  const user = computed(() => settings.value ? {
    login: settings.value.userLogin,
    avatar_url: settings.value.userAvatar,
  } : null);

  function applySettings(value: PublicUserSettings | null) {
    settings.value = value;
  }

  async function bootstrap(): Promise<BootstrapResult> {
    initializing.value = true;
    try {
      const result = await api.bootstrap();
      setupRequired.value = result.setupRequired;
      applySettings(result.settings);
      return result;
    } catch (error) {
      applySettings(null);
      throw error;
    } finally {
      initializing.value = false;
    }
  }

  async function login(request: SetupData): Promise<LoginResult> {
    loading.value = true;
    try {
      const result = await api.login(request);
      applySettings(result);
      return result;
    } finally {
      loading.value = false;
    }
  }

  async function saveSettings(request: UpdateSettingsRequest): Promise<LoginResult> {
    loading.value = true;
    try {
      const result = await api.saveSettings(request);
      applySettings(result);
      return result;
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      applySettings(null);
    }
  }

  return { settings, setupRequired, initializing, loading, user, applySettings, bootstrap, login, saveSettings, logout };
});
