import { ref } from 'vue';
import type { UserSettings, SetupData, StateData, GithubUser, Profile } from '../types';

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
      throw new Error('Not authenticated');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
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

  async function getState(): Promise<{ state: StateData; sha: string | null }> {
    return apiCall('/api/state');
  }

  async function saveState(state: StateData, sha: string | null, profileName?: string): Promise<{ sha: string; warning?: string }> {
    return apiCall('/api/state', {
      method: 'PUT',
      body: JSON.stringify({ state, sha, profileName }),
    });
  }

  async function rebuild(): Promise<{ state: StateData; sha: string | null; warning?: string }> {
    return apiCall('/api/rebuild', { method: 'POST' });
  }

  async function getPreview(name: string): Promise<{ content: string }> {
    return apiCall(`/api/preview/${name}.json`);
  }

  async function postPreview(profile: Profile): Promise<{ content: string }> {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Preview failed');
    }
    return res.json();
  }

  async function getAssets(): Promise<{ nodes: any[], templates: any[], patches: any[] }> {
    return apiCall('/api/assets');
  }

  async function getFile(path: string): Promise<{ content: string; sha: string }> {
    return apiCall(`/api/file?path=${encodeURIComponent(path)}`);
  }

  return {
    user, settings,
    login, logout, getSettings, saveSettings, deleteSettings,
    getState, saveState, rebuild, getPreview, postPreview, getAssets, getFile,
  };
}
