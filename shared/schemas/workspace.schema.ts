import { z } from 'zod';
import { profileDefinitionSchema, profileSchema } from './profile.schema';

import { workspaceMetadataSchema, type WorkspaceMetadata } from './metadata.schema';

const opaqueIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
const entityIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const jsonAssetSchema = z.object({
  path: z.string().min(1),
  note: z.string().optional(),
  content: z.json(),
  updatedAt: z.iso.datetime().optional(),
}).strict();

export const srsArtifactPointerSchema = z.object({
  rulesetId: entityIdSchema,
  sourceHash: sha256Schema,
  contentHash: sha256Schema,
  size: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
}).strict();

export const buildSummarySchema = z.object({
  jobId: opaqueIdSchema,
  rulesetId: entityIdSchema,
  sourceHash: sha256Schema,
  compilerVersion: z.string().min(1),
  status: z.enum(['none', 'pending', 'dispatching', 'compiling', 'ready', 'failed', 'superseded']),
  activeArtifact: srsArtifactPointerSchema.optional(),
  updatedAt: z.iso.datetime(),
}).strict();

export const syncMetadataSchema = z.object({
  status: z.enum(['never', 'synced', 'local-ahead', 'remote-ahead', 'conflict', 'running', 'failed']),
  baseWorkspaceRevision: opaqueIdSchema.optional(),
  baseRemoteRevision: z.string().optional(),
  baseContentHash: sha256Schema.optional(),
  baseWorkspaceContentHash: sha256Schema.optional(),
  baseFormatVersion: z.union([z.literal(2), z.literal(3)]).optional(),
  baseRepository: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).optional(),
  updatedAt: z.iso.datetime().optional(),
}).strict().superRefine((sync, context) => {
  const base = [
    sync.baseWorkspaceRevision,
    sync.baseRemoteRevision,
    sync.baseContentHash,
    sync.baseRepository,
  ];
  if (base.some(Boolean) && !base.every(Boolean)) {
    context.addIssue({ code: 'custom', path: ['baseContentHash'], message: 'Sync base fields must be complete' });
  }
});

export const workspaceSettingsSchema = z.object({
  owner: z.string().min(1).optional(),
  repo: z.string().min(1).optional(),
  userLogin: z.string().min(1),
  userAvatar: z.string(),
  defaultBranch: z.string().min(1).optional(),
  authVersion: z.number().int().nonnegative(),
  tokenVersion: z.number().int().nonnegative(),
}).strict().superRefine((settings, context) => {
  if (Boolean(settings.owner) !== Boolean(settings.repo)) {
    context.addIssue({
      code: 'custom',
      path: ['owner'],
      message: 'GitHub owner and repository must be configured together',
    });
  }
});

export const migrationMetadataSchema = z.object({
  source: z.enum(['github-kv-legacy', 'github-import']),
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1),
  commitSha: z.string().min(1),
  migratedAt: z.iso.datetime(),
}).strict();

const workspaceAssetsSchema = z.object({
  nodes: z.record(entityIdSchema, jsonAssetSchema),
  templates: z.record(entityIdSchema, jsonAssetSchema),
  rulesets: z.record(entityIdSchema, jsonAssetSchema),
}).strict();

export const legacyWorkspaceSnapshotSchema = z.object({
  schemaVersion: z.literal(3),
  workspaceId: opaqueIdSchema,
  revisionId: opaqueIdSchema,
  previousRevisionId: opaqueIdSchema.nullable(),
  createdAt: z.iso.datetime(),
  settings: workspaceSettingsSchema,
  profiles: z.array(profileSchema),
  assets: workspaceAssetsSchema,
  builds: z.record(entityIdSchema, buildSummarySchema),
  sync: syncMetadataSchema,
  migration: migrationMetadataSchema.optional(),
}).strict();


export const persistedWorkspaceSnapshotSchema = legacyWorkspaceSnapshotSchema.extend({
  schemaVersion: z.literal(4),
  profiles: z.array(profileDefinitionSchema),
  assets: z.object({
    nodes: z.record(entityIdSchema, jsonAssetSchema.omit({ note: true, updatedAt: true })),
    templates: z.record(entityIdSchema, jsonAssetSchema.omit({ note: true, updatedAt: true })),
    rulesets: z.record(entityIdSchema, jsonAssetSchema.omit({ note: true, updatedAt: true })),
  }).strict(),
  metadata: workspaceMetadataSchema,
}).superRefine((snapshot, context) => {
  const paths = new Set<string>();
  const add = (path: string) => {
    if (paths.has(path.toLowerCase()) || !Object.hasOwn(snapshot.metadata.entities, path)) {
      context.addIssue({ code: 'custom', path: ['metadata', 'entities', path], message: 'Duplicate entity or missing metadata record' });
    }
    paths.add(path.toLowerCase());
  };
  const managed = (value: unknown): boolean => Boolean(value) && typeof value === 'object' &&
    !Array.isArray(value) && ('note' in value! || '_sing_sub' in value!);
  for (const profile of snapshot.profiles) add(`sing-sub/configs/${profile.name}.json`);
  for (const kind of ['nodes', 'templates', 'rulesets'] as const) {
    for (const [id, asset] of Object.entries(snapshot.assets[kind])) {
      const expected = `sing-sub/${kind}/${id}.json`;
      add(expected);
      const root = asset.content;
      const object = root && typeof root === 'object' && !Array.isArray(root) ? root : undefined;
      const children = Array.isArray(root) ? root : object ?
        [...(Array.isArray(object.inbounds) ? object.inbounds : []), ...(Array.isArray(object.outbounds) ? object.outbounds : [])] : [];
      if (asset.path !== expected || managed(root) || children.some(managed) ||
          (kind === 'rulesets' && (!object || !Array.isArray(object.rules) ||
            ![1, 2, 3, 4].includes(object.version as number) || Object.keys(object).some(key => !['version', 'rules'].includes(key))))) {
        context.addIssue({ code: 'custom', path: ['assets', kind, id], message: 'Invalid pure asset or path identity' });
      }
    }
  }
  for (const path of Object.keys(snapshot.metadata.entities)) if (!paths.has(path.toLowerCase())) {
    context.addIssue({ code: 'custom', path: ['metadata', 'entities', path], message: 'Orphan snapshot metadata' });
  }
});
export const workspaceSnapshotSchema = z.union([legacyWorkspaceSnapshotSchema, persistedWorkspaceSnapshotSchema]);
export type PersistedWorkspaceSnapshot = z.infer<typeof persistedWorkspaceSnapshotSchema>;
// In-memory form projections are never serialized directly to storage.
export type WorkspaceSnapshot = Omit<z.infer<typeof legacyWorkspaceSnapshotSchema>, 'schemaVersion'> & {
  schemaVersion: 3 | 4; metadata?: WorkspaceMetadata;
};

export const workspaceHeadSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: opaqueIdSchema,
  currentRevision: opaqueIdSchema,
  previousRevision: opaqueIdSchema.nullable(),
  updatedAt: z.iso.datetime(),
  contentHash: sha256Schema,
}).strict();

export const privateCredentialsSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: opaqueIdSchema,
  github: z.object({
    pat: z.string().min(1),
    owner: z.string().min(1),
    repo: z.string().min(1),
    defaultBranch: z.string().min(1),
  }).strict().optional(),
  srsCompiler: z.object({
    enabled: z.boolean(),
    status: z.enum(['disabled', 'provisioning', 'ready', 'error']),
    workflowVersion: z.literal(1),
    workflowHash: sha256Schema.optional(),
    errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(),
    updatedAt: z.iso.datetime(),
  }).strict().optional(),
  updatedAt: z.iso.datetime(),
}).strict();

export const updateSrsCompilerRequestSchema = z.object({
  enabled: z.boolean(),
}).strict();

export const buildJobSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: opaqueIdSchema,
  workspaceId: opaqueIdSchema,
  rulesetId: entityIdSchema,
  sourceRevision: opaqueIdSchema,
  sourceHash: sha256Schema,
  compilerVersion: z.string().min(1),
  status: z.enum(['pending', 'dispatching', 'compiling', 'ready', 'failed', 'superseded']),
  attempts: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export type JsonAsset = z.infer<typeof jsonAssetSchema>;
export type SrsArtifactPointer = z.infer<typeof srsArtifactPointerSchema>;
export type BuildSummary = z.infer<typeof buildSummarySchema>;
export type SyncMetadata = z.infer<typeof syncMetadataSchema>;
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

export type WorkspaceHeadDocument = z.infer<typeof workspaceHeadSchema>;
export type PrivateCredentials = z.infer<typeof privateCredentialsSchema>;
export type SrsCompilerPrivateState = NonNullable<PrivateCredentials['srsCompiler']>;
export type BuildJob = z.infer<typeof buildJobSchema>;
