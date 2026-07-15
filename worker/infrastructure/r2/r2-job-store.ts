import { buildJobSchema, type BuildJob } from '../../../shared';
import { WorkspaceConflictError } from '../../application/errors/workspace-conflict';
import type { BuildJobRecord, BuildJobStore } from '../../application/ports/build-job-store';
import { canonicalJson } from '../../domain/revisions/canonical-json';
import { r2ObjectKeys } from './r2-object-keys';
import { WorkspaceStorageCorruptError } from './r2-workspace-errors';
import type { R2BucketPort } from './r2-workspace-store';

export class R2JobStore implements BuildJobStore {
  constructor(private readonly bucket: R2BucketPort) {}

  async read(workspaceId: string, jobId: string): Promise<BuildJobRecord | null> {
    const object = await this.bucket.get(r2ObjectKeys.job(workspaceId, jobId));
    if (!object) return null;
    let document: unknown;
    try {
      document = JSON.parse(await object.text());
    } catch {
      throw new WorkspaceStorageCorruptError('Build job is not valid JSON');
    }
    const parsed = buildJobSchema.safeParse(document);
    if (!parsed.success || parsed.data.workspaceId !== workspaceId || parsed.data.jobId !== jobId) {
      throw new WorkspaceStorageCorruptError('Build job schema or identity is invalid');
    }
    return { job: parsed.data, version: object.etag };
  }

  async create(job: BuildJob): Promise<BuildJobRecord> {
    const parsed = buildJobSchema.parse(job);
    const key = r2ObjectKeys.job(parsed.workspaceId, parsed.jobId);
    const created = await this.bucket.put(key, canonicalJson(parsed), {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
    if (created) return { job: parsed, version: created.etag };

    const existing = await this.read(parsed.workspaceId, parsed.jobId);
    if (!existing || existing.job.rulesetId !== parsed.rulesetId ||
        existing.job.sourceHash !== parsed.sourceHash ||
        existing.job.sourceRevision !== parsed.sourceRevision ||
        existing.job.compilerVersion !== parsed.compilerVersion) {
      throw new WorkspaceConflictError('deterministic-job', existing?.version || 'missing');
    }
    return existing;
  }

  async update(job: BuildJob, expectedVersion: string): Promise<BuildJobRecord> {
    const parsed = buildJobSchema.parse(job);
    const updated = await this.bucket.put(
      r2ObjectKeys.job(parsed.workspaceId, parsed.jobId),
      canonicalJson(parsed),
      { onlyIf: { etagMatches: expectedVersion }, httpMetadata: { contentType: 'application/json; charset=utf-8' } },
    );
    if (!updated) {
      const current = await this.read(parsed.workspaceId, parsed.jobId);
      throw new WorkspaceConflictError(expectedVersion, current?.version || 'missing');
    }
    return { job: parsed, version: updated.etag };
  }
}
