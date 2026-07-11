export const MANAGED_ASSET_PATH = /^sing-sub\/(nodes|templates|patches|rulesets)\/([a-zA-Z0-9][a-zA-Z0-9._-]*)\.json$/;
export const TEMPLATE_PATH = /^sing-sub\/templates\/([a-zA-Z0-9][a-zA-Z0-9._-]*)\.json$/;

export function isManagedAssetPath(path: string): boolean {
  return MANAGED_ASSET_PATH.test(path);
}

export function isRulesetPath(path: string): boolean {
  return path.startsWith('sing-sub/rulesets/');
}
