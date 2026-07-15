import { z } from 'zod';

const safePathSegmentSchema = z.string().min(1).max(127).regex(/^[a-zA-Z0-9._-]+$/);
const primitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const matchSchema = z.record(z.string().min(1), primitiveSchema).refine(
  value => Object.keys(value).length > 0,
  { message: 'Adapter match must contain at least one field' },
);

export const adapterReplacementSchema = z.object({
  path: z.array(safePathSegmentSchema).min(1).max(16),
  match: matchSchema.optional(),
  value: z.json(),
}).strict();

export const adapterPresetSchema = z.object({
  schemaVersion: z.literal(1),
  name: safePathSegmentSchema,
  note: z.string().optional(),
  replacements: z.array(adapterReplacementSchema).min(1).max(32),
}).strict();

export type AdapterReplacement = z.infer<typeof adapterReplacementSchema>;
export type AdapterPreset = z.infer<typeof adapterPresetSchema>;
