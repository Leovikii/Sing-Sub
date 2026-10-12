// Optional offline inspection; production migration does not generate GitHub files.
import { prepareWorkspaceUpgrade as convert } from '../worker/infrastructure/r2/migrations/workspace-v3';
import { exportWorkspaceForSync } from '../worker/application/sync/export-workspace';

export async function prepareWorkspaceUpgrade(head: unknown, snapshot: unknown) {
  const result = await convert(head, snapshot);
  const sync = await exportWorkspaceForSync(result.snapshot, {
    baseRemoteRevision: null, exportedAt: result.snapshot.createdAt,
  });
  return { ...result, sync };
}
