export type SyncEntityKind = 'configs' | 'nodes' | 'templates' | 'adapters' | 'rulesets';

const SAFE_ENTITY_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const SYNC_PATH = /^sing-sub\/(configs|nodes|templates|adapters|rulesets)\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,127})\.json$/;

export interface SyncEntityPath {
  kind: SyncEntityKind;
  entityId: string;
}

export function encodeSyncPath(kind: SyncEntityKind, entityId: string): string {
  if (!SAFE_ENTITY_ID.test(entityId)) throw new Error('Invalid sync entity ID');
  return `sing-sub/${kind}/${entityId}.json`;
}

export function parseSyncPath(path: string): SyncEntityPath | null {
  const match = SYNC_PATH.exec(path);
  return match ? { kind: match[1] as SyncEntityKind, entityId: match[2] } : null;
}
