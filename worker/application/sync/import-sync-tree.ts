import {
  jsonAssetSchema,
  profileSchema, profileDefinitionSchema, portableMetadataSchema,
  type WorkspaceMetadata, type PortableMetadata,
  type JsonAsset,
  type Profile,
  type WorkspaceSnapshot,
} from '../../../shared';
import type { SyncFile } from '../ports/sync-gateway';
import { parseSyncPath } from '../../domain/sync/sync-path';
import { parseRulesetImportUrl, validateRulesetSource } from '../../lib/rulesets';
import { normalizeWorkspace, projectProfile, splitAsset } from '../../lib/workspace-metadata';
import { parseStrictJson } from '../../lib/strict-json';
import { canonicalPrettyJson, orderedPrettyJson, sha256Hex } from '../../domain/revisions/canonical-json';
import { SYNC_METADATA_PATH, SYNC_MANIFEST_PATH, hashSyncFiles } from './export-workspace';

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
  metadata: WorkspaceMetadata;
  formatVersion: 2 | 3;
  warnings: string[];
  assets: WorkspaceSnapshot['assets'];
  files: SyncFile[];
  contentHash: string;
  serializedHash: string;
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
    return parseStrictJson(file.content);
  } catch {
    throw new SyncTreeValidationError('INVALID_JSON', file.path, 'Sync file is not valid JSON');
  }
}

export async function importSyncTree(input: SyncFile[], options: { requireMetadata?: boolean; manifestContent?: string } = {}): Promise<ImportedSyncTree> {
  const sidecar = input.find(file => file.path === SYNC_METADATA_PATH);
  const manifestFile = input.find(file => file.path === SYNC_MANIFEST_PATH);
  let manifestV3 = false;
  if (options.manifestContent || manifestFile) {
    try { manifestV3 = (parseStrictJson(options.manifestContent ?? manifestFile!.content) as { schemaVersion?: number }).schemaVersion === 3; }
    catch { throw new SyncTreeValidationError('INVALID_JSON', SYNC_MANIFEST_PATH, 'Invalid sync manifest'); }
  }
  const formatVersion = sidecar || manifestV3 || options.requireMetadata ? 3 : 2;
  if (formatVersion === 3 && !sidecar) throw new SyncTreeValidationError('INVALID_SCHEMA', SYNC_METADATA_PATH, 'Restore required metadata.json before importing');
  let portable: PortableMetadata | undefined;
  if (sidecar) {
    const parsed = portableMetadataSchema.safeParse(parseJson(sidecar));
    if (!parsed.success) throw new SyncTreeValidationError('INVALID_SCHEMA', sidecar.path, 'Invalid metadata document');
    portable = parsed.data;
    for (const [path, entry] of Object.entries(portable.entities)) {
      try { entry.editor?.ruleset?.sources.forEach(source => parseRulesetImportUrl(source.url)); }
      catch { throw new SyncTreeValidationError('INVALID_SCHEMA', path, 'Invalid ruleset source URL'); }
    }
  }
  const metadata: WorkspaceMetadata = { schemaVersion: 1, entities: {} };
  const warnings: string[] = [];
  const businessInput = input.filter(file => file.path !== SYNC_METADATA_PATH && file.path !== SYNC_MANIFEST_PATH);
  if (businessInput.length > MAX_SYNC_FILES) {
    throw new SyncTreeValidationError('TOO_MANY_FILES', '$', 'Sync file count exceeds the limit');
  }
  const profiles: Profile[] = [];
  const assets: WorkspaceSnapshot['assets'] = {
    nodes: {}, templates: {}, rulesets: {},
  };
  const paths = new Set<string>();
  const identities = new Set<string>();
  let totalBytes = 0;

  for (const file of input) {
    const control = file.path === SYNC_METADATA_PATH || file.path === SYNC_MANIFEST_PATH;
    const managed = parseSyncPath(file.path);
    if (!managed && !control) {
      throw new SyncTreeValidationError('UNSUPPORTED_PATH', file.path, 'Sync file path is not managed');
    }
    const pathKey = file.path.toLowerCase();
    const identityKey = managed ? `${managed.kind}:${managed.entityId.toLowerCase()}` : pathKey;
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

    if (control) continue;
    if (!managed) throw new SyncTreeValidationError('UNSUPPORTED_PATH', file.path, 'Invalid path');
    const json = parseJson(file);
    if (portable) {
      const entry = portable.entities[file.path];
      if (!entry) throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, 'Metadata record is missing');
      const { contentHash, ...entity } = entry;
      metadata.entities[file.path] = entity;
      if (contentHash !== await sha256Hex(orderedPrettyJson(json))) {
        delete entity.updatedAt;
        if (entity.editor?.ruleset) entity.editor.ruleset.needsReview = true;
        warnings.push(`${file.path}: body changed outside Sing-Sub; timestamp cleared${entity.editor?.ruleset ? ', editor requires review' : ''}`);
      }
    }
    if (managed.kind === 'configs') {
      const parsed = (formatVersion === 3 ? profileDefinitionSchema : profileSchema).safeParse(json);
      if (!parsed.success) {
        throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, 'Profile schema is invalid');
      }
      if (parsed.data.name !== managed.entityId) {
        throw new SyncTreeValidationError('NAME_MISMATCH', file.path, 'Profile name does not match its filename');
      }
      profiles.push(formatVersion === 3 ? projectProfile(json as Profile, metadata.entities[file.path]) : json as Profile);
      continue;
    }

    if (!json || typeof json !== 'object' ||
        ((managed.kind === 'templates' || managed.kind === 'rulesets') &&
          Array.isArray(json))) {
      throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, 'Asset JSON root is invalid');
    }
    if (managed.kind === 'rulesets' && formatVersion === 2) {
      const rulesetError = validateRulesetSource(file.content);
      if (rulesetError) throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, rulesetError);
    }
    const candidate = {
      path: file.path,
      note: noteFromJson(json),
      content: json,
    };
    const asset = jsonAssetSchema.safeParse(candidate);
    if (!asset.success) {
      throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, 'Asset schema is invalid');
    }
    if (formatVersion === 3) {
      try {
        const split = splitAsset(candidate as JsonAsset, metadata.entities[file.path]);
        if (JSON.stringify(split.asset.content) !== JSON.stringify(json)) throw new Error('Management fields must be in metadata.json');
        const entry = metadata.entities[file.path];
        for (const annotation of entry.editor?.annotations ?? []) {
          const root = json as Record<string, unknown>;
          const items = Array.isArray(json) && annotation.direction === 'outbound' ? json : root[`${annotation.direction}s`];
          if (!Array.isArray(items) || items.filter(item => item && typeof item === 'object' && item.tag === annotation.tag).length !== 1) {
            warnings.push(`${file.path}: annotation ${annotation.direction}/${annotation.tag} requires a unique current tag`);
          }
        }
        if (entry.display && json && typeof json === 'object' && !Array.isArray(json)) {
          const outbounds = (json as { outbounds?: Array<{ tag?: string }> }).outbounds ?? [];
          const available = new Set(outbounds.map(item => item.tag));
          const pruned = entry.display.outboundOrder.filter(tag => available.has(tag));
          if (pruned.length !== entry.display.outboundOrder.length) warnings.push(`${file.path}: removed obsolete display tags`);
          entry.display.outboundOrder = pruned;
        }
        assets[managed.kind][managed.entityId] = { ...split.asset, ...(entry.note !== undefined ? { note: entry.note } : {}), ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}) };
      } catch (error) { throw new SyncTreeValidationError('INVALID_SCHEMA', file.path, error instanceof Error ? error.message : 'Invalid asset'); }
    } else assets[managed.kind][managed.entityId] = candidate as JsonAsset;
  }

  profiles.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  for (const profile of profiles) {
    const references = [profile.nodesPath, profile.templateUrl];
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

  if (portable) for (const path of Object.keys(portable.entities)) if (!paths.has(path.toLowerCase())) warnings.push(`${path}: orphan metadata ignored`);
  // Compare the actual remote tree, before removing stale metadata. This keeps
  // B/L/G honest and exposes sanitization as a subsequent local change.
  const rawFiles: SyncFile[] = [];
  const semanticFiles: SyncFile[] = [];
  for (const file of input.filter(file => file.path !== SYNC_MANIFEST_PATH)) {
    const value = parseJson(file);
    const content = file.path === SYNC_METADATA_PATH ? canonicalPrettyJson(value) : orderedPrettyJson(value);
    rawFiles.push({ path: file.path, content, contentHash: await sha256Hex(content) });
    semanticFiles.push({ path: file.path, content: '', contentHash: await sha256Hex(canonicalPrettyJson(value)) });
  }
  if (portable) {
    const semantic = structuredClone(parseJson(sidecar!) as PortableMetadata);
    for (const file of rawFiles) if (file.path !== SYNC_METADATA_PATH) {
      const entry = semantic.entities[file.path];
      if (entry?.contentHash === file.contentHash) entry.contentHash = semanticFiles.find(item => item.path === file.path)!.contentHash;
    }
    semanticFiles.find(file => file.path === SYNC_METADATA_PATH)!.contentHash = await sha256Hex(canonicalPrettyJson(semantic));
  }
  rawFiles.sort((a, b) => a.path.localeCompare(b.path));
  let projected = { profiles, assets, metadata };
  if (formatVersion === 2) {
    try {
      const converted = normalizeWorkspace({ schemaVersion: 3, workspaceId: 'import', revisionId: 'import', previousRevisionId: null,
        createdAt: '2000-01-01T00:00:00.000Z', settings: { userLogin: 'import', userAvatar: '', authVersion: 1, tokenVersion: 1 },
        profiles, assets, builds: {}, sync: { status: 'never' } });
      projected = { profiles: converted.profiles, assets: converted.assets, metadata: converted.metadata! };
    } catch (error) { throw new SyncTreeValidationError('INVALID_SCHEMA', '$', error instanceof Error ? error.message : 'Legacy metadata migration failed'); }
  }
  return { ...projected, formatVersion, warnings, files: rawFiles,
    contentHash: await hashSyncFiles(semanticFiles), serializedHash: await hashSyncFiles(rawFiles) };
}
