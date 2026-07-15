export interface SrsArtifactIdentity {
  workspaceId: string;
  rulesetId: string;
  sourceHash: string;
}

export interface SrsArtifactDescriptor extends SrsArtifactIdentity {
  contentHash: string;
  size: number;
}

export interface ArtifactStore {
  putSrs(identity: SrsArtifactIdentity, content: Uint8Array): Promise<SrsArtifactDescriptor>;
  getSrs(identity: SrsArtifactIdentity): Promise<Uint8Array | null>;
}
