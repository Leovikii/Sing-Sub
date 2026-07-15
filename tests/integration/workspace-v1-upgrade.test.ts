import { describe, expect, it, vi } from 'vitest';
import { MOMO_ADAPTER_PRESET } from '../../shared';
import { handleBootstrap, handleLogin } from '../../worker/routes/auth';
import type { Env } from '../../worker/types';
import { canonicalJson, sha256Hex } from '../../worker/domain/revisions/canonical-json';
import { r2ObjectKeys } from '../../worker/infrastructure/r2/r2-object-keys';
import { R2PrivateMetadataStore } from '../../worker/infrastructure/r2/r2-private-metadata-store';
import { R2WorkspaceStore } from '../../worker/infrastructure/r2/r2-workspace-store';
import { upgradeWorkspaceV1 } from '../../worker/infrastructure/r2/r2-workspace-v1-upgrade';
import worker from '../../worker/index';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';

const workspaceId = 'primary';
const legacyRevision = 'legacy-revision-1';
const createdAt = '2026-07-15T12:00:00.000Z';

function environment(bucket: InMemoryR2Bucket): Env {
  return {
    WORKSPACE_BUCKET: bucket,
    ADMIN_PASSWORD: 'correct-password',
    SESSION_SIGNING_SECRET: 'session-secret-with-at-least-32-bytes',
    SUBSCRIPTION_SIGNING_SECRET: 'subscription-secret-with-at-least-32-bytes',
  } as unknown as Env;
}

function legacySnapshot() {
  return {
    schemaVersion: 1,
    workspaceId,
    revisionId: legacyRevision,
    previousRevisionId: null,
    createdAt,
    settings: {
      owner: 'owner',
      repo: 'repo',
      userLogin: 'github-user',
      userAvatar: 'https://avatars.githubusercontent.com/u/1',
      defaultBranch: 'main',
      authVersion: 3,
      tokenVersion: 4,
    },
    profiles: [
      {
        name: 'momo-client',
        note: 'Momo client',
        templateUrl: 'sing-sub/templates/client.json',
        patchUrl: 'sing-sub/patches/momo.json',
        nodesPath: 'sing-sub/nodes/default.json',
        rules: [],
        inboundRules: [],
        overrides: { log: { level: 'warn' } },
        order: 0,
      },
      {
        name: 'plain-client',
        templateUrl: 'sing-sub/templates/client.json',
        nodesPath: 'sing-sub/nodes/default.json',
        rules: [],
        inboundRules: [],
        order: 1,
      },
    ],
    assets: {
      nodes: {
        default: {
          path: 'sing-sub/nodes/default.json',
          content: { outbounds: [{ tag: 'node-1', type: 'direct' }] },
        },
      },
      templates: {
        client: {
          path: 'sing-sub/templates/client.json',
          content: {
            inbounds: [],
            outbounds: [],
            route: { rules: [{ action: 'hijack-dns' }] },
          },
        },
      },
      patches: {
        momo: {
          path: 'sing-sub/patches/momo.json',
          content: { inbounds: [{ tag: 'legacy' }] },
        },
      },
      rulesets: {
        public: {
          path: 'sing-sub/rulesets/public.json',
          content: { version: 2, rules: [{ domain_suffix: ['example.com'] }] },
        },
      },
    },
    builds: {
      public: {
        jobId: 'job-public-1',
        rulesetId: 'public',
        sourceHash: 'b'.repeat(64),
        compilerVersion: 'sing-box-1.12.0',
        status: 'ready',
        activeArtifact: {
          rulesetId: 'public',
          sourceHash: 'b'.repeat(64),
          contentHash: 'c'.repeat(64),
          size: 128,
          createdAt,
        },
        updatedAt: createdAt,
      },
    },
    sync: {
      status: 'synced',
      baseWorkspaceRevision: legacyRevision,
      baseRemoteRevision: 'github-commit-1',
      baseContentHash: 'a'.repeat(64),
      baseRepository: 'owner/repo',
      updatedAt: createdAt,
    },
  };
}

async function seedLegacyWorkspace(bucket: InMemoryR2Bucket, validHash = true) {
  const snapshot = legacySnapshot();
  const contentHash = validHash ? await sha256Hex(canonicalJson(snapshot)) : 'f'.repeat(64);
  await bucket.put(
    r2ObjectKeys.revision(workspaceId, legacyRevision),
    JSON.stringify(snapshot),
    {
      onlyIf: { etagDoesNotMatch: '*' },
      customMetadata: { workspaceId, revisionId: legacyRevision, contentHash, createdAt },
    },
  );
  await bucket.put(
    r2ObjectKeys.head(workspaceId),
    canonicalJson({
      schemaVersion: 1,
      workspaceId,
      currentRevision: legacyRevision,
      previousRevision: null,
      updatedAt: createdAt,
      contentHash,
    }),
    { onlyIf: { etagDoesNotMatch: '*' } },
  );
}

async function currentRawSnapshot(bucket: InMemoryR2Bucket) {
  const head = JSON.parse(await (await bucket.get(r2ObjectKeys.head(workspaceId)))!.text()) as {
    currentRevision: string;
    previousRevision: string | null;
  };
  const snapshot = JSON.parse(await (
    await bucket.get(r2ObjectKeys.revision(workspaceId, head.currentRevision))
  )!.text()) as Record<string, unknown>;
  return { head, snapshot };
}

describe('temporary workspace schema v1 upgrade', () => {
  it('reports an existing v1 workspace without mutating it during bootstrap', async () => {
    const bucket = new InMemoryR2Bucket();
    await seedLegacyWorkspace(bucket);

    const response = await handleBootstrap(
      new Request('https://example.com/api/bootstrap'),
      environment(bucket),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { settings: null, setupRequired: false },
    });
    await expect(currentRawSnapshot(bucket)).resolves.toMatchObject({
      head: { currentRevision: legacyRevision },
      snapshot: { schemaVersion: 1 },
    });
  });

  it('does not migrate a v1 workspace before the administrator password is verified', async () => {
    const bucket = new InMemoryR2Bucket();
    await seedLegacyWorkspace(bucket);

    const response = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'wrong-password' }),
    }), environment(bucket));

    expect(response.status).toBe(401);
    await expect(currentRawSnapshot(bucket)).resolves.toMatchObject({
      head: { currentRevision: legacyRevision },
      snapshot: { schemaVersion: 1 },
    });
  });

  it('migrates v1 to a clean v2 root once and preserves private credentials', async () => {
    const bucket = new InMemoryR2Bucket();
    await seedLegacyWorkspace(bucket);
    await new R2PrivateMetadataStore(bucket).create({
      schemaVersion: 1,
      workspaceId,
      github: {
        pat: 'private-github-token',
        owner: 'owner',
        repo: 'repo',
        defaultBranch: 'main',
      },
      updatedAt: createdAt,
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const first = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), environment(bucket));

    expect(first.status).toBe(200);
    expect(first.headers.get('Set-Cookie')).toContain('__Host-sing-sub-session=');
    const cookie = first.headers.get('Set-Cookie')!.split(';')[0];
    const migrated = await new R2WorkspaceStore(bucket).read(workspaceId);
    expect(migrated.revision).not.toBe(legacyRevision);
    expect(migrated.snapshot).toMatchObject({
      schemaVersion: 2,
      previousRevisionId: null,
      settings: { authVersion: 3, tokenVersion: 4, owner: 'owner', repo: 'repo' },
      profiles: [
        {
          name: 'momo-client',
          adapterUrl: 'sing-sub/adapters/momo.json',
        },
        {
          name: 'plain-client',
        },
      ],
      assets: {
        nodes: { default: { content: { outbounds: [{ tag: 'node-1' }] } } },
        templates: { client: { path: 'sing-sub/templates/client.json' } },
        adapters: { momo: { content: MOMO_ADAPTER_PRESET } },
        rulesets: { public: { path: 'sing-sub/rulesets/public.json' } },
      },
      builds: {
        public: {
          status: 'ready',
          activeArtifact: { contentHash: 'c'.repeat(64), size: 128 },
        },
      },
      sync: { status: 'never' },
    });
    expect(migrated.snapshot.profiles[0]).not.toHaveProperty('patchUrl');
    expect(migrated.snapshot.profiles[0]).not.toHaveProperty('overrides');
    expect(migrated.snapshot.profiles[1]).not.toHaveProperty('adapterUrl');
    expect(migrated.snapshot.assets).not.toHaveProperty('patches');
    expect(bucket.has(r2ObjectKeys.revision(workspaceId, legacyRevision))).toBe(true);
    await expect(new R2PrivateMetadataStore(bucket).read(workspaceId)).resolves.toMatchObject({
      credentials: { github: { pat: 'private-github-token', owner: 'owner', repo: 'repo' } },
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('workspace.v1-upgrade'));

    const preview = await worker.fetch(new Request(
      'https://example.com/api/preview/momo-client.json',
      { headers: { Cookie: cookie } },
    ), environment(bucket));
    expect(preview.status).toBe(200);
    const previewBody = await preview.json() as { data: { content: string } };
    expect(previewBody.data.content).toContain('"tag": "dns-in"');
    expect(previewBody.data.content).not.toContain('"tag": "legacy"');

    const second = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), environment(bucket));
    expect(second.status).toBe(200);
    await expect(new R2WorkspaceStore(bucket).read(workspaceId)).resolves.toMatchObject({
      revision: migrated.revision,
    });
    const revisions = await bucket.list({ prefix: r2ObjectKeys.revisionPrefix(workspaceId) });
    expect(revisions.objects).toHaveLength(2);
    log.mockRestore();
  });

  it('refuses to migrate a v1 revision whose stored content hash is invalid', async () => {
    const bucket = new InMemoryR2Bucket();
    await seedLegacyWorkspace(bucket, false);

    const response = await worker.fetch(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), environment(bucket));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL_ERROR' },
    });
    await expect(currentRawSnapshot(bucket)).resolves.toMatchObject({
      head: { currentRevision: legacyRevision },
      snapshot: { schemaVersion: 1 },
    });
  });

  it('uses head CAS so concurrent upgrades converge on one valid v2 workspace', async () => {
    const bucket = new InMemoryR2Bucket();
    await seedLegacyWorkspace(bucket);

    const results = await Promise.all([
      upgradeWorkspaceV1(bucket, workspaceId, '2026-07-16T01:00:00.000Z'),
      upgradeWorkspaceV1(bucket, workspaceId, '2026-07-16T01:00:01.000Z'),
    ]);

    expect(results.sort()).toEqual(['current', 'upgraded']);
    await expect(new R2WorkspaceStore(bucket).read(workspaceId)).resolves.toMatchObject({
      snapshot: { schemaVersion: 2, previousRevisionId: null },
    });
  });
});
