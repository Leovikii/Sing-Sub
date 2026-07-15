import { z } from 'zod';
import {
  MOMO_ADAPTER_PRESET,
  SAFE_ENTITY_NAME,
  buildSummarySchema,
  jsonAssetSchema,
  migrationMetadataSchema,
  syncMetadataSchema,
  workspaceHeadSchema,
  workspaceSettingsSchema,
  workspaceSnapshotSchema,
  type WorkspaceSnapshot,
} from '../../../shared';
import { WorkspaceConflictError } from '../../application/errors/workspace-conflict';
import { canonicalJson, sha256Hex } from '../../domain/revisions/canonical-json';
import { r2ObjectKeys } from './r2-object-keys';
import {
  WorkspaceRevisionCollisionError,
  WorkspaceStorageCorruptError,
} from './r2-workspace-errors';
import type { R2BucketPort } from './r2-workspace-store';

const entityIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);
const momoAdapterPath = 'sing-sub/adapters/momo.json';

const legacyFilterActionSchema = z.object({
  action: z.enum(['include', 'exclude']),
  keyword: z.string(),
}).strict();

const legacyProfileSchema = z.object({
  name: z.string().regex(SAFE_ENTITY_NAME),
  note: z.string().optional(),
  templateUrl: z.string().refine(value => !/^https?:\/\//i.test(value)),
  patchUrl: z.string().optional(),
  nodesPath: z.string(),
  rules: z.array(z.object({
    group: z.string(),
    filters: z.array(legacyFilterActionSchema),
  }).strict()),
  inboundRules: z.array(z.object({
    tag: z.string(),
    filters: z.array(legacyFilterActionSchema),
  }).strict()),
  overrides: z.record(z.string(), z.unknown()).optional(),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
  order: z.number().int().nonnegative(),
}).strict();

const legacyWorkspaceSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
  revisionId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
  previousRevisionId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/).nullable(),
  createdAt: z.iso.datetime(),
  settings: workspaceSettingsSchema,
  profiles: z.array(legacyProfileSchema),
  assets: z.object({
    nodes: z.record(entityIdSchema, jsonAssetSchema),
    templates: z.record(entityIdSchema, jsonAssetSchema),
    patches: z.record(entityIdSchema, jsonAssetSchema),
    rulesets: z.record(entityIdSchema, jsonAssetSchema),
  }).strict(),
  builds: z.record(entityIdSchema, buildSummarySchema),
  sync: syncMetadataSchema,
  migration: migrationMetadataSchema.optional(),
}).strict();

type LegacyWorkspaceSnapshot = z.infer<typeof legacyWorkspaceSnapshotSchema>;

interface LoadedLegacyWorkspace {
  headEtag: string;
  headRevision: string;
  snapshot: LegacyWorkspaceSnapshot;
}

type LoadedWorkspace =
  | { version: 2 }
  | { version: 1; legacy: LoadedLegacyWorkspace };

export type WorkspaceV1UpgradeResult = 'missing' | 'current' | 'upgraded';

function parseJson(source: string, reason: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    throw new WorkspaceStorageCorruptError(reason);
  }
}

async function loadWorkspace(bucket: R2BucketPort, workspaceId: string): Promise<LoadedWorkspace | null> {
  const headObject = await bucket.get(r2ObjectKeys.head(workspaceId));
  if (!headObject) return null;
  const parsedHead = workspaceHeadSchema.safeParse(parseJson(
    await headObject.text(),
    'Workspace head is not valid JSON during v1 upgrade',
  ));
  if (!parsedHead.success || parsedHead.data.workspaceId !== workspaceId) {
    throw new WorkspaceStorageCorruptError('Workspace head schema is invalid during v1 upgrade');
  }

  const revisionObject = await bucket.get(r2ObjectKeys.revision(workspaceId, parsedHead.data.currentRevision));
  if (!revisionObject) {
    throw new WorkspaceStorageCorruptError('Current workspace revision is missing during v1 upgrade');
  }
  const document = parseJson(
    await revisionObject.text(),
    'Current workspace revision is not valid JSON during v1 upgrade',
  );
  const contentHash = await sha256Hex(canonicalJson(document));
  if (contentHash !== parsedHead.data.contentHash) {
    throw new WorkspaceStorageCorruptError('Workspace content hash is invalid during v1 upgrade');
  }

  const current = workspaceSnapshotSchema.safeParse(document);
  if (current.success && current.data.workspaceId === workspaceId &&
      current.data.revisionId === parsedHead.data.currentRevision) {
    return { version: 2 };
  }

  const legacy = legacyWorkspaceSnapshotSchema.safeParse(document);
  if (!legacy.success || legacy.data.workspaceId !== workspaceId ||
      legacy.data.revisionId !== parsedHead.data.currentRevision) {
    throw new WorkspaceStorageCorruptError('Workspace revision is neither valid schema v1 nor v2');
  }
  return {
    version: 1,
    legacy: {
      headEtag: headObject.etag,
      headRevision: parsedHead.data.currentRevision,
      snapshot: legacy.data,
    },
  };
}

function convertSnapshot(
  source: LegacyWorkspaceSnapshot,
  revisionId: string,
  createdAt: string,
): WorkspaceSnapshot {
  const profiles = source.profiles.map(profile => {
    const unchanged = { ...profile };
    const { patchUrl } = unchanged;
    delete unchanged.patchUrl;
    delete unchanged.overrides;
    return {
      ...unchanged,
      ...(patchUrl ? { adapterUrl: momoAdapterPath } : {}),
    };
  });
  return workspaceSnapshotSchema.parse({
    schemaVersion: 2,
    workspaceId: source.workspaceId,
    revisionId,
    previousRevisionId: null,
    createdAt,
    settings: source.settings,
    profiles,
    assets: {
      nodes: source.assets.nodes,
      templates: source.assets.templates,
      adapters: {
        momo: {
          path: momoAdapterPath,
          note: 'OpenWrt Momo',
          content: MOMO_ADAPTER_PRESET,
          updatedAt: createdAt,
        },
      },
      rulesets: source.assets.rulesets,
    },
    builds: source.builds,
    sync: { status: 'never', updatedAt: createdAt },
    ...(source.migration ? { migration: source.migration } : {}),
  });
}

export async function isWorkspaceV1(
  bucket: R2BucketPort,
  workspaceId: string,
): Promise<boolean> {
  return (await loadWorkspace(bucket, workspaceId))?.version === 1;
}

export async function upgradeWorkspaceV1(
  bucket: R2BucketPort,
  workspaceId: string,
  createdAt: string,
): Promise<WorkspaceV1UpgradeResult> {
  const loaded = await loadWorkspace(bucket, workspaceId);
  if (!loaded) return 'missing';
  if (loaded.version === 2) return 'current';

  const revisionId = crypto.randomUUID();
  const snapshot = convertSnapshot(loaded.legacy.snapshot, revisionId, createdAt);
  const body = JSON.stringify(snapshot);
  const contentHash = await sha256Hex(canonicalJson(snapshot));
  const revision = await bucket.put(
    r2ObjectKeys.revision(workspaceId, revisionId),
    body,
    {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: { workspaceId, revisionId, contentHash, createdAt },
    },
  );
  if (!revision) throw new WorkspaceRevisionCollisionError(revisionId);

  const nextHead = workspaceHeadSchema.parse({
    schemaVersion: 1,
    workspaceId,
    currentRevision: revisionId,
    previousRevision: null,
    updatedAt: createdAt,
    contentHash,
  });
  const updated = await bucket.put(
    r2ObjectKeys.head(workspaceId),
    canonicalJson(nextHead),
    {
      onlyIf: { etagMatches: loaded.legacy.headEtag },
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    },
  );
  if (!updated) {
    const latest = await loadWorkspace(bucket, workspaceId);
    if (latest?.version === 2) return 'current';
    const actualRevision = latest?.version === 1 ? latest.legacy.headRevision : 'missing';
    throw new WorkspaceConflictError(loaded.legacy.headRevision, actualRevision);
  }
  return 'upgraded';
}
