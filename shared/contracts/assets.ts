import type { EntityMetadata } from '../schemas/metadata.schema';
export interface AssetSummary {
  order?: number;
  path: string;
  note: string;
  updatedAt?: string;
}

export interface AssetSnapshot {
  nodes: AssetSummary[];
  templates: AssetSummary[];
  rulesets: AssetSummary[];
}

export interface FileContent {
  metadata?: EntityMetadata;
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
