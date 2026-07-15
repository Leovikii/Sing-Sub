import {
  adapterPresetSchema,
  jsonAssetSchema,
  profileSchema,
  type JsonAsset,
  type Profile,
  type WorkspaceSnapshot,
} from '../../../shared';
import type { SyncFile } from '../ports/sync-gateway';
import { parseSyncPath } from '../../domain/sync/sync-path';
import { validateRulesetSource } from '../../lib/rulesets';
import { exportSyncBusinessFiles } from './export-workspace';

const MAX_SYNC_FILES = 200;
const MAX_SYNC_FILE_BYTES = 4 * 1024 * 1024;
const MAX_SYNC_TOTAL_BYTES = 32 * 1024 * 1024;

export type SyncTreeValidationCode =
  | 'TOO_MANY_FILES'
  | 'SOURCE_TOO_LARGE'
  | 'UNSUPPORTED_PATH'
  | 'DUPLICATE_PATH'
  | 'INVALID_JSON'
  | 'INVALID_SCHEMA'
  | 'NAME_MISMATCH'
  | 'MISSING_REFERENCE';

export class SyncTreeValidationError extends Error {
  constructor(
    readonly code: SyncTreeValidationCode,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'SyncTreeValidationError';
  }
}

export interface ImportedSyncTree {
  profiles: Profile[];
  assets: WorkspaceSnapshot['assets'];
  files: SyncFile[];
  contentHash: string;
}

function noteFromJson(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const metadata = record._sing_sub;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) &&
      typeof (metadata as Record<string, unknown>).note === 'string') {
    return (metadata as Record<string, unknown>).note as string;
  }
  return typeof record.note === 'string' ? record.note : undefined;
}

function parseJson(file: SyncFile): unknown {
  try {
    return JSON.parse(file.content);
  } catch {
    throw new SyncTreeValidationError('INVALID_JSON', file.path, 'Sync file is not valid JSON');
  }
}

export async function importSyncTree(input: SyncFile[]): Promise<ImportedSyncTree> {
  if (input.length > MAX_SYNC_FILES) {
    throw new SyncTreeValidationError('TOO_MANY_FILES', '$', 'Sync file count exceeds the limit');
  }
  const profiles: Profile[] = [];
  const assets: WorkspaceSnapshot['assets'] = {
    nodes: {}, templates: {}, adapters: {}, rulesets: {},
  };
  const paths = new Set<string>();
  const identities = new Set<string>();
  let totalBytes = 0;

  for (const file of input) {
    const managed = parseSyncPath(file.path);
    if (!managed) {
      throw new SyncTreeValidationError('UNSUPPORTED_PATH', file.path, 'Sync file path is not managed');
    }
    const pathKey = file.path.toLowerCase();
    const identityKey = `${managed.kind}:${managed.entityId.toLowerCase()}`;
    if (paths.has(pathKey) || identities.has(identityKey)) {
      throw new SyncTreeValidationError('DUPLICATE_PATH', file.path, 'Sync tree contains a duplicate path');
    }
    paths.add(pathKey);
    identities.add(identityKey);
    const size = new TextEncoder().encode(file.content).byteLength;
    totalBytes += size;
    if (size > MAX_SYNC_FILE_BYTES || totalBytes > MAX_SYNC_TOTAL_BYTES) {
      throw new SyncTreeValidationError('SOURCE_TOO_LARGE', file.path, 'Sync source exceeds the size limit');
    }

    const json = parseJson(file);
    if (managed.kind === 'configs') {
      const parsed = profileSchema.safeParse(json);
      if (!parsed.success) {
        throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, 'Profile schema is invalid');
      }
      if (parsed.data.name !== managed.entityId) {
        throw new SyncTreeValidationError('NAME_MISMATCH', file.path, 'Profile name does not match its filename');
      }
      profiles.push(parsed.data);
      continue;
    }

    if (!json || typeof json !== 'object' ||
        ((managed.kind === 'templates' || managed.kind === 'adapters' || managed.kind === 'rulesets') &&
          Array.isArray(json))) {
      throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, 'Asset JSON root is invalid');
    }
    if (managed.kind === 'rulesets') {
      const rulesetError = validateRulesetSource(file.content);
      if (rulesetError) throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, rulesetError);
    }
    if (managed.kind === 'adapters') {
      const adapter = adapterPresetSchema.safeParse(json);
      if (!adapter.success || adapter.data.name !== managed.entityId) {
        throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, 'Adapter preset schema or name is invalid');
      }
    }
    const asset = jsonAssetSchema.safeParse({
      path: file.path,
      note: noteFromJson(json),
      content: json,
    });
    if (!asset.success) {
      throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, 'Asset schema is invalid');
    }
    assets[managed.kind][managed.entityId] = asset.data as JsonAsset;
  }

  profiles.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  for (const profile of profiles) {
    const references = [profile.nodesPath, profile.templateUrl, profile.adapterUrl];
    for (const reference of references) {
      if (!reference || /^https?:\/\//i.test(reference) || reference === 'custom') continue;
      if (!paths.has(reference.toLowerCase())) {
        throw new SyncTreeValidationError(
          'MISSING_REFERENCE',
          `sing-sub/configs/${profile.name}.json`,
          `Profile references missing file ${reference}`,
        );
      }
    }
  }

  const normalized = await exportSyncBusinessFiles({ profiles, assets });
  return { profiles, assets, files: normalized.files, contentHash: normalized.contentHash };
}
