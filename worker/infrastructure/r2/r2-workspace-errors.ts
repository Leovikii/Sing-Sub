export class WorkspaceNotFoundError extends Error {
  constructor(readonly workspaceId: string) {
    super('Workspace not found');
    this.name = 'WorkspaceNotFoundError';
  }
}

export class WorkspaceRevisionNotFoundError extends Error {
  constructor(
    readonly workspaceId: string,
    readonly revisionId: string,
  ) {
    super('Workspace revision not found');
    this.name = 'WorkspaceRevisionNotFoundError';
  }
}

export class WorkspaceStorageCorruptError extends Error {
  constructor(readonly reason: string) {
    super('Workspace storage is corrupt');
    this.name = 'WorkspaceStorageCorruptError';
  }
}

export class WorkspaceAlreadyExistsError extends Error {
  constructor(readonly workspaceId: string) {
    super('Workspace already exists');
    this.name = 'WorkspaceAlreadyExistsError';
  }
}

export class WorkspaceRevisionCollisionError extends Error {
  constructor(readonly revisionId: string) {
    super('Workspace revision already exists');
    this.name = 'WorkspaceRevisionCollisionError';
  }
}
