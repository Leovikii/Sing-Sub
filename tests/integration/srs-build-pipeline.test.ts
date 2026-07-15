import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JsonAsset, WorkspaceSnapshot } from '../../shared';
import { saveRulesetSource } from '../../worker/application/commands/rulesets/save-ruleset-source';
import {
  completeSrsBuild,
  dispatchSrsBuild,
  failSrsBuild,
  readSrsBuildSource,
} from '../../worker/application/srs/manage-srs-build';
import type { CompilerDispatcher } from '../../worker/application/ports/compiler-dispatcher';
import { sha256Hex } from '../../worker/domain/revisions/canonical-json';
import { R2ArtifactStore } from '../../worker/infrastructure/r2/r2-artifact-store';
import { R2JobStore } from '../../worker/infrastructure/r2/r2-job-store';
import { R2WorkspaceStore } from '../../worker/infrastructure/r2/r2-workspace-store';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';
import { R2PrivateMetadataStore } from '../../worker/infrastructure/r2/r2-private-metadata-store';
import { createOptionalCompilerDispatcher } from '../../worker/composition/srs-compiler-services';
import { handleSrsJobComplete, handleSrsJobSource } from '../../worker/routes/srs-jobs';
import type { Env } from '../../worker/types';
import { WebCryptoSrsJobTicketService } from '../../worker/infrastructure/security/web-crypto-srs-job-ticket-service';

afterEach(() => vi.unstubAllGlobals());

function snapshot(): WorkspaceSnapshot {
  return {
    schemaVersion: 1,
    workspaceId: 'primary',
    revisionId: 'revision-1',
    previousRevisionId: null,
    createdAt: '2026-07-15T00:00:00.000Z',
    settings: {
      userLogin: 'Administrator',
      userAvatar: '',
      authVersion: 1,
      tokenVersion: 1,
    },
    profiles: [],
    assets: { nodes: {}, templates: {}, patches: {}, rulesets: {} },
    builds: {},
    sync: { status: 'never' },
  };
}

function ruleset(domain: string): JsonAsset {
  return {
    path: 'sing-sub/rulesets/domains.json',
    content: {
      version: 2,
      rules: [{ domain_suffix: [domain] }],
      _sing_sub: { note: 'editor metadata', sources: [] },
    },
  };
}

function command(expectedRevision: string, revisionId: string, domain: string, compilerEnabled = true) {
  return {
    workspaceId: 'primary',
    expectedRevision,
    revisionId,
    createdAt: '2026-07-15T00:01:00.000Z',
    path: 'sing-sub/rulesets/domains.json',
    asset: ruleset(domain),
    compilerEnabled,
  };
}

function stores(bucket: InMemoryR2Bucket) {
  return {
    workspaceStore: new R2WorkspaceStore(bucket),
    jobStore: new R2JobStore(bucket),
    artifactStore: new R2ArtifactStore(bucket),
  };
}

describe('SRS build pipeline', () => {
  it('creates a dispatcher only from a connected private repository', async () => {
    const bucket = new InMemoryR2Bucket();
    const env = {
      WORKSPACE_BUCKET: bucket,
      SESSION_SIGNING_SECRET: 'session-signing-secret-with-at-least-32-bytes',
    } as unknown as Env;
    await expect(createOptionalCompilerDispatcher(env, 'primary')).resolves.toBeNull();

    await new R2PrivateMetadataStore(bucket).create({
      schemaVersion: 1,
      workspaceId: 'primary',
      github: {
        pat: 'private-repository-token',
        owner: 'private-owner',
        repo: 'private-data',
        defaultBranch: 'main',
      },
      srsCompiler: {
        enabled: true,
        status: 'ready',
        workflowVersion: 1,
        workflowHash: 'a'.repeat(64),
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
      updatedAt: '2026-07-15T00:00:00.000Z',
    });
    const dispatcher = await createOptionalCompilerDispatcher(env, 'primary');
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await dispatcher!.dispatch({
      jobId: 'job-1',
      workerUrl: 'https://sing-sub.example.com',
      jobTicket: 'v1.short-lived.ticket',
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/private-owner/private-data/actions/workflows/compile-srs.yml/dispatches',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      inputs: { job_id: 'job-1', worker_url: 'https://sing-sub.example.com', job_ticket: 'v1.short-lived.ticket' },
    });
  });

  it('saves rulesets without creating a job when optional compiler configuration is absent', async () => {
    const bucket = new InMemoryR2Bucket();
    const dependencies = stores(bucket);
    await dependencies.workspaceStore.create({ workspaceId: 'primary', snapshot: snapshot() });

    const saved = await saveRulesetSource(
      dependencies.workspaceStore,
      dependencies.jobStore,
      command('revision-1', 'revision-2', 'example.com', false),
    );

    expect(saved.job).toBeUndefined();
    expect(saved.build.status).toBe('none');
    await expect(dependencies.jobStore.read('primary', saved.build.jobId)).resolves.toBeNull();
    await expect(dependencies.workspaceStore.read('primary')).resolves.toMatchObject({
      snapshot: { assets: { rulesets: { domains: ruleset('example.com') } }, builds: { domains: { status: 'none' } } },
    });
  });

  it('dispatches, compiles, activates, and idempotently accepts the same artifact', async () => {
    const bucket = new InMemoryR2Bucket();
    const dependencies = stores(bucket);
    await dependencies.workspaceStore.create({ workspaceId: 'primary', snapshot: snapshot() });
    const saved = await saveRulesetSource(
      dependencies.workspaceStore,
      dependencies.jobStore,
      command('revision-1', 'revision-2', 'example.com'),
    );
    const dispatcher: CompilerDispatcher = { dispatch: vi.fn(async () => undefined) };
    const ticketService = {
      issue: vi.fn(async () => 'v1.short-lived.ticket'),
      verify: vi.fn(async () => null),
    };

    await expect(dispatchSrsBuild({
      ...dependencies,
      dispatcher,
      ticketService,
      workerUrl: 'https://sing-sub.example.com',
    }, 'primary', saved.job!.jobId))
      .resolves.toBe('dispatched');
    expect(ticketService.issue).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'srs-build',
      workspaceId: 'primary',
      jobId: saved.job!.jobId,
      operations: ['source', 'complete', 'failed'],
    }));
    expect(dispatcher.dispatch).toHaveBeenCalledWith({
      jobId: saved.job!.jobId,
      workerUrl: 'https://sing-sub.example.com',
      jobTicket: 'v1.short-lived.ticket',
    });
    await expect(dependencies.workspaceStore.read('primary')).resolves.toMatchObject({
      revision: 'revision-2',
      snapshot: { builds: { domains: { status: 'pending' } } },
    });

    const source = await readSrsBuildSource(dependencies, 'primary', saved.job!.jobId);
    expect(source.source).not.toContain('_sing_sub');
    expect(JSON.parse(source.source)).toEqual({
      version: 2,
      rules: [{ domain_suffix: ['example.com'] }],
    });
    const artifact = new Uint8Array([0x53, 0x52, 0x53, 0x01]);
    const contentHash = await sha256Hex(artifact);
    const first = await completeSrsBuild(dependencies, {
      workspaceId: 'primary',
      jobId: saved.job!.jobId,
      compilerVersion: source.compilerVersion,
      contentHash,
      content: artifact,
    });
    expect(first).toMatchObject({ status: 'ready', artifact: { contentHash, size: 4 } });
    const ready = await dependencies.workspaceStore.read('primary');
    expect(ready.snapshot.builds.domains).toMatchObject({
      status: 'ready',
      activeArtifact: { contentHash, sourceHash: saved.build.sourceHash },
    });

    await expect(completeSrsBuild(dependencies, {
      workspaceId: 'primary',
      jobId: saved.job!.jobId,
      compilerVersion: source.compilerVersion,
      contentHash,
      content: artifact,
    })).resolves.toMatchObject({ status: 'ready' });
    await expect(dependencies.workspaceStore.read('primary')).resolves.toMatchObject({ revision: ready.revision });
  });

  it('authenticates internal source and artifact callbacks without exposing R2 credentials', async () => {
    const bucket = new InMemoryR2Bucket();
    const dependencies = stores(bucket);
    await dependencies.workspaceStore.create({ workspaceId: 'primary', snapshot: snapshot() });
    const saved = await saveRulesetSource(
      dependencies.workspaceStore,
      dependencies.jobStore,
      command('revision-1', 'revision-2', 'callback.example'),
    );
    const secret = 'session-signing-secret-with-at-least-32-bytes';
    const env = {
      WORKSPACE_BUCKET: bucket,
      SESSION_SIGNING_SECRET: secret,
    } as unknown as Env;
    const now = Math.floor(Date.now() / 1000);
    const ticketService = new WebCryptoSrsJobTicketService(secret, () => now);
    const ticket = await ticketService.issue({
      purpose: 'srs-build',
      workspaceId: 'primary',
      jobId: saved.job!.jobId,
      operations: ['source', 'complete', 'failed'],
      issuedAt: now,
      expiresAt: now + 900,
    });

    const rejected = await handleSrsJobSource(
      new Request(`https://example.com/internal/srs-jobs/${saved.job!.jobId}/source`, {
        headers: { Authorization: 'Bearer wrong-ticket' },
      }),
      env,
      saved.job!.jobId,
    );
    expect(rejected.status).toBe(401);

    const source = await handleSrsJobSource(
      new Request(`https://example.com/internal/srs-jobs/${saved.job!.jobId}/source`, {
        headers: { Authorization: `Bearer ${ticket}` },
      }),
      env,
      saved.job!.jobId,
    );
    expect(source.status).toBe(200);
    expect(await source.text()).not.toContain('_sing_sub');

    const artifact = new Uint8Array([0x53, 0x52, 0x53]);
    const completed = await handleSrsJobComplete(
      new Request(`https://example.com/internal/srs-jobs/${saved.job!.jobId}/complete`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${ticket}`,
          'X-SRS-SHA256': await sha256Hex(artifact),
          'X-Sing-Box-Version': saved.job!.compilerVersion,
        },
        body: artifact,
      }),
      env,
      saved.job!.jobId,
    );
    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toMatchObject({ data: { status: 'ready' } });

    const wrongJob = await handleSrsJobSource(
      new Request(`https://example.com/internal/srs-jobs/${saved.job!.jobId}/source`, {
        headers: { Authorization: `Bearer ${await ticketService.issue({
          purpose: 'srs-build',
          workspaceId: 'primary',
          jobId: 'other-job',
          operations: ['source'],
          issuedAt: now,
          expiresAt: now + 900,
        })}` },
      }),
      env,
      saved.job!.jobId,
    );
    expect(wrongJob.status).toBe(401);
  });

  it('supersedes stale results and preserves the last active artifact after a newer failure', async () => {
    const bucket = new InMemoryR2Bucket();
    const dependencies = stores(bucket);
    await dependencies.workspaceStore.create({ workspaceId: 'primary', snapshot: snapshot() });

    const first = await saveRulesetSource(
      dependencies.workspaceStore,
      dependencies.jobStore,
      command('revision-1', 'revision-2', 'one.example'),
    );
    const firstSource = await readSrsBuildSource(dependencies, 'primary', first.job!.jobId);
    const firstArtifact = new Uint8Array([1, 2, 3]);
    await completeSrsBuild(dependencies, {
      workspaceId: 'primary',
      jobId: first.job!.jobId,
      compilerVersion: firstSource.compilerVersion,
      contentHash: await sha256Hex(firstArtifact),
      content: firstArtifact,
    });
    const activeRevision = await dependencies.workspaceStore.read('primary');
    const active = activeRevision.snapshot.builds.domains.activeArtifact;

    const second = await saveRulesetSource(
      dependencies.workspaceStore,
      dependencies.jobStore,
      command(activeRevision.revision, 'revision-3', 'two.example'),
    );
    const secondSource = await readSrsBuildSource(dependencies, 'primary', second.job!.jobId);
    const third = await saveRulesetSource(
      dependencies.workspaceStore,
      dependencies.jobStore,
      command('revision-3', 'revision-4', 'three.example'),
    );
    const staleArtifact = new Uint8Array([4, 5, 6]);

    await expect(completeSrsBuild(dependencies, {
      workspaceId: 'primary',
      jobId: second.job!.jobId,
      compilerVersion: secondSource.compilerVersion,
      contentHash: await sha256Hex(staleArtifact),
      content: staleArtifact,
    })).resolves.toEqual({ status: 'superseded' });
    await expect(dependencies.jobStore.read('primary', second.job!.jobId)).resolves.toMatchObject({
      job: { status: 'superseded' },
    });

    await expect(failSrsBuild(
      dependencies,
      'primary',
      third.job!.jobId,
      third.job!.compilerVersion,
    )).resolves.toBe('failed');
    const failed = await dependencies.workspaceStore.read('primary');
    expect(failed.snapshot.builds.domains).toMatchObject({ status: 'failed', activeArtifact: active });
    const failedRevision = failed.revision;
    await expect(failSrsBuild(
      dependencies,
      'primary',
      third.job!.jobId,
      third.job!.compilerVersion,
    )).resolves.toBe('failed');
    await expect(dependencies.workspaceStore.read('primary')).resolves.toMatchObject({ revision: failedRevision });
  });
});
