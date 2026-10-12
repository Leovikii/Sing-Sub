// Offline conversion only. This module is never imported by the Worker or browser.
import { z } from 'zod';
import { jsonAssetSchema, profileSchema, workspaceHeadSchema, workspaceSnapshotSchema } from '../shared';
import { canonicalJson, sha256Hex } from '../worker/domain/revisions/canonical-json';
import { exportWorkspaceForSync } from '../worker/application/sync/export-workspace';
import { r2ObjectKeys } from '../worker/infrastructure/r2/r2-object-keys';

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
  const sync = await exportWorkspaceForSync(snapshot, { baseRemoteRevision: null, exportedAt: snapshot.createdAt });
  return {
    snapshot, previousSnapshot, head, sync,
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
