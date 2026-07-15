import type { BuildJob } from '../../../shared';

export interface BuildJobRecord {
  job: BuildJob;
  version: string;
}

export interface BuildJobStore {
  read(workspaceId: string, jobId: string): Promise<BuildJobRecord | null>;
  create(job: BuildJob): Promise<BuildJobRecord>;
  update(job: BuildJob, expectedVersion: string): Promise<BuildJobRecord>;
}
