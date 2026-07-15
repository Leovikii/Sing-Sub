import type { R2BucketPort } from './r2-workspace-store';

const GIB = 1024 ** 3;
const DEFAULT_WARNING_BYTES = GIB;
const DEFAULT_HISTORY_PAUSE_BYTES = 8 * GIB;

export interface R2BudgetConfig {
  warningBytes: number;
  historyPauseBytes: number;
}

export type R2BudgetLevel = 'normal' | 'warning' | 'history-paused';

export interface R2UsageReport {
  totalBytes: number;
  objectCount: number;
  bytesByKind: {
    revisions: number;
    artifacts: number;
    jobs: number;
    privateMetadata: number;
    heads: number;
    other: number;
  };
  level: R2BudgetLevel;
  allowNonessentialHistory: boolean;
}

export interface R2BudgetEnvironment {
  R2_WARNING_BYTES?: string;
  R2_HISTORY_PAUSE_BYTES?: string;
}

function positiveInteger(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`Invalid ${label}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

export function r2BudgetConfigFromEnvironment(env: R2BudgetEnvironment): R2BudgetConfig {
  const warningBytes = positiveInteger(env.R2_WARNING_BYTES, DEFAULT_WARNING_BYTES, 'R2 warning budget');
  const historyPauseBytes = positiveInteger(
    env.R2_HISTORY_PAUSE_BYTES,
    DEFAULT_HISTORY_PAUSE_BYTES,
    'R2 history pause budget',
  );
  if (historyPauseBytes <= warningBytes) throw new Error('R2 history pause budget must exceed warning budget');
  return { warningBytes, historyPauseBytes };
}

export class R2UsageBudgetService {
  constructor(
    private readonly bucket: R2BucketPort,
    private readonly config: R2BudgetConfig,
    private readonly pageSize = 1000,
  ) {
    if (!Number.isSafeInteger(config.warningBytes) || config.warningBytes <= 0 ||
        !Number.isSafeInteger(config.historyPauseBytes) || config.historyPauseBytes <= config.warningBytes ||
        !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
      throw new Error('Invalid R2 usage budget configuration');
    }
  }

  async measure(): Promise<R2UsageReport> {
    const bytesByKind: R2UsageReport['bytesByKind'] = {
      revisions: 0,
      artifacts: 0,
      jobs: 0,
      privateMetadata: 0,
      heads: 0,
      other: 0,
    };
    let objectCount = 0;
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix: 'workspaces/', limit: this.pageSize, cursor });
      for (const object of page.objects) {
        objectCount += 1;
        bytesByKind[this.kindForKey(object.key)] += object.size;
      }
      if (page.truncated && !page.cursor) throw new Error('R2 usage list cursor is missing');
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    const totalBytes = Object.values(bytesByKind).reduce((total, bytes) => total + bytes, 0);
    const level: R2BudgetLevel = totalBytes >= this.config.historyPauseBytes
      ? 'history-paused'
      : totalBytes >= this.config.warningBytes ? 'warning' : 'normal';
    return {
      totalBytes,
      objectCount,
      bytesByKind,
      level,
      allowNonessentialHistory: level !== 'history-paused',
    };
  }

  private kindForKey(key: string): keyof R2UsageReport['bytesByKind'] {
    if (key.endsWith('/head.json')) return 'heads';
    if (key.includes('/revisions/')) return 'revisions';
    if (key.includes('/artifacts/')) return 'artifacts';
    if (key.includes('/jobs/')) return 'jobs';
    if (key.includes('/private/')) return 'privateMetadata';
    return 'other';
  }
}
