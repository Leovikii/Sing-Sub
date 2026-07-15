import { z } from 'zod';

const repositorySegmentSchema = z.string().regex(/^[a-zA-Z0-9_.-]+$/).refine(
  value => value !== '.' && value !== '..',
  'Invalid repository segment',
);

export const githubSyncConnectionRequestSchema = z.object({
  owner: repositorySegmentSchema,
  repo: repositorySegmentSchema,
  pat: z.string().min(1),
}).strict();

export const syncOperationRequestSchema = z.object({
  expectedRevision: z.string().min(1),
  resolution: z.enum(['safe', 'overwrite']).default('safe'),
}).strict();

export type GithubSyncConnectionRequest = z.infer<typeof githubSyncConnectionRequestSchema>;
export type SyncOperationRequest = z.infer<typeof syncOperationRequestSchema>;
