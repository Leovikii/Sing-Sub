import { z } from 'zod';

export const entityPathSchema = z.string().regex(/^sing-sub\/(configs|nodes|templates|rulesets)\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.json$/);
const bucketSchema = z.object({
  domain: z.array(z.string()).optional(),
  domain_suffix: z.array(z.string()).optional(),
  domain_keyword: z.array(z.string()).optional(),
  domain_regex: z.array(z.string()).optional(),
}).strict();
export const rulesetEditorSchema = z.object({
  manual: bucketSchema,
  sources: z.array(z.object({
    url: z.url().refine(value => {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
    }),
    intervalHours: z.union([z.literal(0), z.literal(24), z.literal(168), z.literal(720), z.literal(8760)]),
    lastFetchedAt: z.iso.datetime().optional(),
  }).strict()).refine(sources => new Set(sources.map(source => source.url)).size === sources.length),
  needsReview: z.boolean().optional(),
}).strict();
export const entityMetadataSchema = z.object({
  note: z.string().optional(),
  order: z.number().int().nonnegative().optional(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
  display: z.object({ outboundOrder: z.array(z.string().min(1)).refine(tags => new Set(tags).size === tags.length) }).strict().optional(),
  editor: z.object({
    ruleset: rulesetEditorSchema.optional(),
    annotations: z.array(z.object({
      direction: z.enum(['inbound', 'outbound']), tag: z.string().min(1), note: z.string(),
    }).strict()).refine(items => new Set(items.map(item => `${item.direction}:${item.tag}`)).size === items.length).optional(),
  }).strict().optional(),
}).strict();
export type EntityMetadata = z.infer<typeof entityMetadataSchema>;

function validateKinds(document: { entities: Record<string, EntityMetadata> }, context: z.RefinementCtx) {
  const paths = new Set<string>();
  for (const [path, metadata] of Object.entries(document.entities)) {
    const kind = path.split('/')[1];
    if (paths.has(path.toLowerCase()) || (metadata.display && kind !== 'templates') ||
        (metadata.editor?.ruleset && kind !== 'rulesets') ||
        (metadata.editor?.annotations && !['nodes', 'templates'].includes(kind)) ||
        (metadata.createdAt && kind !== 'configs')) {
      context.addIssue({ code: 'custom', path: ['entities', path], message: 'Invalid metadata kind or duplicate identity' });
    }
    paths.add(path.toLowerCase());
  }
}
export const workspaceMetadataSchema = z.object({
  schemaVersion: z.literal(1), entities: z.record(entityPathSchema, entityMetadataSchema),
}).strict().superRefine(validateKinds);
export const portableMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  entities: z.record(entityPathSchema, entityMetadataSchema.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) })),
}).strict().superRefine(validateKinds);
export type WorkspaceMetadata = z.infer<typeof workspaceMetadataSchema>;
export type PortableMetadata = z.infer<typeof portableMetadataSchema>;

export const metadataCommandSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('order'), kind: z.enum(['configs', 'nodes', 'templates', 'rulesets']), paths: z.array(entityPathSchema), expectedRevision: z.string().min(1) }).strict(),
  z.object({ operation: z.literal('display'), path: entityPathSchema, outboundOrder: z.array(z.string().min(1)), expectedRevision: z.string().min(1) }).strict(),
]);
export type MetadataCommand = z.infer<typeof metadataCommandSchema>;
export const entityEditMetadataSchema = entityMetadataSchema.pick({ note: true, editor: true });
export type EntityEditMetadata = z.infer<typeof entityEditMetadataSchema>;
