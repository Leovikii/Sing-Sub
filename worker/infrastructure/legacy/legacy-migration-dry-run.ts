import { jsonAssetSchema, profileSchema, type Profile } from '../../../shared';
import type {
  GithubImportSettings,
  NormalizedLegacyWorkspace,
} from '../../application/migration/legacy-migration-model';
import type { LegacyGithubSource } from '../../application/ports/legacy-source-reader';
import { parseLegacyManagedPath } from '../../domain/migration/legacy-managed-path';
import { validateRulesetSource } from '../../lib/rulesets';

export type MigrationIssueSeverity = 'error' | 'warning';

export interface LegacyMigrationIssue {
  severity: MigrationIssueSeverity;
  code: 'SOURCE_MISMATCH' | 'INVALID_JSON' | 'INVALID_SCHEMA' | 'NAME_MISMATCH' |
    'NAME_COLLISION' | 'MISSING_REFERENCE' | 'DUPLICATE_ORDER';
  path: string;
  message: string;
}

export interface LegacyMigrationDryRunResult {
  valid: boolean;
  fileCount: number;
  totalBytes: number;
  counts: {
    profiles: number;
    nodes: number;
    templates: number;
    patches: number;
    rulesets: number;
  };
  issues: LegacyMigrationIssue[];
  normalized?: NormalizedLegacyWorkspace;
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

export function dryRunLegacyMigration(
  source: LegacyGithubSource,
  settings: GithubImportSettings,
): LegacyMigrationDryRunResult {
  const issues: LegacyMigrationIssue[] = [];
  const profiles: Profile[] = [];
  const assets: NormalizedLegacyWorkspace['assets'] = {
    nodes: {}, templates: {}, patches: {}, rulesets: {},
  };
  const seenNames = new Map<string, string>();

  if (source.owner !== settings.owner || source.repo !== settings.repo || source.branch !== settings.defaultBranch) {
    issues.push({
      severity: 'error',
      code: 'SOURCE_MISMATCH',
      path: '$',
      message: 'GitHub snapshot and import settings identify different repository sources',
    });
  }

  for (const file of source.files) {
    const managed = parseLegacyManagedPath(file.path);
    if (!managed) continue;
    const collisionKey = `${managed.kind}:${managed.entityId.toLowerCase()}`;
    const previousPath = seenNames.get(collisionKey);
    if (previousPath) {
      issues.push({
        severity: 'error',
        code: 'NAME_COLLISION',
        path: file.path,
        message: `Case-insensitive name collision with ${previousPath}`,
      });
      continue;
    }
    seenNames.set(collisionKey, file.path);

    let json: unknown;
    try {
      json = JSON.parse(file.content);
    } catch {
      issues.push({ severity: 'error', code: 'INVALID_JSON', path: file.path, message: 'File is not valid JSON' });
      continue;
    }

    if (managed.kind === 'configs') {
      const profile = profileSchema.safeParse(json);
      if (!profile.success) {
        issues.push({ severity: 'error', code: 'INVALID_SCHEMA', path: file.path, message: 'Profile schema is invalid' });
        continue;
      }
      if (profile.data.name !== managed.entityId) {
        issues.push({
          severity: 'error',
          code: 'NAME_MISMATCH',
          path: file.path,
          message: `Profile name ${profile.data.name} does not match filename ${managed.entityId}`,
        });
        continue;
      }
      profiles.push(profile.data);
      continue;
    }

    if (!json || typeof json !== 'object' ||
        ((managed.kind === 'templates' || managed.kind === 'patches' || managed.kind === 'rulesets') && Array.isArray(json))) {
      issues.push({ severity: 'error', code: 'INVALID_SCHEMA', path: file.path, message: 'Asset JSON root is invalid' });
      continue;
    }
    if (managed.kind === 'rulesets') {
      const rulesetError = validateRulesetSource(file.content);
      if (rulesetError) {
        issues.push({ severity: 'error', code: 'INVALID_SCHEMA', path: file.path, message: rulesetError });
        continue;
      }
    }
    const asset = jsonAssetSchema.safeParse({
      path: file.path,
      note: noteFromJson(json),
      content: json,
    });
    if (!asset.success) {
      issues.push({ severity: 'error', code: 'INVALID_SCHEMA', path: file.path, message: 'Asset schema is invalid' });
      continue;
    }
    assets[managed.kind][managed.entityId] = asset.data;
  }

  profiles.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  const seenOrders = new Set<number>();
  for (const profile of profiles) {
    if (seenOrders.has(profile.order)) {
      issues.push({
        severity: 'warning',
        code: 'DUPLICATE_ORDER',
        path: `sing-sub/configs/${profile.name}.json`,
        message: `Profile order ${profile.order} is duplicated`,
      });
    }
    seenOrders.add(profile.order);
    const references = [
      ['nodesPath', profile.nodesPath],
      ['templateUrl', profile.templateUrl],
      ['patchUrl', profile.patchUrl],
    ] as const;
    for (const [field, reference] of references) {
      if (!reference || /^https?:\/\//i.test(reference) || reference === 'custom') continue;
      if (!source.files.some(file => file.path === reference)) {
        issues.push({
          severity: 'error',
          code: 'MISSING_REFERENCE',
          path: `sing-sub/configs/${profile.name}.json`,
          message: `${field} references missing file ${reference}`,
        });
      }
    }
  }

  const counts = {
    profiles: profiles.length,
    nodes: Object.keys(assets.nodes).length,
    templates: Object.keys(assets.templates).length,
    patches: Object.keys(assets.patches).length,
    rulesets: Object.keys(assets.rulesets).length,
  };
  const valid = !issues.some(issue => issue.severity === 'error');
  return {
    valid,
    fileCount: source.files.length,
    totalBytes: source.files.reduce((total, file) => total + file.size, 0),
    counts,
    issues,
    ...(valid ? { normalized: { source, settings, profiles, assets } } : {}),
  };
}
