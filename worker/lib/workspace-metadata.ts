import {
  persistedWorkspaceSnapshotSchema,
  type EntityMetadata, type JsonAsset, type PersistedWorkspaceSnapshot, type Profile,
  type ProfileDefinition, type WorkspaceMetadata, type WorkspaceSnapshot,
} from '../../shared';
import { splitLegacyAsset as splitAsset } from '../compat/v3.1.6/legacy-metadata';

export function profilePath(name: string): string { return `sing-sub/configs/${name}.json`; }
export function pureProfile(profile: Profile | ProfileDefinition): ProfileDefinition {
  // Destructure only known management fields; preserve business field order.
  const definition = { ...profile } as Record<string, unknown>;
  for (const key of ['note', 'order', 'created_at', 'updated_at']) delete definition[key];
  return definition as ProfileDefinition;
}
function timestamp(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) throw new Error('Invalid legacy profile timestamp');
  return new Date(value).toISOString();
}
export function projectProfile(definition: ProfileDefinition, metadata: EntityMetadata = {}): Profile {
  return { ...definition, ...(metadata.note !== undefined ? { note: metadata.note } : {}),
    order: metadata.order ?? 0,
    ...(metadata.createdAt ? { created_at: Date.parse(metadata.createdAt) } : {}),
    ...(metadata.updatedAt ? { updated_at: Date.parse(metadata.updatedAt) } : {}),
  };
}
// One temporary entry point, with no legacy checks in feature code.
export { splitLegacyAsset as splitAsset } from '../compat/v3.1.6/legacy-metadata';

export function separateWorkspace(source: Pick<WorkspaceSnapshot, 'profiles' | 'assets' | 'metadata'>): {
  profiles: ProfileDefinition[]; assets: PersistedWorkspaceSnapshot['assets']; metadata: WorkspaceMetadata;
} {
  const metadata: WorkspaceMetadata = { schemaVersion: 1, entities: {} };
  const profiles = source.profiles.map(profile => {
    const path = profilePath(profile.name);
    const previous = source.metadata?.entities[path] ?? {};
    metadata.entities[path] = { ...previous,
      ...(profile.note !== undefined ? { note: profile.note } : {}),
      order: profile.order,
      ...(profile.created_at !== undefined ? { createdAt: timestamp(profile.created_at) } : {}),
      ...(profile.updated_at !== undefined ? { updatedAt: timestamp(profile.updated_at) } : {}),
    };
    return pureProfile(profile);
  });
  const assets: PersistedWorkspaceSnapshot['assets'] = { nodes: {}, templates: {}, rulesets: {} };
  for (const kind of ['nodes', 'templates', 'rulesets'] as const) {
    for (const [id, asset] of Object.entries(source.assets[kind])) {
      const split = splitAsset(asset, source.metadata?.entities[asset.path]);
      assets[kind][id] = split.asset;
      metadata.entities[asset.path] = split.metadata;
    }
  }
  return { profiles, assets, metadata };
}
export function persistWorkspace(source: WorkspaceSnapshot): PersistedWorkspaceSnapshot {
  const result = { ...source, schemaVersion: 4 as const, ...separateWorkspace(source) };
  persistedWorkspaceSnapshotSchema.parse(result);
  return result;
}
export function projectWorkspace(source: PersistedWorkspaceSnapshot): WorkspaceSnapshot {
  const profiles = source.profiles.map(profile => projectProfile(profile, source.metadata.entities[profilePath(profile.name)]));
  const assets = Object.fromEntries(Object.entries(source.assets).map(([kind, collection]) => [kind, Object.fromEntries(Object.entries(collection).map(([id, asset]) => [id, { ...asset }]))])) as WorkspaceSnapshot['assets'];
  for (const collection of Object.values(assets)) for (const asset of Object.values(collection)) {
    const metadata = source.metadata.entities[asset.path] ?? {};
    if (metadata.note !== undefined) asset.note = metadata.note;
    if (metadata.updatedAt) asset.updatedAt = metadata.updatedAt;
  }
  return { ...source, profiles, assets };
}
export function normalizeWorkspace(source: WorkspaceSnapshot): WorkspaceSnapshot {
  return source.schemaVersion === 4 && source.metadata ? source : projectWorkspace(persistWorkspace(source));
}
export function nextOrder(snapshot: WorkspaceSnapshot, kind: string): number {
  const values = Object.entries(snapshot.metadata?.entities ?? {}).filter(([path]) => path.startsWith(`sing-sub/${kind}/`));
  let last = Math.max(-1, ...values.map(([, metadata]) => metadata.order ?? -1));
  values.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  for (const [, metadata] of values) if (metadata.order === undefined) metadata.order = ++last;
  return last + 1;
}
// Observed fetch times do not count as editing the source definition.
export function editableMetadata(metadata: EntityMetadata): unknown {
  return { note: metadata.note ?? '', editor: metadata.editor ? { ...metadata.editor,
    ...(metadata.editor.ruleset ? { ruleset: { manual: metadata.editor.ruleset.manual,
      sources: metadata.editor.ruleset.sources.map(({ url, intervalHours }) => ({ url, intervalHours })),
      needsReview: metadata.editor.ruleset.needsReview,
    } } : {}),
  } : undefined };
}
export function updateAssetMetadata(snapshot: WorkspaceSnapshot, path: string, oldPath: string | undefined,
  incoming: JsonAsset, edit: EntityMetadata | undefined, now: string): JsonAsset {
  const previousPath = oldPath ?? path;
  const previous = Object.values(snapshot.assets).flatMap(collection => Object.values(collection)).find(asset => asset.path === previousPath);
  const metadata = snapshot.metadata ??= { schemaVersion: 1, entities: {} };
  const previousMeta = metadata.entities[previousPath] ?? {};
  const split = splitAsset(incoming, { ...previousMeta, ...edit });
  const changed = !previous || path !== previousPath || JSON.stringify(previous.content) !== JSON.stringify(split.asset.content) ||
    JSON.stringify(editableMetadata(previousMeta)) !== JSON.stringify(editableMetadata(split.metadata));
  if (changed) split.metadata.updatedAt = now;
  else if (previousMeta.updatedAt) split.metadata.updatedAt = previousMeta.updatedAt;
  else delete split.metadata.updatedAt;
  split.metadata.order ??= nextOrder(snapshot, path.split('/')[1]);
  delete metadata.entities[previousPath];
  metadata.entities[path] = split.metadata;
  return { ...split.asset, ...(split.metadata.note !== undefined ? { note: split.metadata.note } : {}),
    ...(split.metadata.updatedAt ? { updatedAt: split.metadata.updatedAt } : {}) };
}

export function dryRunMetadataMigration(source: WorkspaceSnapshot): { snapshot?: PersistedWorkspaceSnapshot; errors: string[] } {
  const errors: string[] = [];
  for (const collection of Object.values(source.assets)) for (const asset of Object.values(collection)) {
    try { splitAsset(asset, source.metadata?.entities[asset.path]); }
    catch (error) { errors.push(error instanceof Error ? error.message : `${asset.path}: invalid metadata`); }
  }
  if (errors.length) return { errors };
  try { return { snapshot: persistWorkspace(source), errors: [] }; }
  catch (error) { return { errors: [error instanceof Error ? error.message : 'Invalid metadata'] }; }
}
