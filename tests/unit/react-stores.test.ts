import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/api/endpoints';
import { bootstrapApplication, clearApplicationSession } from '../../src-react/app/session';
import { useAssetsStore } from '../../src-react/stores/assets';
import { useSessionStore } from '../../src-react/stores/session';
import { useWorkspaceStore } from '../../src-react/stores/workspace';

afterEach(() => {
  clearApplicationSession();
  vi.restoreAllMocks();
});

describe('React application stores', () => {
  it('hydrates session and workspace from one bootstrap response', async () => {
    vi.spyOn(api, 'bootstrap').mockResolvedValue({
      settings: {
        subToken: 'token',
        userLogin: 'admin',
        userAvatar: '',
      },
      state: { profiles: [] },
      revision: 'revision-1',
      setupRequired: false,
    });

    await bootstrapApplication(true);

    expect(useSessionStore.getState()).toMatchObject({
      initializationStatus: 'ready',
      setupRequired: false,
      settings: { userLogin: 'admin' },
    });
    expect(useWorkspaceStore.getState()).toMatchObject({
      revision: 'revision-1',
      state: { profiles: [] },
      dirty: false,
    });
  });

  it('clears all cross-page state on logout or unauthorized responses', () => {
    useWorkspaceStore.getState().replace({ profiles: [] }, 'revision-2');
    useAssetsStore.getState().replace({ nodes: [], templates: [], rulesets: [] });

    clearApplicationSession();

    expect(useSessionStore.getState().settings).toBeNull();
    expect(useWorkspaceStore.getState().state).toBeNull();
    expect(useAssetsStore.getState().loaded).toBe(false);
  });
});
