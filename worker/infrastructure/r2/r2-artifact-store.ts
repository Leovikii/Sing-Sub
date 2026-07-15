import type { R2PutOptions } from '@cloudflare/workers-types';
import type {
  ArtifactStore,
  SrsArtifactDescriptor,
  SrsArtifactIdentity,
} from '../../application/ports/artifact-store';
import { sha256Hex } from '../../domain/revisions/canonical-json';
import { r2ObjectKeys } from './r2-object-keys';
import type { R2BucketPort } from './r2-workspace-store';

export class ArtifactCollisionError extends Error {
  constructor() {
    super('Artifact identity already contains different content');
    this.name = 'ArtifactCollisionError';
  }
}

export class R2ArtifactStore implements ArtifactStore {
  constructor(private readonly bucket: R2BucketPort) {}

  async putSrs(identity: SrsArtifactIdentity, content: Uint8Array): Promise<SrsArtifactDescriptor> {
    const contentHash = await sha256Hex(content);
    const descriptor = { ...identity, contentHash, size: content.byteLength };
    const key = r2ObjectKeys.srsArtifact(identity.workspaceId, identity.rulesetId, identity.sourceHash);
    const created = await this.bucket.put(key, content, {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: {
        workspaceId: identity.workspaceId,
        rulesetId: identity.rulesetId,
        sourceHash: identity.sourceHash,
        contentHash,
      },
    } satisfies R2PutOptions);
    if (created) return descriptor;

    const existing = await this.bucket.get(key);
    if (!existing) throw new ArtifactCollisionError();
    const existingBytes = await existing.bytes();
    if (await sha256Hex(existingBytes) !== contentHash) throw new ArtifactCollisionError();
    return { ...identity, contentHash, size: existingBytes.byteLength };
  }

  async getSrs(identity: SrsArtifactIdentity): Promise<Uint8Array | null> {
    const object = await this.bucket.get(
      r2ObjectKeys.srsArtifact(identity.workspaceId, identity.rulesetId, identity.sourceHash),
    );
    return object ? object.bytes() : null;
  }
}
