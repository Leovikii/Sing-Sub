import { profileSchema, putStateRequestSchema } from '../../shared';
import { saveProfiles } from '../application/commands/profiles/save-profiles';
import { createPrimaryWorkspaceServices } from '../composition/primary-workspace-services';
import { requirePrimaryWorkspaceAuth } from '../http/authenticate';
import { buildProfileFromWorkspace } from '../lib/workspace-builder';
import { errorResponse, jsonResponse } from '../lib/security';
import type { Env } from '../types';

export async function handleGetState(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  return jsonResponse({ state: { profiles: auth.snapshot.profiles }, revision: auth.revision });
}

export async function handlePutState(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const parsed = putStateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse('Invalid profile state', 400, 'VALIDATION_FAILED');

  const result = await saveProfiles(createPrimaryWorkspaceServices(env).workspaceStore, {
    workspaceId: auth.workspaceId,
    expectedRevision: parsed.data.expectedRevision,
    revisionId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    state: parsed.data.state,
  });
  return jsonResponse({ revision: result.revision });
}

export async function handlePreview(request: Request, env: Env, name: string): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  let profile;
  if (request.method === 'POST') {
    const parsed = profileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse('Invalid profile', 400, 'VALIDATION_FAILED');
    profile = parsed.data;
  } else {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
      return errorResponse('Invalid profile name', 400, 'VALIDATION_FAILED');
    }
    profile = auth.snapshot.profiles.find(candidate => candidate.name === name);
    if (!profile) return errorResponse('Profile not found', 404, 'NOT_FOUND');
  }
  try {
    return jsonResponse({
      content: await buildProfileFromWorkspace(profile, auth.snapshot, new URL(request.url).origin),
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Profile build failed',
      400,
      'VALIDATION_FAILED',
    );
  }
}
