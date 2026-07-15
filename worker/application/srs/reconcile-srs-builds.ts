import type { BuildJob, BuildSummary, WorkspaceSnapshot } from '../../../shared';
import type { BuildJobStore } from '../ports/build-job-store';
import type { CompilerDispatcher } from '../ports/compiler-dispatcher';
import type { SrsJobTicketService } from '../ports/srs-job-ticket-service';
import type { WorkspaceStore } from '../ports/workspace-store';
import {
  createCompilerSource,
  createSrsJobId,
  SRS_COMPILER_VERSION,
} from '../../domain/rulesets/compiler-source';
import { dispatchSrsBuild } from './manage-srs-build';

interface ReconcileDependencies {
  workspaceStore: WorkspaceStore<WorkspaceSnapshot>;
  jobStore: BuildJobStore;
}

export interface ReconcileSrsBuildsResult {
  revision: string;
  createdJobIds: string[];
  dispatchJobIds: string[];
}

export interface DispatchSrsBuildBatchDependencies extends ReconcileDependencies {
  dispatcher: CompilerDispatcher;
  ticketService: SrsJobTicketService;
  workerUrl: string;
}

function activeArtifactIsCurrent(build: BuildSummary | undefined, sourceHash: string): boolean {
  return build?.status === 'ready' && build.sourceHash === sourceHash &&
    build.activeArtifact?.sourceHash === sourceHash;
}

export async function reconcileSrsBuilds(
  dependencies: ReconcileDependencies,
  workspaceId: string,
): Promise<ReconcileSrsBuildsResult> {
  const current = await dependencies.workspaceStore.read(workspaceId);
  const createdAt = new Date().toISOString();
  const revisionId = crypto.randomUUID();
  const createdJobs: BuildJob[] = [];
  const dispatchJobIds: string[] = [];
  const pendingBuilds: Record<string, BuildSummary> = {};

  for (const [rulesetId, asset] of Object.entries(current.snapshot.assets.rulesets).sort(([left], [right]) =>
    left.localeCompare(right))) {
    const source = await createCompilerSource(asset.content);
    const build = current.snapshot.builds[rulesetId];
    if (activeArtifactIsCurrent(build, source.sourceHash)) continue;

    if (build?.sourceHash === source.sourceHash &&
        ['pending', 'dispatching', 'compiling', 'failed'].includes(build.status)) {
      const existing = await dependencies.jobStore.read(workspaceId, build.jobId);
      if (existing && existing.job.sourceHash === source.sourceHash &&
          ['pending', 'dispatching', 'compiling', 'failed'].includes(existing.job.status)) {
        dispatchJobIds.push(existing.job.jobId);
        continue;
      }
    }

    const jobId = await createSrsJobId({
      workspaceId,
      rulesetId,
      sourceRevision: revisionId,
      sourceHash: source.sourceHash,
      compilerVersion: SRS_COMPILER_VERSION,
    });
    const job: BuildJob = {
      schemaVersion: 1,
      jobId,
      workspaceId,
      rulesetId,
      sourceRevision: revisionId,
      sourceHash: source.sourceHash,
      compilerVersion: SRS_COMPILER_VERSION,
      status: 'pending',
      attempts: 0,
      createdAt,
      updatedAt: createdAt,
    };
    const summary: BuildSummary = {
      jobId,
      rulesetId,
      sourceHash: source.sourceHash,
      compilerVersion: SRS_COMPILER_VERSION,
      status: 'pending',
      ...(build?.activeArtifact ? { activeArtifact: build.activeArtifact } : {}),
      updatedAt: createdAt,
    };
    createdJobs.push(job);
    dispatchJobIds.push(jobId);
    pendingBuilds[rulesetId] = summary;
  }

  if (!createdJobs.length) {
    return { revision: current.revision, createdJobIds: [], dispatchJobIds };
  }
  for (const job of createdJobs) await dependencies.jobStore.create(job);
  const snapshot = structuredClone(current.snapshot);
  Object.assign(snapshot.builds, pendingBuilds);
  snapshot.revisionId = revisionId;
  snapshot.previousRevisionId = current.revision;
  snapshot.createdAt = createdAt;
  const published = await dependencies.workspaceStore.publish({
    workspaceId,
    expectedRevision: current.revision,
    snapshot,
  });
  return {
    revision: published.revision,
    createdJobIds: createdJobs.map(job => job.jobId),
    dispatchJobIds,
  };
}

export async function dispatchSrsBuildBatch(
  dependencies: DispatchSrsBuildBatchDependencies,
  workspaceId: string,
  jobIds: string[],
  concurrency = 2,
): Promise<Record<string, 'dispatched' | 'failed' | 'superseded'>> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error('SRS dispatch concurrency must be between 1 and 4');
  }
  const uniqueJobIds = [...new Set(jobIds)];
  const results: Record<string, 'dispatched' | 'failed' | 'superseded'> = {};
  let cursor = 0;
  const run = async () => {
    while (cursor < uniqueJobIds.length) {
      const jobId = uniqueJobIds[cursor];
      cursor += 1;
      results[jobId] = await dispatchSrsBuild(dependencies, workspaceId, jobId);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueJobIds.length) }, () => run()));
  return results;
}
