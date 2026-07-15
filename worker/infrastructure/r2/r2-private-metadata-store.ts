import { privateCredentialsSchema, type PrivateCredentials } from '../../../shared';
import { WorkspaceConflictError } from '../../application/errors/workspace-conflict';
import type {
  PrivateCredentialsRead,
  PrivateMetadataStore,
} from '../../application/ports/private-metadata-store';
import { canonicalJson } from '../../domain/revisions/canonical-json';
import { r2ObjectKeys } from './r2-object-keys';
import { WorkspaceStorageCorruptError } from './r2-workspace-errors';
import type { R2BucketPort } from './r2-workspace-store';

export class R2PrivateMetadataStore implements PrivateMetadataStore {
  constructor(private readonly bucket: R2BucketPort) {}

  async read(workspaceId: string): Promise<PrivateCredentialsRead | null> {
    const object = await this.bucket.get(r2ObjectKeys.privateCredentials(workspaceId));
    if (!object) return null;
    let document: unknown;
    try {
      document = JSON.parse(await object.text());
    } catch {
      throw new WorkspaceStorageCorruptError('Private credentials are not valid JSON');
    }
    const parsed = privateCredentialsSchema.safeParse(document);
    if (!parsed.success || parsed.data.workspaceId !== workspaceId) {
      throw new WorkspaceStorageCorruptError('Private credentials schema or workspace ID is invalid');
    }
    return { credentials: parsed.data, version: object.etag };
  }

  async create(credentials: PrivateCredentials): Promise<string> {
    const parsed = privateCredentialsSchema.parse(credentials);
    const created = await this.bucket.put(
      r2ObjectKeys.privateCredentials(parsed.workspaceId),
      canonicalJson(parsed),
      { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json; charset=utf-8' } },
    );
    if (!created) throw new WorkspaceConflictError('missing', 'existing');
    return created.etag;
  }

  async update(credentials: PrivateCredentials, expectedVersion: string): Promise<string> {
    const parsed = privateCredentialsSchema.parse(credentials);
    const updated = await this.bucket.put(
      r2ObjectKeys.privateCredentials(parsed.workspaceId),
      canonicalJson(parsed),
      { onlyIf: { etagMatches: expectedVersion }, httpMetadata: { contentType: 'application/json; charset=utf-8' } },
    );
    if (!updated) {
      const current = await this.read(parsed.workspaceId);
      throw new WorkspaceConflictError(expectedVersion, current?.version || 'missing');
    }
    return updated.etag;
  }
}
