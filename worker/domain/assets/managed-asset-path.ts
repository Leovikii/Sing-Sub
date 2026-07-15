export type WorkspaceAssetKind = 'nodes' | 'templates' | 'patches' | 'rulesets';

const MANAGED_ASSET_PATH = /^sing-sub\/(nodes|templates|patches|rulesets)\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,127})\.json$/;

export interface ManagedAssetPath {
  kind: WorkspaceAssetKind;
  entityId: string;
}

export function parseManagedAssetPath(path: string): ManagedAssetPath | null {
  const match = MANAGED_ASSET_PATH.exec(path);
  return match ? { kind: match[1] as WorkspaceAssetKind, entityId: match[2] } : null;
}
