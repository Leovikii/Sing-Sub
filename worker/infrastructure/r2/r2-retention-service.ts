import { buildJobSchema, workspaceHeadSchema, workspaceSnapshotSchema, type WorkspaceSnapshot } from '../../../shared';
import { r2ObjectKeys } from './r2-object-keys';
import { WorkspaceStorageCorruptError } from './r2-workspace-errors';
import type { R2BucketPort } from './r2-workspace-store';

const DEFAULT_ORPHAN_GRACE_SECONDS = 86400;

export interface R2RetentionPolicy {
  revisionLimit: number;
  artifactHistoryLimit: number;
  orphanGraceSeconds?: number;
}

export interface R2RetentionReport {
  deletedRevisions: number;
  deletedArtifacts: number;
  deletedJobs: number;
  skippedUnknown: number;
  dryRun: boolean;
}

export class RetentionHeadChangedError extends Error {
  constructor() {
    super('Workspace head changed during retention');
    this.name = 'RetentionHeadChangedError';
  }
}

interface ListedObject {
  key: string;
  size: number;
  uploaded: Date;
  customMetadata?: Record<string, string>;
}

export class R2RetentionService {
  constructor(
    private readonly bucket: R2BucketPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async pruneWorkspace(
    workspaceId: string,
    policy: R2RetentionPolicy,
    dryRun = false,
  ): Promise<R2RetentionReport> {
    this.validatePolicy(policy);
    const graceSeconds = policy.orphanGraceSeconds ?? DEFAULT_ORPHAN_GRACE_SECONDS;
    const cutoff = this.now().getTime() - graceSeconds * 1000;
    const initialHead = await this.readHead(workspaceId);
    const current = await this.readSnapshot(workspaceId, initialHead.document.currentRevision);
    const previous = initialHead.document.previousRevision
      ? await this.readSnapshot(workspaceId, initialHead.document.previousRevision)
      : null;

    const revisionObjects = await this.listAll(r2ObjectKeys.revisionPrefix(workspaceId));
    const artifactObjects = await this.listAll(r2ObjectKeys.artifactPrefix(workspaceId));
    const jobObjects = await this.listAll(r2ObjectKeys.jobPrefix(workspaceId));

    const revisionDeletes = this.planRevisionDeletes(initialHead.document, current, revisionObjects, policy, cutoff);
    const artifactPlan = this.planArtifactDeletes(workspaceId, current, previous, artifactObjects, policy, cutoff);
    const jobPlan = await this.planJobDeletes(workspaceId, current, jobObjects, cutoff);

    const latestHead = await this.readHead(workspaceId);
    if (latestHead.etag !== initialHead.etag) throw new RetentionHeadChangedError();

    if (!dryRun) {
      const keys = [...revisionDeletes, ...artifactPlan.keys, ...jobPlan.keys];
      if (keys.length) await this.bucket.delete(keys);
    }

    return {
      deletedRevisions: revisionDeletes.length,
      deletedArtifacts: artifactPlan.keys.length,
      deletedJobs: jobPlan.keys.length,
      skippedUnknown: artifactPlan.skippedUnknown + jobPlan.skippedUnknown,
      dryRun,
    };
  }

  private planRevisionDeletes(
    head: { currentRevision: string; previousRevision: string | null },
    current: WorkspaceSnapshot,
    objects: ListedObject[],
    policy: R2RetentionPolicy,
    cutoff: number,
  ): string[] {
    const ordered = [...objects].sort((left, right) => {
      const leftCreated = left.customMetadata?.createdAt || left.uploaded.toISOString();
      const rightCreated = right.customMetadata?.createdAt || right.uploaded.toISOString();
      return rightCreated.localeCompare(leftCreated);
    });
    const protectedRevisions = new Set([
      head.currentRevision,
      ...(head.previousRevision ? [head.previousRevision] : []),
      ...(current.sync.baseWorkspaceRevision ? [current.sync.baseWorkspaceRevision] : []),
      ...ordered.slice(0, policy.revisionLimit).map(object => object.customMetadata?.revisionId).filter(Boolean) as string[],
    ]);

    return ordered.filter(object => {
      const revisionId = object.customMetadata?.revisionId;
      if (!revisionId) throw new WorkspaceStorageCorruptError('Revision retention metadata is incomplete');
      return !protectedRevisions.has(revisionId) && object.uploaded.getTime() <= cutoff;
    }).map(object => object.key);
  }

  private planArtifactDeletes(
    workspaceId: string,
    current: WorkspaceSnapshot,
    previous: WorkspaceSnapshot | null,
    objects: ListedObject[],
    policy: R2RetentionPolicy,
    cutoff: number,
  ): { keys: string[]; skippedUnknown: number } {
    const referenced = new Set<string>();
    for (const snapshot of [current, previous]) {
      if (!snapshot) continue;
      for (const build of Object.values(snapshot.builds)) {
        const artifact = build.activeArtifact;
        if (artifact) referenced.add(r2ObjectKeys.srsArtifact(workspaceId, artifact.rulesetId, artifact.sourceHash));
      }
    }

    const groups = new Map<string, ListedObject[]>();
    let skippedUnknown = 0;
    for (const object of objects) {
      const rulesetId = object.customMetadata?.rulesetId;
      if (!rulesetId) {
        skippedUnknown += 1;
        continue;
      }
      const group = groups.get(rulesetId) || [];
      group.push(object);
      groups.set(rulesetId, group);
    }

    const keys: string[] = [];
    for (const group of groups.values()) {
      const historical = group
        .filter(object => !referenced.has(object.key))
        .sort((left, right) => right.uploaded.getTime() - left.uploaded.getTime());
      keys.push(...historical.slice(policy.artifactHistoryLimit)
        .filter(object => object.uploaded.getTime() <= cutoff)
        .map(object => object.key));
    }
    return { keys, skippedUnknown };
  }

  private async planJobDeletes(
    workspaceId: string,
    current: WorkspaceSnapshot,
    objects: ListedObject[],
    cutoff: number,
  ): Promise<{ keys: string[]; skippedUnknown: number }> {
    const referencedJobs = new Set(Object.values(current.builds).map(build => build.jobId));
    const keys: string[] = [];
    let skippedUnknown = 0;
    for (const object of objects) {
      const stored = await this.bucket.get(object.key);
      if (!stored) continue;
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(await stored.text());
      } catch {
        skippedUnknown += 1;
        continue;
      }
      const parsed = buildJobSchema.safeParse(parsedJson);
      if (!parsed.success || parsed.data.workspaceId !== workspaceId) {
        skippedUnknown += 1;
        continue;
      }
      if (!referencedJobs.has(parsed.data.jobId) && Date.parse(parsed.data.updatedAt) <= cutoff) keys.push(object.key);
    }
    return { keys, skippedUnknown };
  }

  private async readHead(workspaceId: string) {
    const object = await this.bucket.get(r2ObjectKeys.head(workspaceId));
    if (!object) throw new WorkspaceStorageCorruptError('Workspace head is missing during retention');
    let json: unknown;
    try {
      json = JSON.parse(await object.text());
    } catch {
      throw new WorkspaceStorageCorruptError('Workspace head is invalid during retention');
    }
    const parsed = workspaceHeadSchema.safeParse(json);
    if (!parsed.success || parsed.data.workspaceId !== workspaceId) {
      throw new WorkspaceStorageCorruptError('Workspace head schema is invalid during retention');
    }
    return { document: parsed.data, etag: object.etag };
  }

  private async readSnapshot(workspaceId: string, revisionId: string): Promise<WorkspaceSnapshot> {
    const object = await this.bucket.get(r2ObjectKeys.revision(workspaceId, revisionId));
    if (!object) throw new WorkspaceStorageCorruptError('Protected workspace revision is missing');
    let json: unknown;
    try {
      json = JSON.parse(await object.text());
    } catch {
      throw new WorkspaceStorageCorruptError('Protected workspace revision is invalid JSON');
    }
    const parsed = workspaceSnapshotSchema.safeParse(json);
    if (!parsed.success || parsed.data.workspaceId !== workspaceId || parsed.data.revisionId !== revisionId) {
      throw new WorkspaceStorageCorruptError('Protected workspace revision schema is invalid');
    }
    return parsed.data;
  }

  private async listAll(prefix: string): Promise<ListedObject[]> {
    const objects: ListedObject[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, limit: 1000, cursor, include: ['customMetadata'] });
      objects.push(...page.objects);
      if (page.truncated && !page.cursor) throw new WorkspaceStorageCorruptError('R2 list cursor is missing');
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return objects;
  }

  private validatePolicy(policy: R2RetentionPolicy): void {
    const grace = policy.orphanGraceSeconds ?? DEFAULT_ORPHAN_GRACE_SECONDS;
    if (!Number.isInteger(policy.revisionLimit) || policy.revisionLimit < 1 ||
        !Number.isInteger(policy.artifactHistoryLimit) || policy.artifactHistoryLimit < 0 ||
        !Number.isInteger(grace) || grace < DEFAULT_ORPHAN_GRACE_SECONDS) {
      throw new Error('Invalid R2 retention policy');
    }
  }
}
