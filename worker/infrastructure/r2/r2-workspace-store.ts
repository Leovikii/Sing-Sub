import type { R2Bucket, R2PutOptions } from '@cloudflare/workers-types';
import {
  workspaceHeadSchema,
  workspaceSnapshotSchema,
  type WorkspaceHeadDocument,
  type WorkspaceSnapshot,
} from '../../../shared';
import { WorkspaceConflictError } from '../../application/errors/workspace-conflict';
import type {
  CreateWorkspaceCommand,
  PublishWorkspaceCommand,
  PublishWorkspaceResult,
  WorkspaceRead,
  WorkspaceStore,
} from '../../application/ports/workspace-store';
import { canonicalJson, sha256Hex } from '../../domain/revisions/canonical-json';
import { r2ObjectKeys } from './r2-object-keys';
import {
  WorkspaceAlreadyExistsError,
  WorkspaceNotFoundError,
  WorkspaceRevisionCollisionError,
  WorkspaceRevisionNotFoundError,
  WorkspaceStorageCorruptError,
} from './r2-workspace-errors';

export interface R2StoredObject {
  etag: string;
  size?: number;
  customMetadata?: Record<string, string>;
}

export interface R2BodyObject extends R2StoredObject {
  text(): Promise<string>;
  bytes(): Promise<Uint8Array>;
}

export interface R2BucketPort {
  get(key: string): Promise<R2BodyObject | null>;
  put(key: string, value: string | Uint8Array, options?: R2PutOptions): Promise<R2StoredObject | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string; include?: ['customMetadata'] }): Promise<{
    objects: Array<{
      key: string;
      size: number;
      uploaded: Date;
      customMetadata?: Record<string, string>;
    }>;
    truncated?: boolean;
    cursor?: string;
  }>;
}

interface LoadedHead {
  document: WorkspaceHeadDocument;
  etag: string;
}

export interface WorkspaceRevisionSummary {
  revisionId: string;
  createdAt: string;
  contentHash: string;
  size: number;
}

export interface RestoreWorkspaceCommand {
  workspaceId: string;
  targetRevision: string;
  newRevision: string;
  expectedRevision: string;
  createdAt: string;
}

export class R2WorkspaceStore implements WorkspaceStore<WorkspaceSnapshot> {
  constructor(private readonly bucket: R2BucketPort) {}

  async create(command: CreateWorkspaceCommand<WorkspaceSnapshot>): Promise<PublishWorkspaceResult> {
    const snapshot = this.validateSnapshot(command.workspaceId, command.snapshot, null);
    const { body, hash } = await this.serializeSnapshot(snapshot);
    await this.putImmutableRevision(snapshot, body, hash);

    const head = this.createHead(snapshot, hash);
    const created = await this.bucket.put(
      r2ObjectKeys.head(command.workspaceId),
      canonicalJson(head),
      this.jsonPutOptions({ etagDoesNotMatch: '*' }),
    );
    if (!created) throw new WorkspaceAlreadyExistsError(command.workspaceId);
    return { revision: snapshot.revisionId, previousRevision: null };
  }

  async read(workspaceId: string): Promise<WorkspaceRead<WorkspaceSnapshot>> {
    const head = await this.loadHead(workspaceId);
    const snapshot = await this.readRevision(workspaceId, head.document.currentRevision);
    const hash = await sha256Hex(canonicalJson(snapshot));
    if (hash !== head.document.contentHash) {
      throw new WorkspaceStorageCorruptError('Head content hash does not match current revision');
    }
    return { workspaceId, revision: snapshot.revisionId, snapshot };
  }

  async readRevision(workspaceId: string, revisionId: string): Promise<WorkspaceSnapshot> {
    const object = await this.bucket.get(r2ObjectKeys.revision(workspaceId, revisionId));
    if (!object) throw new WorkspaceRevisionNotFoundError(workspaceId, revisionId);
    return this.parseSnapshot(await object.text(), workspaceId, revisionId);
  }

  async publish(command: PublishWorkspaceCommand<WorkspaceSnapshot>): Promise<PublishWorkspaceResult> {
    const loadedHead = await this.loadHead(command.workspaceId);
    if (loadedHead.document.currentRevision !== command.expectedRevision) {
      throw new WorkspaceConflictError(command.expectedRevision, loadedHead.document.currentRevision);
    }

    const snapshot = this.validateSnapshot(command.workspaceId, command.snapshot, command.expectedRevision);
    const { body, hash } = await this.serializeSnapshot(snapshot);
    await this.putImmutableRevision(snapshot, body, hash);

    const nextHead = this.createHead(snapshot, hash);
    const updated = await this.bucket.put(
      r2ObjectKeys.head(command.workspaceId),
      canonicalJson(nextHead),
      this.jsonPutOptions({ etagMatches: loadedHead.etag }),
    );
    if (!updated) {
      const latest = await this.loadHead(command.workspaceId);
      throw new WorkspaceConflictError(command.expectedRevision, latest.document.currentRevision);
    }

    return { revision: snapshot.revisionId, previousRevision: command.expectedRevision };
  }

  async listRevisions(workspaceId: string, limit = 30): Promise<WorkspaceRevisionSummary[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const listed = await this.bucket.list({
      prefix: r2ObjectKeys.revisionPrefix(workspaceId),
      limit: boundedLimit,
      include: ['customMetadata'],
    });
    return listed.objects.map(object => {
      const metadata = object.customMetadata;
      if (!metadata?.revisionId || !metadata.createdAt || !metadata.contentHash) {
        throw new WorkspaceStorageCorruptError('Revision list metadata is incomplete');
      }
      return {
        revisionId: metadata.revisionId,
        createdAt: metadata.createdAt,
        contentHash: metadata.contentHash,
        size: object.size,
      };
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async restore(command: RestoreWorkspaceCommand): Promise<PublishWorkspaceResult> {
    const target = await this.readRevision(command.workspaceId, command.targetRevision);
    return this.publish({
      workspaceId: command.workspaceId,
      expectedRevision: command.expectedRevision,
      snapshot: {
        ...target,
        revisionId: command.newRevision,
        previousRevisionId: command.expectedRevision,
        createdAt: command.createdAt,
      },
    });
  }

  async recoverHead(workspaceId: string, revisionId: string): Promise<PublishWorkspaceResult> {
    if (await this.bucket.get(r2ObjectKeys.head(workspaceId))) {
      throw new WorkspaceAlreadyExistsError(workspaceId);
    }
    const snapshot = await this.readRevision(workspaceId, revisionId);
    const { hash } = await this.serializeSnapshot(snapshot);
    const recovered = await this.bucket.put(
      r2ObjectKeys.head(workspaceId),
      canonicalJson(this.createHead(snapshot, hash)),
      this.jsonPutOptions({ etagDoesNotMatch: '*' }),
    );
    if (!recovered) throw new WorkspaceAlreadyExistsError(workspaceId);
    return { revision: revisionId, previousRevision: snapshot.previousRevisionId };
  }

  private async loadHead(workspaceId: string): Promise<LoadedHead> {
    const object = await this.bucket.get(r2ObjectKeys.head(workspaceId));
    if (!object) throw new WorkspaceNotFoundError(workspaceId);
    let source: unknown;
    try {
      source = JSON.parse(await object.text());
    } catch {
      throw new WorkspaceStorageCorruptError('Head is not valid JSON');
    }
    const parsed = workspaceHeadSchema.safeParse(source);
    if (!parsed.success || parsed.data.workspaceId !== workspaceId) {
      throw new WorkspaceStorageCorruptError('Head schema or workspace ID is invalid');
    }
    return { document: parsed.data, etag: object.etag };
  }

  private parseSnapshot(source: string, workspaceId: string, revisionId: string): WorkspaceSnapshot {
    let document: unknown;
    try {
      document = JSON.parse(source);
    } catch {
      throw new WorkspaceStorageCorruptError('Revision is not valid JSON');
    }
    const parsed = workspaceSnapshotSchema.safeParse(document);
    if (!parsed.success || parsed.data.workspaceId !== workspaceId || parsed.data.revisionId !== revisionId) {
      throw new WorkspaceStorageCorruptError('Revision schema or identity is invalid');
    }
    return parsed.data;
  }

  private validateSnapshot(
    workspaceId: string,
    source: WorkspaceSnapshot,
    previousRevisionId: string | null,
  ): WorkspaceSnapshot {
    const parsed = workspaceSnapshotSchema.safeParse(source);
    if (!parsed.success || parsed.data.workspaceId !== workspaceId || parsed.data.previousRevisionId !== previousRevisionId) {
      throw new WorkspaceStorageCorruptError('Snapshot schema, workspace ID, or revision chain is invalid');
    }
    return parsed.data;
  }

  private async serializeSnapshot(snapshot: WorkspaceSnapshot): Promise<{ body: string; hash: string }> {
    const body = canonicalJson(snapshot);
    return { body, hash: await sha256Hex(body) };
  }

  private async putImmutableRevision(snapshot: WorkspaceSnapshot, body: string, hash: string): Promise<void> {
    const created = await this.bucket.put(
      r2ObjectKeys.revision(snapshot.workspaceId, snapshot.revisionId),
      body,
      this.jsonPutOptions(
        { etagDoesNotMatch: '*' },
        {
          workspaceId: snapshot.workspaceId,
          revisionId: snapshot.revisionId,
          contentHash: hash,
          createdAt: snapshot.createdAt,
        },
      ),
    );
    if (!created) throw new WorkspaceRevisionCollisionError(snapshot.revisionId);
  }

  private createHead(snapshot: WorkspaceSnapshot, contentHash: string): WorkspaceHeadDocument {
    return {
      schemaVersion: 1,
      workspaceId: snapshot.workspaceId,
      currentRevision: snapshot.revisionId,
      previousRevision: snapshot.previousRevisionId,
      updatedAt: snapshot.createdAt,
      contentHash,
    };
  }

  private jsonPutOptions(
    onlyIf: NonNullable<R2PutOptions['onlyIf']>,
    customMetadata?: Record<string, string>,
  ): R2PutOptions {
    return {
      onlyIf,
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata,
    };
  }
}

export function createR2WorkspaceStore(bucket: R2Bucket): R2WorkspaceStore {
  return new R2WorkspaceStore(bucket);
}
