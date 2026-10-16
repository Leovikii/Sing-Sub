import { metadataCommandSchema } from '../../shared';
import { saveMetadata } from '../application/commands/save-metadata';
import { createPrimaryWorkspaceServices } from '../composition/primary-workspace-services';
import { requirePrimaryWorkspaceAuth } from '../http/authenticate';
import { errorResponse, jsonResponse } from '../lib/security';
import type { Env } from '../types';

export async function handlePutMetadata(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const parsed = metadataCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse('Invalid metadata command', 400, 'VALIDATION_FAILED');
  try {
    const result = await saveMetadata(createPrimaryWorkspaceServices(env).workspaceStore, {
      ...parsed.data, workspaceId: auth.workspaceId, revisionId: crypto.randomUUID(), createdAt: new Date().toISOString(),
    });
    return jsonResponse({ revision: result.revision });
  } catch (error) {
    if (error instanceof RangeError) return errorResponse('Invalid metadata target or order', 400, 'VALIDATION_FAILED');
    throw error;
  }
}
