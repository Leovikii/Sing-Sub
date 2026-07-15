import { WorkspaceConflictError } from '../../worker/application/errors/workspace-conflict';
import type {
  PublishWorkspaceCommand,
  PublishWorkspaceResult,
  CreateWorkspaceCommand,
  WorkspaceRead,
  WorkspaceStore,
} from '../../worker/application/ports/workspace-store';

export class InMemoryWorkspaceStore<TSnapshot> implements WorkspaceStore<TSnapshot> {
  private revisionNumber = 1;
  private revision: string;
  private snapshot: TSnapshot;
  private readonly revisions = new Map<string, TSnapshot>();

  constructor(
    private readonly workspaceId: string,
    initialSnapshot: TSnapshot,
  ) {
    this.revision = this.snapshotRevision(initialSnapshot) || this.toRevision(this.revisionNumber);
    this.snapshot = structuredClone(initialSnapshot);
    this.revisions.set(this.revision, structuredClone(initialSnapshot));
  }

  async create(_command: CreateWorkspaceCommand<TSnapshot>): Promise<PublishWorkspaceResult> {
    throw new Error('Workspace already exists');
  }

  async readRevision(workspaceId: string, revision: string): Promise<TSnapshot> {
    if (workspaceId !== this.workspaceId) throw new Error('Workspace not found');
    const snapshot = this.revisions.get(revision);
    if (!snapshot) throw new Error('Workspace revision not found');
    return structuredClone(snapshot);
  }

  async read(workspaceId: string): Promise<WorkspaceRead<TSnapshot>> {
    if (workspaceId !== this.workspaceId) throw new Error('Workspace not found');
    return {
      workspaceId,
      revision: this.revision,
      snapshot: structuredClone(this.snapshot),
    };
  }

  async publish(command: PublishWorkspaceCommand<TSnapshot>): Promise<PublishWorkspaceResult> {
    if (command.workspaceId !== this.workspaceId) throw new Error('Workspace not found');
    if (command.expectedRevision !== this.revision) {
      throw new WorkspaceConflictError(command.expectedRevision, this.revision);
    }

    const previousRevision = this.revision;
    this.revisionNumber += 1;
    this.revision = this.snapshotRevision(command.snapshot) || this.toRevision(this.revisionNumber);
    this.snapshot = structuredClone(command.snapshot);
    this.revisions.set(this.revision, structuredClone(command.snapshot));
    return { revision: this.revision, previousRevision };
  }

  private toRevision(value: number): string {
    return `revision-${value}`;
  }

  private snapshotRevision(snapshot: TSnapshot): string | null {
    if (!snapshot || typeof snapshot !== 'object' || !('revisionId' in snapshot)) return null;
    const revisionId = (snapshot as { revisionId?: unknown }).revisionId;
    return typeof revisionId === 'string' && revisionId ? revisionId : null;
  }
}
