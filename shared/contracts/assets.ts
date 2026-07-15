export interface AssetSummary {
  path: string;
  note: string;
}

export interface AssetSnapshot {
  nodes: AssetSummary[];
  templates: AssetSummary[];
  patches: AssetSummary[];
  rulesets: AssetSummary[];
}

export interface FileContent {
  content: string;
  sha: string;
}

export type { PutFileRequest } from '../schemas/asset.schema';

export interface PutFileResult {
  success: boolean;
  revision: string;
  content?: string;
  warning?: string;
}
