import { z } from 'zod';

export const repositoryCoordinatesSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
}).strict();

export const loginRequestSchema = z.object({
  adminPassword: z.string().min(1),
  owner: z.string().min(1).optional(),
  repo: z.string().min(1).optional(),
  pat: z.string().min(1).optional(),
}).strict().superRefine((value, context) => {
  const setupFields = [value.owner, value.repo, value.pat];
  if (setupFields.some(Boolean) && !setupFields.every(Boolean)) {
    context.addIssue({ code: 'custom', path: ['owner'], message: 'Setup repository fields must be provided together' });
  }
});

export const updateSettingsRequestSchema = z.object({
  expectedRevision: z.string().min(1),
  rotateSubscriptionToken: z.boolean(),
}).strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
