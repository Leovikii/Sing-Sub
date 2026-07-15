import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceSnapshot } from '../../shared';
import type { CompilerDispatcher } from '../../worker/application/ports/compiler-dispatcher';
import type { SrsJobTicketService } from '../../worker/application/ports/srs-job-ticket-service';
import {
  dispatchSrsBuildBatch,
  reconcileSrsBuilds,
} from '../../worker/application/srs/reconcile-srs-builds';
import { R2JobStore } from '../../worker/infrastructure/r2/r2-job-store';
import { R2WorkspaceStore } from '../../worker/infrastructure/r2/r2-workspace-store';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';

function snapshot(): WorkspaceSnapshot {
  return {
    schemaVersion: 1,
    workspaceId: 'primary',
    revisionId: 'revision-1',
    previousRevisionId: null,
    createdAt: '2026-07-15T00:00:00.000Z',
    settings: {
      userLogin: 'Administrator', userAvatar: '', authVersion: 1, tokenVersion: 1,
    },
    profiles: [],
    assets: {
      nodes: {}, templates: {}, patches: {},
      rulesets: Object.fromEntries(Array.from({ length: 5 }, (_, index) => {
        const id = `rules-${index + 1}`;
        return [id, {
          path: `sing-sub/rulesets/${id}.json`,
          content: { version: 2, rules: [{ domain_suffix: [`${index + 1}.example`] }] },
        }];
      })),
    },
    builds: {},
    sync: { status: 'never' },
  };
}

describe('SRS compiler reconcile', () => {
  it('publishes all pending summaries once and dispatches with bounded concurrency', async () => {
    const bucket = new InMemoryR2Bucket();
    const workspaceStore = new R2WorkspaceStore(bucket);
    const jobStore = new R2JobStore(bucket);
    await workspaceStore.create({ workspaceId: 'primary', snapshot: snapshot() });

    const reconciled = await reconcileSrsBuilds({ workspaceStore, jobStore }, 'primary');
    expect(reconciled.createdJobIds).toHaveLength(5);
    expect(reconciled.dispatchJobIds).toEqual(reconciled.createdJobIds);
    const workspace = await workspaceStore.read('primary');
    expect(workspace.revision).toBe(reconciled.revision);
    expect(workspace.snapshot.previousRevisionId).toBe('revision-1');
    expect(Object.values(workspace.snapshot.builds)).toHaveLength(5);
    expect(Object.values(workspace.snapshot.builds).every(build => build.status === 'pending')).toBe(true);

    let active = 0;
    let maximumActive = 0;
    const dispatcher: CompilerDispatcher = {
      dispatch: vi.fn(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active -= 1;
      }),
    };
    const ticketService: SrsJobTicketService = {
      issue: vi.fn(async claims => `ticket-${claims.jobId}`),
      verify: vi.fn(async () => null),
    };
    const results = await dispatchSrsBuildBatch({
      workspaceStore,
      jobStore,
      dispatcher,
      ticketService,
      workerUrl: 'https://sing-sub.example.com',
    }, 'primary', reconciled.dispatchJobIds, 2);

    expect(Object.values(results)).toEqual(Array(5).fill('dispatched'));
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(5);
    expect(maximumActive).toBe(2);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      workerUrl: 'https://sing-sub.example.com',
      jobTicket: expect.stringMatching(/^ticket-srs-/),
    }));

    const repeated = await reconcileSrsBuilds({ workspaceStore, jobStore }, 'primary');
    expect(repeated.revision).toBe(reconciled.revision);
    expect(repeated.createdJobIds).toEqual([]);
    expect(repeated.dispatchJobIds).toEqual(reconciled.dispatchJobIds);
    await dispatchSrsBuildBatch({
      workspaceStore,
      jobStore,
      dispatcher,
      ticketService,
      workerUrl: 'https://sing-sub.example.com',
    }, 'primary', repeated.dispatchJobIds, 2);
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(5);
  });

  it('rejects unsafe concurrency values', async () => {
    const dependencies = {
      workspaceStore: {} as R2WorkspaceStore,
      jobStore: {} as R2JobStore,
      dispatcher: {} as CompilerDispatcher,
      ticketService: {} as SrsJobTicketService,
      workerUrl: 'https://sing-sub.example.com',
    };
    await expect(dispatchSrsBuildBatch(dependencies, 'primary', [], 0))
      .rejects.toThrow('between 1 and 4');
  });
});
