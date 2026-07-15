export interface RuleBucket {
  domain: string[];
  domain_suffix: string[];
  domain_keyword: string[];
  domain_regex: string[];
}

export interface RulesetSource {
  url: string;
  interval_hours: number;
  last_updated?: string;
}

export interface RulesetMetadata {
  note?: string;
  manual: RuleBucket;
  sources: RulesetSource[];
}

export interface RulesetBuildStatusResult {
  revision: string;
  rulesetId: string;
  status: import('./workspace').SrsBuildStatus;
  compilerAvailable: boolean;
  formats: {
    source: true;
    binary: boolean;
  };
  build: import('../schemas/workspace.schema').BuildSummary | null;
}

export interface SrsCompilerStatusResult {
  connected: boolean;
  repository?: string;
  defaultBranch?: string;
  enabled: boolean;
  status: 'disabled' | 'provisioning' | 'ready' | 'error';
  workflowVersion: 1;
  workflowHash?: string;
  errorCode?: string;
  updatedAt?: string;
  reconcile?: {
    revision: string;
    createdJobs: number;
    dispatchedJobs: number;
  };
}
