import { z } from 'zod';
import {
  completeSrsBuild,
  failSrsBuild,
  readSrsBuildSource,
  SrsBuildNotFoundError,
  SrsBuildStateError,
  SrsBuildValidationError,
} from '../application/srs/manage-srs-build';
import { createSrsBuildStores } from '../composition/srs-compiler-services';
import { createSrsJobTicketService } from '../composition/srs-compiler-services';
import { PRIMARY_WORKSPACE_ID } from '../domain/workspace/primary-workspace';
import type { SrsJobOperation } from '../application/ports/srs-job-ticket-service';
import { errorResponse, jsonResponse } from '../lib/security';
import { requestIdFor } from '../lib/logging';
import type { Env } from '../types';

const MAX_SRS_BYTES = 2 * 1024 * 1024;
const MAX_FAILURE_BYTES = 8 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const failureSchema = z.object({
  compilerVersion: z.string().min(1).max(64),
  reason: z.string().min(1).max(1024),
}).strict();

async function authenticate(
  request: Request,
  env: Env,
  jobId: string,
  operation: SrsJobOperation,
  requestId: string,
): Promise<Response | null> {
  const match = request.headers.get('Authorization')?.match(/^Bearer (.+)$/);
  if (!match) return errorResponse('Invalid job ticket', 401, 'NOT_AUTHENTICATED', requestId);
  const valid = await createSrsJobTicketService(env).verify(match[1], {
    workspaceId: PRIMARY_WORKSPACE_ID,
    jobId,
    operation,
  });
  return valid ? null : errorResponse('Invalid job ticket', 401, 'NOT_AUTHENTICATED', requestId);
}

async function readBodyLimited(request: Request, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('Content-Length') || '0');
  if (!Number.isFinite(declared) || declared < 0 || declared > limit) {
    throw new SrsBuildValidationError('Callback body exceeds the size limit');
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new SrsBuildValidationError('Callback body exceeds the size limit');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function callbackError(error: unknown, requestId: string): Response {
  if (error instanceof SrsBuildNotFoundError) {
    return errorResponse('Build job not found', 404, 'NOT_FOUND', requestId);
  }
  if (error instanceof SrsBuildValidationError) {
    return errorResponse(error.message, 400, 'VALIDATION_FAILED', requestId);
  }
  if (error instanceof SrsBuildStateError) {
    return errorResponse(error.message, 409, 'BUILD_FAILED', requestId);
  }
  throw error;
}

export async function handleSrsJobSource(request: Request, env: Env, jobId: string): Promise<Response> {
  const requestId = requestIdFor(request) || crypto.randomUUID();
  const rejected = await authenticate(request, env, jobId, 'source', requestId);
  if (rejected) return rejected;
  try {
    const result = await readSrsBuildSource(createSrsBuildStores(env), PRIMARY_WORKSPACE_ID, jobId);
    return new Response(result.source, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Sing-Box-Version': result.compilerVersion,
        'X-Request-ID': requestId,
      },
    });
  } catch (error) {
    return callbackError(error, requestId);
  }
}

export async function handleSrsJobComplete(request: Request, env: Env, jobId: string): Promise<Response> {
  const requestId = requestIdFor(request) || crypto.randomUUID();
  const rejected = await authenticate(request, env, jobId, 'complete', requestId);
  if (rejected) return rejected;
  try {
    const contentHash = request.headers.get('X-SRS-SHA256') || '';
    const compilerVersion = request.headers.get('X-Sing-Box-Version') || '';
    if (!SHA256.test(contentHash) || !compilerVersion) {
      throw new SrsBuildValidationError('Artifact callback headers are invalid');
    }
    const content = await readBodyLimited(request, MAX_SRS_BYTES);
    if (!content.byteLength) throw new SrsBuildValidationError('Artifact body is empty');
    const result = await completeSrsBuild(createSrsBuildStores(env), {
      workspaceId: PRIMARY_WORKSPACE_ID,
      jobId,
      compilerVersion,
      contentHash,
      content,
    });
    return jsonResponse(result, result.status === 'superseded' ? 202 : 200, { 'X-Request-ID': requestId });
  } catch (error) {
    return callbackError(error, requestId);
  }
}

export async function handleSrsJobFailed(request: Request, env: Env, jobId: string): Promise<Response> {
  const requestId = requestIdFor(request) || crypto.randomUUID();
  const rejected = await authenticate(request, env, jobId, 'failed', requestId);
  if (rejected) return rejected;
  try {
    const body = await readBodyLimited(request, MAX_FAILURE_BYTES);
    const parsed = failureSchema.safeParse(JSON.parse(new TextDecoder().decode(body)));
    if (!parsed.success) throw new SrsBuildValidationError('Failure callback body is invalid');
    const status = await failSrsBuild(
      createSrsBuildStores(env),
      PRIMARY_WORKSPACE_ID,
      jobId,
      parsed.data.compilerVersion,
    );
    return jsonResponse({ status }, status === 'superseded' ? 202 : 200, { 'X-Request-ID': requestId });
  } catch (error) {
    if (error instanceof SyntaxError) return callbackError(new SrsBuildValidationError('Failure callback body is invalid'), requestId);
    return callbackError(error, requestId);
  }
}
