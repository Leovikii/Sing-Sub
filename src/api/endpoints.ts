import type {
  AssetSnapshot,
  BootstrapResult,
  FileContent,
  LoginResult,
  PreviewResult,
  Profile,
  PublicUserSettings,
  PutFileRequest,
  PutFileResult,
  RulesetBuildStatusResult,
  SrsCompilerStatusResult,
  SaveResult,
  SetupData,
  StateData,
  StateResult,
  UpdateSettingsRequest,
  GithubSyncConnectionRequest,
  GithubSyncConnectionResult,
  SyncOperationRequest,
  SyncOperationResult,
  SyncStatusResult,
} from '../../shared';
import { apiRequest } from './client';

export const api = {
  login: (data: SetupData) => apiRequest<LoginResult>('/api/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => apiRequest<{ ok: true }>('/api/logout', { method: 'POST' }),
  bootstrap: () => apiRequest<BootstrapResult>('/api/bootstrap'),
  getSettings: () => apiRequest<PublicUserSettings | null>('/api/settings'),
  saveSettings: (data: UpdateSettingsRequest) => apiRequest<LoginResult>('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getState: () => apiRequest<StateResult>('/api/state'),
  saveState: (state: StateData, expectedRevision: string, profileName?: string, oldProfileName?: string) =>
    apiRequest<SaveResult>('/api/state', {
      method: 'PUT',
      body: JSON.stringify({ state, expectedRevision, profileName, oldProfileName }),
    }),
  getPreview: (name: string) => apiRequest<PreviewResult>(`/api/preview/${encodeURIComponent(name)}.json`),
  postPreview: (profile: Profile) => apiRequest<PreviewResult>('/api/preview', { method: 'POST', body: JSON.stringify(profile) }),
  getAssets: () => apiRequest<AssetSnapshot>('/api/assets'),
  getFile: (path: string) => apiRequest<FileContent>(`/api/file?path=${encodeURIComponent(path)}`),
  getTemplate: (source: string) => apiRequest<{ content: unknown }>(`/api/template?source=${encodeURIComponent(source)}`),
  putFile: (data: PutFileRequest) => apiRequest<PutFileResult>('/api/file', { method: 'PUT', body: JSON.stringify(data) }),
  deleteFile: (path: string, expectedRevision: string) => apiRequest<{ success: true; revision: string }>(
    `/api/file?path=${encodeURIComponent(path)}&expectedRevision=${encodeURIComponent(expectedRevision)}`,
    { method: 'DELETE' },
  ),
  getRulesetBuild: (rulesetId: string) => apiRequest<RulesetBuildStatusResult>(
    `/api/rulesets/${encodeURIComponent(rulesetId)}/build`,
  ),
  retryRulesetBuild: (rulesetId: string) => apiRequest<{ accepted: true; jobId: string }>(
    `/api/rulesets/${encodeURIComponent(rulesetId)}/build`,
    { method: 'POST' },
  ),
  getSrsCompiler: () => apiRequest<SrsCompilerStatusResult>('/api/srs-compiler'),
  setSrsCompiler: (enabled: boolean) => apiRequest<SrsCompilerStatusResult>(
    '/api/srs-compiler',
    { method: 'PUT', body: JSON.stringify({ enabled }) },
  ),
  getGithubSync: () => apiRequest<SyncStatusResult>('/api/github-sync'),
  connectGithubSync: (data: GithubSyncConnectionRequest) => apiRequest<GithubSyncConnectionResult>(
    '/api/github-sync/connection',
    { method: 'PUT', body: JSON.stringify(data) },
  ),
  disconnectGithubSync: () => apiRequest<GithubSyncConnectionResult>(
    '/api/github-sync/connection',
    { method: 'DELETE' },
  ),
  pushGithubSync: (data: SyncOperationRequest) => apiRequest<SyncOperationResult>(
    '/api/github-sync/push',
    { method: 'POST', body: JSON.stringify(data) },
  ),
  pullGithubSync: (data: SyncOperationRequest) => apiRequest<SyncOperationResult>(
    '/api/github-sync/pull',
    { method: 'POST', body: JSON.stringify(data) },
  ),
};
