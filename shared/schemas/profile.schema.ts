import { z } from 'zod';

export const SAFE_ENTITY_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export const filterActionSchema = z.object({
  action: z.enum(['include', 'exclude']),
  keyword: z.string(),
}).strict();

export const outboundRuleSchema = z.object({
  group: z.string(),
  filters: z.array(filterActionSchema),
}).strict();

export const inboundRuleSchema = z.object({
  tag: z.string(),
  filters: z.array(filterActionSchema),
}).strict();

export const profileSchema = z.object({
  name: z.string().regex(SAFE_ENTITY_NAME),
  note: z.string().optional(),
  templateUrl: z.string().refine(value => !/^https?:\/\//i.test(value), {
    message: 'External templates are not supported',
  }),
  patchUrl: z.string().optional(),
  nodesPath: z.string(),
  rules: z.array(outboundRuleSchema),
  inboundRules: z.array(inboundRuleSchema),
  overrides: z.record(z.string(), z.unknown()).optional(),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
  order: z.number().int().nonnegative(),
}).strict();

export const stateDataSchema = z.object({
  profiles: z.array(profileSchema),
}).strict().superRefine(({ profiles }, context) => {
  const names = new Set<string>();
  for (const [index, profile] of profiles.entries()) {
    if (names.has(profile.name)) {
      context.addIssue({
        code: 'custom',
        path: ['profiles', index, 'name'],
        message: `Duplicate profile name: ${profile.name}`,
      });
    }
    names.add(profile.name);
  }
});

export const putStateRequestSchema = z.object({
  state: stateDataSchema,
  expectedRevision: z.string().min(1),
  profileName: z.string().regex(SAFE_ENTITY_NAME).optional(),
  oldProfileName: z.string().regex(SAFE_ENTITY_NAME).optional(),
}).strict();

export type FilterAction = z.infer<typeof filterActionSchema>;
export type OutboundRule = z.infer<typeof outboundRuleSchema>;
export type InboundRule = z.infer<typeof inboundRuleSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type StateData = z.infer<typeof stateDataSchema>;
export type PutStateRequest = z.infer<typeof putStateRequestSchema>;
