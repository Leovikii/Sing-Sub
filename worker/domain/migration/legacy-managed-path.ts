export type LegacyManagedKind = 'configs' | 'nodes' | 'templates' | 'adapters' | 'rulesets';

const MANAGED_LEGACY_PATH = /^sing-sub\/(configs|nodes|templates|adapters|rulesets)\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,127})\.json$/;

export interface LegacyManagedPath {
  kind: LegacyManagedKind;
  entityId: string;
}

export function parseLegacyManagedPath(path: string): LegacyManagedPath | null {
  const match = MANAGED_LEGACY_PATH.exec(path);
  return match ? { kind: match[1] as LegacyManagedKind, entityId: match[2] } : null;
}
