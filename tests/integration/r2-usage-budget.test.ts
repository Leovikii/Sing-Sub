import { describe, expect, it } from 'vitest';
import {
  r2BudgetConfigFromEnvironment,
  R2UsageBudgetService,
} from '../../worker/infrastructure/r2/r2-usage-budget';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';

async function bucketWithObjects(): Promise<InMemoryR2Bucket> {
  const bucket = new InMemoryR2Bucket();
  await bucket.put('workspaces/workspace-1/head.json', '12345');
  await bucket.put('workspaces/workspace-1/revisions/revision-1.json', '1234567890');
  await bucket.put('workspaces/workspace-1/artifacts/srs/ruleset-1/hash.srs', new Uint8Array(20));
  await bucket.put('workspaces/workspace-1/jobs/job-1.json', '1234567');
  await bucket.put('workspaces/workspace-1/private/credentials.json', '123');
  return bucket;
}

describe('R2 usage budget', () => {
  it('parses defaults and validated environment overrides', () => {
    expect(r2BudgetConfigFromEnvironment({})).toEqual({
      warningBytes: 1024 ** 3,
      historyPauseBytes: 8 * 1024 ** 3,
    });
    expect(r2BudgetConfigFromEnvironment({
      R2_WARNING_BYTES: '100',
      R2_HISTORY_PAUSE_BYTES: '200',
    })).toEqual({ warningBytes: 100, historyPauseBytes: 200 });
    expect(() => r2BudgetConfigFromEnvironment({
      R2_WARNING_BYTES: '200',
      R2_HISTORY_PAUSE_BYTES: '100',
    })).toThrow('must exceed');
  });

  it('reports category totals across paginated R2 listings', async () => {
    const bucket = await bucketWithObjects();
    const service = new R2UsageBudgetService(bucket, { warningBytes: 100, historyPauseBytes: 200 }, 2);

    await expect(service.measure()).resolves.toEqual({
      totalBytes: 45,
      objectCount: 5,
      bytesByKind: {
        revisions: 10,
        artifacts: 20,
        jobs: 7,
        privateMetadata: 3,
        heads: 5,
        other: 0,
      },
      level: 'normal',
      allowNonessentialHistory: true,
    });
  });

  it('returns warning without pausing history at the first threshold', async () => {
    const bucket = await bucketWithObjects();
    const service = new R2UsageBudgetService(bucket, { warningBytes: 40, historyPauseBytes: 50 });

    await expect(service.measure()).resolves.toMatchObject({
      totalBytes: 45,
      level: 'warning',
      allowNonessentialHistory: true,
    });
  });

  it('pauses only nonessential history at the soft limit', async () => {
    const bucket = await bucketWithObjects();
    const service = new R2UsageBudgetService(bucket, { warningBytes: 20, historyPauseBytes: 40 });

    await expect(service.measure()).resolves.toMatchObject({
      level: 'history-paused',
      allowNonessentialHistory: false,
    });
  });
});
