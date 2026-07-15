import { z } from 'zod';

const opaqueIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const syncPathSchema = z.string().regex(
  /^sing-sub\/(?:configs|nodes|templates|patches|rulesets)\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.json$/,
);

export const syncManifestFileSchema = z.object({
  path: syncPathSchema,
  contentHash: sha256Schema,
  size: z.number().int().nonnegative(),
}).strict();

export const syncManifestSchema = z.object({
  schemaVersion: z.literal(1),
  format: z.literal('sing-sub-editable-sync'),
  workspaceId: opaqueIdSchema,
  workspaceRevision: opaqueIdSchema,
  baseRemoteRevision: z.string().min(1).nullable(),
  exportedAt: z.iso.datetime(),
  contentHash: sha256Schema,
  files: z.array(syncManifestFileSchema),
}).strict().superRefine((manifest, context) => {
  const paths = new Set<string>();
  for (const [index, file] of manifest.files.entries()) {
    if (paths.has(file.path)) {
      context.addIssue({ code: 'custom', path: ['files', index, 'path'], message: 'Duplicate sync path' });
    }
    paths.add(file.path);
  }
  const sorted = [...manifest.files].sort((left, right) => left.path.localeCompare(right.path));
  if (manifest.files.some((file, index) => file.path !== sorted[index].path)) {
    context.addIssue({ code: 'custom', path: ['files'], message: 'Manifest files must be sorted by path' });
  }
});

export type SyncManifestFile = z.infer<typeof syncManifestFileSchema>;
export type SyncManifest = z.infer<typeof syncManifestSchema>;
