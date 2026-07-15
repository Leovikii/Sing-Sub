import type { JsonAsset, Profile } from '../../../shared';
import type { LegacyGithubSource } from '../ports/legacy-source-reader';

export interface GithubImportSettings {
  pat: string;
  owner: string;
  repo: string;
  userLogin: string;
  userAvatar: string;
  defaultBranch: string;
}

export interface NormalizedLegacyWorkspace {
  source: LegacyGithubSource;
  settings: GithubImportSettings;
  profiles: Profile[];
  assets: {
    nodes: Record<string, JsonAsset>;
    templates: Record<string, JsonAsset>;
    patches: Record<string, JsonAsset>;
    rulesets: Record<string, JsonAsset>;
  };
}
