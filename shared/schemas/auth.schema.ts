import { z } from 'zod';

export const repositoryCoordinatesSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
}).strict();

export const loginRequestSchema = z.object({
  adminPassword: z.string().min(1),
}).strict();

export const updateSettingsRequestSchema = z.object({
  expectedRevision: z.string().min(1),
  rotateSubscriptionToken: z.boolean(),
}).strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
