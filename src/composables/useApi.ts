import { ref } from 'vue';
import type { UserSettings, SetupData, StateData, GithubUser, Profile } from '../types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function useApi() {
  const user = ref<GithubUser | null>(null);
  const settings = ref<UserSettings | null>(null);

  async function apiCall(path: string, options: RequestInit = {}): Promise<any> {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (res.status === 401) {
      user.value = null;
      settings.value = null;
      throw new ApiError('Not authenticated', 401);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(err.error || res.statusText, res.status);
    }
    return res.json();
  }

  async function login(data: SetupData): Promise<UserSettings & { warning?: string }> {
    const result = await apiCall('/api/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    settings.value = result;
    user.value = { login: result.userLogin, avatar_url: result.userAvatar };
    return result;
  }

  async function logout(): Promise<void> {
    await apiCall('/api/logout', { method: 'POST' });
    user.value = null;
    settings.value = null;
  }

  async function getSettings(): Promise<UserSettings | null> {
    const data = await apiCall('/api/settings');
    if (data) {
      settings.value = data;
      user.value = { login: data.userLogin, avatar_url: data.userAvatar };
    }
    return data;
  }

  async function saveSettings(data: SetupData & { subToken: string }): Promise<UserSettings & { warning?: string }> {
    const result = await apiCall('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    settings.value = result;
    user.value = { login: result.userLogin, avatar_url: result.userAvatar };
    return result;
  }

  async function deleteSettings(): Promise<void> {
    await apiCall('/api/settings', { method: 'DELETE' });
    user.value = null;
    settings.value = null;
  }

  async function getState(): Promise<{ state: StateData }> {
    return apiCall('/api/state');
  }

  async function saveState(state: StateData, profileName?: string, oldProfileName?: string): Promise<{ warning?: string }> {
    return apiCall('/api/state', {
      method: 'PUT',
      body: JSON.stringify({ state, profileName, oldProfileName }),
    });
  }

  async function rebuild(): Promise<{ state: StateData; warning?: string }> {
    return apiCall('/api/rebuild', { method: 'POST' });
  }

  async function getPreview(name: string): Promise<{ content: string }> {
    return apiCall(`/api/preview/${name}.json`);
  }

  async function postPreview(profile: Profile): Promise<{ content: string }> {
    return apiCall('/api/preview', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
  }

  async function getAssets(): Promise<{ nodes: any[], templates: any[], patches: any[], rulesets: any[] }> {
    return apiCall('/api/assets');
  }

  async function getFile(path: string): Promise<{ content: string; sha: string }> {
    return apiCall(`/api/file?path=${encodeURIComponent(path)}`);
  }

  async function getTemplate(source: string): Promise<{ content: unknown }> {
    return apiCall(`/api/template?source=${encodeURIComponent(source)}`);
  }

  async function deleteFile(path: string): Promise<void> {
    return apiCall(`/api/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  }

  return {
    user, settings,
    login, logout, getSettings, saveSettings, deleteSettings,
    getState, saveState, rebuild, getPreview, postPreview, getAssets, getFile, getTemplate, deleteFile,
  };
}
