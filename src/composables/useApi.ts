import { ref } from 'vue';
import { api } from '../api/endpoints';
import { ApiClientError } from '../api/client';
import type { GithubUser, Profile, SetupData, StateData, UserSettings } from '../types';
import type { PutFileRequest, UpdateSettingsRequest } from '../../shared';

export { ApiClientError as ApiError } from '../api/client';

export function useApi() {
  const user = ref<GithubUser | null>(null);
  const settings = ref<UserSettings | null>(null);

  async function call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        user.value = null;
        settings.value = null;
      }
      throw error;
    }
  }

  async function login(data: SetupData) {
    const result = await call(() => api.login(data));
    settings.value = result;
    user.value = { login: result.userLogin, avatar_url: result.userAvatar };
    return result;
  }

  async function logout(): Promise<void> {
    await call(api.logout);
    user.value = null;
    settings.value = null;
  }

  async function getSettings(): Promise<UserSettings | null> {
    const data = await call(api.getSettings);
    if (data) {
      settings.value = data;
      user.value = { login: data.userLogin, avatar_url: data.userAvatar };
    }
    return data;
  }

  async function bootstrap() {
    const data = await call(api.bootstrap);
    if (data.settings) {
      settings.value = data.settings;
      user.value = { login: data.settings.userLogin, avatar_url: data.settings.userAvatar };
    }
    return data;
  }

  async function saveSettings(data: UpdateSettingsRequest) {
    const result = await call(() => api.saveSettings(data));
    settings.value = result;
    user.value = { login: result.userLogin, avatar_url: result.userAvatar };
    return result;
  }

  return {
    user,
    settings,
    login,
    logout,
    bootstrap,
    getSettings,
    saveSettings,
    getState: () => call(api.getState),
    saveState: (state: StateData, expectedRevision: string, profileName?: string, oldProfileName?: string) =>
      call(() => api.saveState(state, expectedRevision, profileName, oldProfileName)),
    getPreview: (name: string) => call(() => api.getPreview(name)),
    postPreview: (profile: Profile) => call(() => api.postPreview(profile)),
    getAssets: () => call(api.getAssets),
    getFile: (path: string) => call(() => api.getFile(path)),
    getTemplate: (source: string) => call(() => api.getTemplate(source)),
    putFile: (data: PutFileRequest) => call(() => api.putFile(data)),
    deleteFile: (path: string, expectedRevision: string) => call(() => api.deleteFile(path, expectedRevision)),
    getRulesetBuild: (rulesetId: string) => call(() => api.getRulesetBuild(rulesetId)),
    retryRulesetBuild: (rulesetId: string) => call(() => api.retryRulesetBuild(rulesetId)),
    getSrsCompiler: () => call(api.getSrsCompiler),
    setSrsCompiler: (enabled: boolean) => call(() => api.setSrsCompiler(enabled)),
  };
}
