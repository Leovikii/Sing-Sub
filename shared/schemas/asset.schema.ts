import { z } from 'zod';

export const putFileRequestSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  expectedRevision: z.string().min(1),
  sha: z.string().nullable().optional(),
  oldPath: z.string().optional(),
  message: z.string().optional(),
}).strict();

export type PutFileRequest = z.infer<typeof putFileRequestSchema>;
