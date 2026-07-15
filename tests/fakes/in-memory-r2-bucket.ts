import type { R2PutOptions } from '@cloudflare/workers-types';
import type { R2BodyObject, R2BucketPort, R2StoredObject } from '../../worker/infrastructure/r2/r2-workspace-store';

interface StoredRecord {
  body: Uint8Array;
  etag: string;
  uploaded: Date;
  customMetadata?: Record<string, string>;
}

interface PendingRace {
  key: string;
  replacementBody: string;
}

interface PendingGetRace {
  key: string;
  occurrence: number;
  replacementBody: string;
}

export class InMemoryR2Bucket implements R2BucketPort {
  private readonly records = new Map<string, StoredRecord>();
  private nextEtag = 1;
  private pendingRace: PendingRace | null = null;
  private pendingGetRace: PendingGetRace | null = null;
  private readonly getCounts = new Map<string, number>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async get(key: string): Promise<R2BodyObject | null> {
    const occurrence = (this.getCounts.get(key) || 0) + 1;
    this.getCounts.set(key, occurrence);
    if (this.pendingGetRace?.key === key && this.pendingGetRace.occurrence === occurrence) {
      this.forcePut(key, this.pendingGetRace.replacementBody);
      this.pendingGetRace = null;
    }
    const record = this.records.get(key);
    if (!record) return null;
    const body = record.body.slice();
    return {
      etag: record.etag,
      size: body.byteLength,
      customMetadata: record.customMetadata,
      text: async () => new TextDecoder().decode(body),
      bytes: async () => body.slice(),
    };
  }

  async put(key: string, value: string | Uint8Array, options?: R2PutOptions): Promise<R2StoredObject | null> {
    if (this.pendingRace?.key === key && this.readConditional(options)?.etagMatches) {
      this.forcePut(key, this.pendingRace.replacementBody);
      this.pendingRace = null;
    }

    const current = this.records.get(key);
    const conditional = this.readConditional(options);
    if (conditional?.etagDoesNotMatch === '*' && current) return null;
    if (conditional?.etagMatches && current?.etag !== conditional.etagMatches) return null;

    const etag = this.newEtag();
    this.records.set(key, {
      body: typeof value === 'string' ? new TextEncoder().encode(value) : value.slice(),
      etag,
      uploaded: this.now(),
      customMetadata: options?.customMetadata,
    });
    return { etag };
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of typeof keys === 'string' ? [keys] : keys) this.records.delete(key);
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string; include?: ['customMetadata'] }) {
    const prefix = options?.prefix || '';
    const limit = options?.limit ?? 1000;
    const offset = options?.cursor ? Number.parseInt(options.cursor, 10) : 0;
    const matching = Array.from(this.records.entries()).filter(([key]) => key.startsWith(prefix));
    const objects = matching
      .slice(offset, offset + limit)
      .map(([key, record]) => ({
        key,
        size: record.body.byteLength,
        uploaded: record.uploaded,
        customMetadata: options?.include?.includes('customMetadata') ? record.customMetadata : undefined,
      }));
    const nextOffset = offset + objects.length;
    const truncated = nextOffset < matching.length;
    return { objects, truncated, cursor: truncated ? String(nextOffset) : undefined };
  }

  has(key: string): boolean {
    return this.records.has(key);
  }

  forcePut(key: string, body: string): void {
    this.records.set(key, { body: new TextEncoder().encode(body), etag: this.newEtag(), uploaded: this.now() });
  }

  forceDelete(key: string): void {
    this.records.delete(key);
  }

  raceNextConditionalPut(key: string, replacementBody: string): void {
    this.pendingRace = { key, replacementBody };
  }

  replaceOnFutureGet(key: string, callsFromNow: number, replacementBody: string): void {
    const occurrence = (this.getCounts.get(key) || 0) + callsFromNow;
    this.pendingGetRace = { key, occurrence, replacementBody };
  }

  private readConditional(options?: R2PutOptions) {
    const onlyIf = options?.onlyIf;
    return onlyIf && !(onlyIf instanceof Headers) ? onlyIf : undefined;
  }

  private newEtag(): string {
    const value = `etag-${this.nextEtag}`;
    this.nextEtag += 1;
    return value;
  }
}
