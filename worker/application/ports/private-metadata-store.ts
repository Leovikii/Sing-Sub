import type { PrivateCredentials } from '../../../shared';

export interface PrivateCredentialsRead {
  credentials: PrivateCredentials;
  version: string;
}

export interface PrivateMetadataStore {
  read(workspaceId: string): Promise<PrivateCredentialsRead | null>;
  create(credentials: PrivateCredentials): Promise<string>;
  update(credentials: PrivateCredentials, expectedVersion: string): Promise<string>;
}
