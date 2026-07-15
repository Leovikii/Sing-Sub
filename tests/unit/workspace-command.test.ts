import { describe, expect, it } from 'vitest';
import { executeWorkspaceCommand } from '../../worker/application/commands/execute-workspace-command';
import { WorkspaceConflictError } from '../../worker/application/errors/workspace-conflict';
import { InMemoryWorkspaceStore } from '../fakes/in-memory-workspace-store';

interface TestWorkspace {
  profiles: Array<{ name: string }>;
}

describe('workspace application command', () => {
  it('publishes an immutable update against the expected revision', async () => {
    const initial: TestWorkspace = { profiles: [{ name: 'default' }] };
    const store = new InMemoryWorkspaceStore('workspace-1', initial);

    const result = await executeWorkspaceCommand(store, {
      workspaceId: 'workspace-1',
      expectedRevision: 'revision-1',
      update: snapshot => ({ ...snapshot, profiles: [...snapshot.profiles, { name: 'mobile' }] }),
    });

    expect(result).toEqual({ revision: 'revision-2', previousRevision: 'revision-1' });
    expect((await store.read('workspace-1')).snapshot.profiles).toEqual([
      { name: 'default' },
      { name: 'mobile' },
    ]);
    expect(initial.profiles).toEqual([{ name: 'default' }]);
  });

  it('rejects a stale command before executing its update', async () => {
    const store = new InMemoryWorkspaceStore<TestWorkspace>('workspace-1', { profiles: [] });
    let updateCalled = false;

    const error = await executeWorkspaceCommand(store, {
      workspaceId: 'workspace-1',
      expectedRevision: 'revision-0',
      update: snapshot => {
        updateCalled = true;
        return snapshot;
      },
    }).catch(value => value);

    expect(error).toBeInstanceOf(WorkspaceConflictError);
    expect(error).toMatchObject({ expectedRevision: 'revision-0', actualRevision: 'revision-1' });
    expect(updateCalled).toBe(false);
  });

  it('lets the store reject a race after the command read', async () => {
    const store = new InMemoryWorkspaceStore<TestWorkspace>('workspace-1', { profiles: [] });
    const first = await store.read('workspace-1');
    await store.publish({ workspaceId: 'workspace-1', expectedRevision: first.revision, snapshot: first.snapshot });

    await expect(executeWorkspaceCommand(store, {
      workspaceId: 'workspace-1',
      expectedRevision: first.revision,
      update: snapshot => snapshot,
    })).rejects.toMatchObject({ actualRevision: 'revision-2' });
  });
});
