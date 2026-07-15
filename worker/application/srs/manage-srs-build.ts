import type {
  BuildJob,
  BuildSummary,
  SrsArtifactPointer,
  WorkspaceSnapshot,
} from '../../../shared';
import { WorkspaceConflictError } from '../errors/workspace-conflict';
import type { ArtifactStore, SrsArtifactDescriptor } from '../ports/artifact-store';
import type { BuildJobRecord, BuildJobStore } from '../ports/build-job-store';
import type { CompilerDispatcher } from '../ports/compiler-dispatcher';
import type { SrsJobTicketService } from '../ports/srs-job-ticket-service';
import { SRS_JOB_OPERATIONS } from '../ports/srs-job-ticket-service';
import type { WorkspaceStore } from '../ports/workspace-store';
import { createCompilerSource } from '../../domain/rulesets/compiler-source';
import { sha256Hex } from '../../domain/revisions/canonical-json';

const MAX_CAS_ATTEMPTS = 4;

export class SrsBuildNotFoundError extends Error {
  constructor() {
    super('SRS build job not found');
    this.name = 'SrsBuildNotFoundError';
  }
}

export class SrsBuildValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SrsBuildValidationError';
  }
}

export class SrsBuildStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SrsBuildStateError';
  }
}

interface BuildDependencies {
  workspaceStore: WorkspaceStore<WorkspaceSnapshot>;
  jobStore: BuildJobStore;
}

interface CompleteBuildDependencies extends BuildDependencies {
  artifactStore: ArtifactStore;
}

async function requireJob(
  store: BuildJobStore,
  workspaceId: string,
  jobId: string,
): Promise<BuildJobRecord> {
  const record = await store.read(workspaceId, jobId);
  if (!record) throw new SrsBuildNotFoundError();
  return record;
}

async function transitionJob(
  store: BuildJobStore,
  workspaceId: string,
  jobId: string,
  update: (job: BuildJob) => BuildJob,
): Promise<BuildJobRecord> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await requireJob(store, workspaceId, jobId);
    const next = update(current.job);
    if (next === current.job) return current;
    try {
      return await store.update(next, current.version);
    } catch (error) {
      if (!(error instanceof WorkspaceConflictError) || attempt === MAX_CAS_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error('Unreachable job transition');
}

async function publishBuildUpdate(
  store: WorkspaceStore<WorkspaceSnapshot>,
  workspaceId: string,
  job: BuildJob,
  update: (summary: BuildSummary) => BuildSummary,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await store.read(workspaceId);
    const summary = current.snapshot.builds[job.rulesetId];
    if (!summary || summary.jobId !== job.jobId) return false;
    const createdAt = new Date().toISOString();
    const snapshot = structuredClone(current.snapshot);
    snapshot.builds[job.rulesetId] = update(summary);
    snapshot.revisionId = crypto.randomUUID();
    snapshot.previousRevisionId = current.revision;
    snapshot.createdAt = createdAt;
    try {
      await store.publish({
        workspaceId,
        expectedRevision: current.revision,
        snapshot,
      });
      return true;
    } catch (error) {
      if (!(error instanceof WorkspaceConflictError) || attempt === MAX_CAS_ATTEMPTS - 1) throw error;
    }
  }
  return false;
}

async function supersedeJob(dependencies: BuildDependencies, job: BuildJob): Promise<void> {
  await transitionJob(dependencies.jobStore, job.workspaceId, job.jobId, current => {
    if (current.status === 'superseded') return current;
    return { ...current, status: 'superseded', updatedAt: new Date().toISOString() };
  });
}

async function isCurrentBuild(dependencies: BuildDependencies, job: BuildJob): Promise<boolean> {
  const current = await dependencies.workspaceStore.read(job.workspaceId);
  return current.snapshot.builds[job.rulesetId]?.jobId === job.jobId;
}

export async function dispatchSrsBuild(
  dependencies: BuildDependencies & {
    dispatcher: CompilerDispatcher;
    ticketService: SrsJobTicketService;
    workerUrl: string;
  },
  workspaceId: string,
  jobId: string,
): Promise<'dispatched' | 'failed' | 'superseded'> {
  let record = await requireJob(dependencies.jobStore, workspaceId, jobId);
  if (!['pending', 'failed'].includes(record.job.status)) {
    if (record.job.status === 'superseded') return 'superseded';
    return 'dispatched';
  }
  record = await transitionJob(dependencies.jobStore, workspaceId, jobId, current => ({
    ...current,
    status: 'dispatching',
    attempts: current.attempts + 1,
    updatedAt: new Date().toISOString(),
  }));
  if (!await isCurrentBuild(dependencies, record.job)) {
    await supersedeJob(dependencies, record.job);
    return 'superseded';
  }

  try {
    const issuedAt = Math.floor(Date.now() / 1000);
    const jobTicket = await dependencies.ticketService.issue({
      purpose: 'srs-build',
      workspaceId,
      jobId,
      operations: [...SRS_JOB_OPERATIONS],
      issuedAt,
      expiresAt: issuedAt + 15 * 60,
    });
    await dependencies.dispatcher.dispatch({ jobId, workerUrl: dependencies.workerUrl, jobTicket });
    return 'dispatched';
  } catch {
    const failed = await transitionJob(dependencies.jobStore, workspaceId, jobId, current => ({
      ...current,
      status: 'failed',
      updatedAt: new Date().toISOString(),
    }));
    const stillCurrent = await publishBuildUpdate(
      dependencies.workspaceStore,
      workspaceId,
      failed.job,
      summary => ({ ...summary, status: 'failed', updatedAt: new Date().toISOString() }),
    );
    if (!stillCurrent) {
      await supersedeJob(dependencies, failed.job);
      return 'superseded';
    }
    return 'failed';
  }
}

export async function readSrsBuildSource(
  dependencies: BuildDependencies,
  workspaceId: string,
  jobId: string,
): Promise<{ source: string; compilerVersion: string }> {
  let record = await requireJob(dependencies.jobStore, workspaceId, jobId);
  if (!['pending', 'dispatching', 'compiling'].includes(record.job.status)) {
    throw new SrsBuildStateError(`Cannot read source for ${record.job.status} job`);
  }
  const snapshot = await dependencies.workspaceStore.readRevision(workspaceId, record.job.sourceRevision);
  const asset = snapshot.assets.rulesets[record.job.rulesetId];
  if (!asset) throw new SrsBuildValidationError('Ruleset source is missing from its revision');
  const source = await createCompilerSource(asset.content);
  if (source.sourceHash !== record.job.sourceHash) {
    throw new SrsBuildValidationError('Ruleset source hash does not match the build job');
  }
  if (record.job.status !== 'compiling') {
    record = await transitionJob(dependencies.jobStore, workspaceId, jobId, current => {
      if (current.status === 'compiling') return current;
      if (!['pending', 'dispatching'].includes(current.status)) {
        throw new SrsBuildStateError(`Cannot start ${current.status} job`);
      }
      return { ...current, status: 'compiling', updatedAt: new Date().toISOString() };
    });
    if (!await isCurrentBuild(dependencies, record.job)) {
      await supersedeJob(dependencies, record.job);
      throw new SrsBuildStateError('Build job was superseded');
    }
  }
  return { source: source.body, compilerVersion: record.job.compilerVersion };
}

export interface CompleteSrsBuildCommand {
  workspaceId: string;
  jobId: string;
  compilerVersion: string;
  contentHash: string;
  content: Uint8Array;
}

export async function completeSrsBuild(
  dependencies: CompleteBuildDependencies,
  command: CompleteSrsBuildCommand,
): Promise<{ status: 'ready'; artifact: SrsArtifactDescriptor } | { status: 'superseded' }> {
  let record = await requireJob(dependencies.jobStore, command.workspaceId, command.jobId);
  if (record.job.compilerVersion !== command.compilerVersion) {
    throw new SrsBuildValidationError('Compiler version does not match the build job');
  }
  if (await sha256Hex(command.content) !== command.contentHash) {
    throw new SrsBuildValidationError('Artifact SHA-256 does not match the callback header');
  }
  if (record.job.status === 'superseded') return { status: 'superseded' };
  if (!['compiling', 'ready'].includes(record.job.status)) {
    throw new SrsBuildStateError(`Cannot complete ${record.job.status} job`);
  }
  const current = await dependencies.workspaceStore.read(command.workspaceId);
  if (current.snapshot.builds[record.job.rulesetId]?.jobId !== record.job.jobId) {
    await supersedeJob(dependencies, record.job);
    return { status: 'superseded' };
  }

  const artifact = await dependencies.artifactStore.putSrs({
    workspaceId: command.workspaceId,
    rulesetId: record.job.rulesetId,
    sourceHash: record.job.sourceHash,
  }, command.content);
  const currentSummary = current.snapshot.builds[record.job.rulesetId];
  if (record.job.status === 'ready' &&
      currentSummary?.status === 'ready' &&
      currentSummary.activeArtifact?.contentHash === artifact.contentHash) {
    return { status: 'ready', artifact };
  }
  record = await transitionJob(dependencies.jobStore, command.workspaceId, command.jobId, job => {
    if (job.status === 'ready') return job;
    return { ...job, status: 'ready', updatedAt: new Date().toISOString() };
  });
  const pointer: SrsArtifactPointer = {
    rulesetId: record.job.rulesetId,
    sourceHash: record.job.sourceHash,
    contentHash: artifact.contentHash,
    size: artifact.size,
    createdAt: new Date().toISOString(),
  };
  const activated = await publishBuildUpdate(
    dependencies.workspaceStore,
    command.workspaceId,
    record.job,
    summary => ({
      ...summary,
      status: 'ready',
      activeArtifact: summary.activeArtifact?.contentHash === pointer.contentHash
        ? summary.activeArtifact
        : pointer,
      updatedAt: new Date().toISOString(),
    }),
  );
  if (!activated) {
    await supersedeJob(dependencies, record.job);
    return { status: 'superseded' };
  }
  return { status: 'ready', artifact };
}

export async function failSrsBuild(
  dependencies: BuildDependencies,
  workspaceId: string,
  jobId: string,
  compilerVersion: string,
): Promise<'failed' | 'ready' | 'superseded'> {
  let record = await requireJob(dependencies.jobStore, workspaceId, jobId);
  if (record.job.compilerVersion !== compilerVersion) {
    throw new SrsBuildValidationError('Compiler version does not match the build job');
  }
  if (record.job.status === 'ready') return 'ready';
  if (record.job.status === 'superseded') return 'superseded';
  const current = await dependencies.workspaceStore.read(workspaceId);
  const currentSummary = current.snapshot.builds[record.job.rulesetId];
  if (currentSummary?.jobId !== jobId) {
    await supersedeJob(dependencies, record.job);
    return 'superseded';
  }
  if (record.job.status === 'failed' && currentSummary.status === 'failed') return 'failed';
  record = await transitionJob(dependencies.jobStore, workspaceId, jobId, job => {
    if (job.status === 'failed') return job;
    return { ...job, status: 'failed', updatedAt: new Date().toISOString() };
  });
  const visible = await publishBuildUpdate(
    dependencies.workspaceStore,
    workspaceId,
    record.job,
    summary => ({ ...summary, status: 'failed', updatedAt: new Date().toISOString() }),
  );
  if (!visible) {
    await supersedeJob(dependencies, record.job);
    return 'superseded';
  }
  return 'failed';
}
