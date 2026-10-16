import { separateWorkspace } from '../../lib/workspace-metadata';
import {
  syncManifestSchema,
  type SyncManifest,
  type WorkspaceSnapshot,
} from '../../../shared';
import type { SyncFile } from '../ports/sync-gateway';
import {
  canonicalJson,
  canonicalPrettyJson,
  orderedPrettyJson,
  sha256Hex,
} from '../../domain/revisions/canonical-json';
import { encodeSyncPath } from '../../domain/sync/sync-path';

export const SYNC_METADATA_PATH = 'sing-sub/metadata.json';
export const SYNC_MANIFEST_PATH = 'sing-sub/manifest.json';

export interface WorkspaceSyncExport {
  businessFiles: SyncFile[];
  files: SyncFile[];
  contentHash: string;
  serializedHash: string;
  manifest: SyncManifest;
  manifestHash: string;
}

export interface SyncBusinessSource {
  profiles: WorkspaceSnapshot['profiles'];
  assets: WorkspaceSnapshot['assets'];
  metadata?: WorkspaceSnapshot['metadata'];
}

export async function hashSyncFiles(files: SyncFile[]): Promise<string> {
  const descriptors = [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(file => ({ path: file.path, contentHash: file.contentHash }));
  return sha256Hex(canonicalJson(descriptors));
}

export async function exportSyncBusinessFiles(source: SyncBusinessSource, formatVersion: 2 | 3 = 3): Promise<{
  files: SyncFile[];
  contentHash: string;
  serializedHash: string;
}> {
  const pure = formatVersion === 3 ? separateWorkspace(source) : source;
  const entries: { path: string; value: unknown }[] = [];
  for (const profile of pure.profiles) {
    entries.push({ path: encodeSyncPath('configs', profile.name), value: profile });
  }
  for (const kind of ['nodes', 'templates', 'rulesets'] as const) {
    for (const [entityId, asset] of Object.entries(pure.assets[kind])) {
      entries.push({ path: encodeSyncPath(kind, entityId), value: asset.content });
    }
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));

  const businessFiles: SyncFile[] = [];
  const semanticFiles: SyncFile[] = [];
  for (const entry of entries) {
    const content = orderedPrettyJson(entry.value);
    businessFiles.push({
      path: entry.path,
      content,
      contentHash: await sha256Hex(content),
    });
    semanticFiles.push({
      path: entry.path,
      content: '',
      contentHash: await sha256Hex(canonicalPrettyJson(entry.value)),
    });
  }
  if (formatVersion === 3) {
    const entities: Record<string, unknown> = {};
    for (const file of businessFiles) entities[file.path] = { ...pure.metadata?.entities[file.path], contentHash: file.contentHash };
    const value = { schemaVersion: 1, entities };
    const semanticEntities = Object.fromEntries(Object.entries(entities).map(([path, metadata]) => [path, { ...(metadata as object), contentHash: semanticFiles.find(file => file.path === path)!.contentHash }]));
    const content = canonicalPrettyJson(value);
    businessFiles.push({ path: SYNC_METADATA_PATH, content, contentHash: await sha256Hex(content) });
    semanticFiles.push({ path: SYNC_METADATA_PATH, content: '', contentHash: await sha256Hex(canonicalPrettyJson({ schemaVersion: 1, entities: semanticEntities })) });
    businessFiles.sort((a, b) => a.path.localeCompare(b.path));
  }
  return {
    files: businessFiles,
    contentHash: await hashSyncFiles(semanticFiles),
    serializedHash: await hashSyncFiles(businessFiles),
  };
}

export async function exportWorkspaceForSync(
  snapshot: WorkspaceSnapshot,
  options: { baseRemoteRevision: string | null; exportedAt: string },
): Promise<WorkspaceSyncExport> {
  const business = await exportSyncBusinessFiles(snapshot);
  const manifest = syncManifestSchema.parse({
    schemaVersion: 3,
    format: 'sing-sub-editable-sync',
    workspaceId: snapshot.workspaceId,
    workspaceRevision: snapshot.revisionId,
    baseRemoteRevision: options.baseRemoteRevision,
    exportedAt: options.exportedAt,
    contentHash: business.serializedHash,
    files: business.files.map(file => ({
      path: file.path,
      contentHash: file.contentHash,
      size: new TextEncoder().encode(file.content).byteLength,
    })),
  });
  const manifestContent = canonicalPrettyJson(manifest);
  const manifestHash = await sha256Hex(manifestContent);
  return {
    businessFiles: business.files,
    files: [
      ...business.files,
      { path: SYNC_MANIFEST_PATH, content: manifestContent, contentHash: manifestHash },
    ],
    contentHash: business.contentHash,
    serializedHash: business.serializedHash,
    manifest,
    manifestHash,
  };
}
