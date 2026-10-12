import type { R2BucketPort } from '../r2-workspace-store';
import type { WorkspaceHeadDocument } from '../../../../shared';
import { WorkspaceStorageCorruptError, WorkspaceRevisionCollisionError } from '../r2-workspace-errors';
// One-shot v2 -> v3 migration. Business readers remain v3-only; remove this module
// and the current-read hook when upgrades from v2 are no longer supported.
import { z } from 'zod';
import { jsonAssetSchema, profileSchema, workspaceHeadSchema, workspaceSnapshotSchema } from '../../../../shared';
import { canonicalJson, sha256Hex } from '../../../domain/revisions/canonical-json';
import { r2ObjectKeys } from '../r2-object-keys';

const oldSnapshotSchema = workspaceSnapshotSchema.extend({
  schemaVersion: z.literal(2),
  profiles: z.array(profileSchema.extend({ adapterUrl: z.string().optional() })),
  assets: workspaceSnapshotSchema.shape.assets.extend({ adapters: z.record(z.string(), jsonAssetSchema) }),
});

export async function prepareWorkspaceUpgrade(headInput: unknown, snapshotInput: unknown) {
  const oldHead = workspaceHeadSchema.parse(headInput);
  oldSnapshotSchema.parse(snapshotInput);
  // Validate without rebuilding objects, preserving source field and array order.
  const source = structuredClone(snapshotInput) as z.infer<typeof oldSnapshotSchema>;
  if (oldHead.workspaceId !== source.workspaceId || oldHead.currentRevision !== source.revisionId ||
      oldHead.contentHash !== await sha256Hex(canonicalJson(source))) {
    throw new Error('Head and source revision do not match; download a consistent backup');
  }
  const removedProfiles = source.profiles.filter(profile => Boolean(profile.adapterUrl)).map(profile => profile.name);
  const removedAdapters = Object.keys(source.assets.adapters);
  const profiles = source.profiles.filter(profile => !profile.adapterUrl).map(profile => {
    delete profile.adapterUrl;
    return profile;
  });
  const { nodes, templates, rulesets } = source.assets;
  const previousSnapshot = {
    ...source, schemaVersion: 3 as const, revisionId: crypto.randomUUID(), previousRevisionId: source.revisionId,
    createdAt: new Date().toISOString(), profiles, assets: { nodes, templates, rulesets }, sync: { status: 'never' as const },
  };
  workspaceSnapshotSchema.parse(previousSnapshot);
  // Retention reads both current and previous. Both must be v3 without a legacy reader.
  const snapshot = { ...previousSnapshot, revisionId: crypto.randomUUID(), previousRevisionId: previousSnapshot.revisionId };
  const previousContentHash = await sha256Hex(canonicalJson(previousSnapshot));
  const contentHash = await sha256Hex(canonicalJson(snapshot));
  const head = workspaceHeadSchema.parse({
    schemaVersion: 1, workspaceId: snapshot.workspaceId, currentRevision: snapshot.revisionId,
    previousRevision: previousSnapshot.revisionId, updatedAt: snapshot.createdAt, contentHash,
  });
  return {
    snapshot, previousSnapshot, head,
    report: {
      fromRevision: source.revisionId, toRevision: snapshot.revisionId,
      removedProfiles, removedAdapters, retainedProfiles: profiles.map(profile => profile.name),
      previousRevisionKey: r2ObjectKeys.revision(snapshot.workspaceId, previousSnapshot.revisionId),
      previousRevisionMetadata: { workspaceId: snapshot.workspaceId, revisionId: previousSnapshot.revisionId, contentHash: previousContentHash, createdAt: snapshot.createdAt },
      revisionKey: r2ObjectKeys.revision(snapshot.workspaceId, snapshot.revisionId),
      headKey: r2ObjectKeys.head(snapshot.workspaceId),
      revisionMetadata: { workspaceId: snapshot.workspaceId, revisionId: snapshot.revisionId, contentHash, createdAt: snapshot.createdAt },
      syncReset: true,
    },
  };
}


export async function migrateWorkspaceV3(
  bucket: R2BucketPort, head: WorkspaceHeadDocument, etag: string, source: unknown,
): Promise<void> {
  let result: Awaited<ReturnType<typeof prepareWorkspaceUpgrade>>;
  try {
    result = await prepareWorkspaceUpgrade(head, source);
  } catch {
    throw new WorkspaceStorageCorruptError('Legacy workspace failed upgrade validation');
  }
  // Keep an immutable recovery copy outside normal revision retention.
  const backupKey = r2ObjectKeys.workspaceV3Backup(head.workspaceId, head.currentRevision);
  const backupBody = JSON.stringify({ head, snapshot: source });
  const backup = await bucket.put(backupKey, backupBody, {
    onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' },
  });
  if (!backup) {
    const existing = await bucket.get(backupKey);
    if (!existing || await existing.text() !== backupBody) {
      throw new WorkspaceStorageCorruptError('Workspace upgrade backup does not match');
    }
  }
  for (const [snapshot, key, metadata] of [
    [result.previousSnapshot, result.report.previousRevisionKey, result.report.previousRevisionMetadata],
    [result.snapshot, result.report.revisionKey, result.report.revisionMetadata],
  ] as const) {
    const created = await bucket.put(key, JSON.stringify(snapshot), {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json' }, customMetadata: metadata,
    });
    if (!created) throw new WorkspaceRevisionCollisionError(snapshot.revisionId);
  }
  // A loser must reread the winner (or a newer v2 save), never overwrite it.
  await bucket.put(r2ObjectKeys.head(head.workspaceId), canonicalJson(result.head), {
    onlyIf: { etagMatches: etag }, httpMetadata: { contentType: 'application/json' },
  });
}
