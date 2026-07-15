import {
  syncManifestSchema,
  type SyncManifest,
  type WorkspaceSnapshot,
} from '../../../shared';
import type { SyncFile } from '../ports/sync-gateway';
import { canonicalJson, canonicalPrettyJson, sha256Hex } from '../../domain/revisions/canonical-json';
import { encodeSyncPath } from '../../domain/sync/sync-path';

export const SYNC_MANIFEST_PATH = 'sing-sub/manifest.json';

export interface WorkspaceSyncExport {
  businessFiles: SyncFile[];
  files: SyncFile[];
  contentHash: string;
  manifest: SyncManifest;
  manifestHash: string;
}

export interface SyncBusinessSource {
  profiles: WorkspaceSnapshot['profiles'];
  assets: WorkspaceSnapshot['assets'];
}

export async function hashSyncFiles(files: SyncFile[]): Promise<string> {
  const descriptors = [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(file => ({ path: file.path, contentHash: file.contentHash }));
  return sha256Hex(canonicalJson(descriptors));
}

export async function exportSyncBusinessFiles(source: SyncBusinessSource): Promise<{
  files: SyncFile[];
  contentHash: string;
}> {
  const entries: { path: string; content: string }[] = [];
  for (const profile of source.profiles) {
    entries.push({ path: encodeSyncPath('configs', profile.name), content: canonicalPrettyJson(profile) });
  }
  for (const kind of ['nodes', 'templates', 'adapters', 'rulesets'] as const) {
    for (const [entityId, asset] of Object.entries(source.assets[kind])) {
      entries.push({ path: encodeSyncPath(kind, entityId), content: canonicalPrettyJson(asset.content) });
    }
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));

  const businessFiles: SyncFile[] = [];
  for (const entry of entries) {
    businessFiles.push({
      ...entry,
      contentHash: await sha256Hex(entry.content),
    });
  }
  return { files: businessFiles, contentHash: await hashSyncFiles(businessFiles) };
}

export async function exportWorkspaceForSync(
  snapshot: WorkspaceSnapshot,
  options: { baseRemoteRevision: string | null; exportedAt: string },
): Promise<WorkspaceSyncExport> {
  const business = await exportSyncBusinessFiles(snapshot);
  const manifest = syncManifestSchema.parse({
    schemaVersion: 2,
    format: 'sing-sub-editable-sync',
    workspaceId: snapshot.workspaceId,
    workspaceRevision: snapshot.revisionId,
    baseRemoteRevision: options.baseRemoteRevision,
    exportedAt: options.exportedAt,
    contentHash: business.contentHash,
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
    manifest,
    manifestHash,
  };
}
