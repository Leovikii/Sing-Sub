import type { Env } from './types';
import { handleLogin, handleLogout, handleBootstrap, handleGetSettings, handlePutSettings } from './routes/auth';
import { handleGetState, handlePutState, handlePreview } from './routes/profiles';
import { handleGetAssets, handleGetFile, handleGetTemplate } from './routes/assets';
import { handlePutFile, handleDeleteFile } from './routes/rulesets';
import { handleSubscription, handleRuleset, handleRulesetJson } from './routes/sub';
import {
  handleSrsJobComplete,
  handleSrsJobFailed,
  handleSrsJobSource,
} from './routes/srs-jobs';
import { handleGetRulesetBuild, handleRetryRulesetBuild } from './routes/ruleset-builds';
import { handleGetSrsCompiler, handlePutSrsCompiler } from './routes/srs-compiler';
import {
  handleDeleteGithubSyncConnection,
  handleGetGithubSync,
  handlePullGithubSync,
  handlePushGithubSync,
  handlePutGithubSyncConnection,
} from './routes/github-sync';
import { addSecurityHeaders, errorResponse } from './lib/security';
import { toErrorResponse } from './lib/http-errors';
import { createRequestId, logEvent, withRequestId } from './lib/logging';

export default {
  async fetch(request: Request, env: Env, context?: ExecutionContext): Promise<Response> {
    const requestId = createRequestId(request);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    let response: Response;

    try {
      if (path === '/api/bootstrap' && method === 'GET') {
        response = await handleBootstrap(request, env);
      } else if (path === '/api/login' && method === 'POST') {
        response = await handleLogin(request, env);
      } else if (path === '/api/logout' && method === 'POST') {
        response = await handleLogout(request, env);
      } else if (path === '/api/settings' && method === 'GET') {
        response = await handleGetSettings(request, env);
      } else if (path === '/api/settings' && method === 'PUT') {
        response = await handlePutSettings(request, env);
      } else if (path === '/api/srs-compiler' && method === 'GET') {
        response = await handleGetSrsCompiler(request, env);
      } else if (path === '/api/srs-compiler' && method === 'PUT') {
        response = await handlePutSrsCompiler(request, env, context);
      } else if (path === '/api/github-sync' && method === 'GET') {
        response = await handleGetGithubSync(request, env);
      } else if (path === '/api/github-sync/connection' && method === 'PUT') {
        response = await handlePutGithubSyncConnection(request, env);
      } else if (path === '/api/github-sync/connection' && method === 'DELETE') {
        response = await handleDeleteGithubSyncConnection(request, env);
      } else if (path === '/api/github-sync/push' && method === 'POST') {
        response = await handlePushGithubSync(request, env);
      } else if (path === '/api/github-sync/pull' && method === 'POST') {
        response = await handlePullGithubSync(request, env, context);
      } else if (path === '/api/state' && method === 'GET') {
        response = await handleGetState(request, env);
      } else if (path === '/api/state' && method === 'PUT') {
        response = await handlePutState(request, env);
      } else if (path.startsWith('/api/preview/') && method === 'GET') {
        const name = path.slice(13).replace(/\.json$/, '');
        response = await handlePreview(request, env, name);
      } else if (path === '/api/preview' && method === 'POST') {
        response = await handlePreview(request, env, '');
      } else if (path === '/api/assets' && method === 'GET') {
        response = await handleGetAssets(request, env);
      } else if (path === '/api/file' && method === 'GET') {
        response = await handleGetFile(request, env);
      } else if (path === '/api/template' && method === 'GET') {
        response = await handleGetTemplate(request, env);
      } else if (path === '/api/file' && method === 'PUT') {
        response = await handlePutFile(request, env, context);
      } else if (path === '/api/file' && method === 'DELETE') {
        response = await handleDeleteFile(request, env);
      } else if (path.startsWith('/api/rulesets/') && path.endsWith('/build')) {
        const rulesetId = path.slice('/api/rulesets/'.length, -'/build'.length);
        if (!rulesetId || rulesetId.includes('/')) {
          response = errorResponse('Not found', 404);
        } else if (method === 'GET') {
          response = await handleGetRulesetBuild(request, env, rulesetId);
        } else if (method === 'POST') {
          response = await handleRetryRulesetBuild(request, env, rulesetId, context);
        } else {
          response = errorResponse('Not found', 404);
        }
      } else if (path.startsWith('/internal/srs-jobs/')) {
        const parts = path.slice('/internal/srs-jobs/'.length).split('/');
        const jobId = parts[0];
        const operation = parts[1];
        if (parts.length !== 2 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(jobId)) {
          response = errorResponse('Not found', 404);
        } else if (operation === 'source' && method === 'GET') {
          response = await handleSrsJobSource(request, env, jobId);
        } else if (operation === 'complete' && method === 'PUT') {
          response = await handleSrsJobComplete(request, env, jobId);
        } else if (operation === 'failed' && method === 'POST') {
          response = await handleSrsJobFailed(request, env, jobId);
        } else {
          response = errorResponse('Not found', 404);
        }
      } else if (path.startsWith('/sub/') && path.endsWith('.json') && method === 'GET') {
        const parts = path.slice(5, -5).split('/');
        if (parts.length === 2) {
          response = await handleSubscription(request, env, parts[0], parts[1]);
        } else {
          response = errorResponse('Invalid subscription URL', 400);
        }
      } else if (path.startsWith('/rules/') && path.endsWith('.srs') && method === 'GET') {
        const parts = path.slice(7, -4).split('/');
        if (parts.length === 1 && parts[0]) {
          response = await handleRuleset(request, env, parts[0]);
        } else {
          response = errorResponse('Not found', 404);
        }
      } else if (path.startsWith('/rules/') && path.endsWith('.json') && method === 'GET') {
        const parts = path.slice(7, -5).split('/');
        if (parts.length === 1 && parts[0]) {
          response = await handleRulesetJson(request, env, parts[0]);
        } else {
          response = errorResponse('Not found', 404);
        }
      } else if (path.startsWith('/api/') || path.startsWith('/sub/') || path.startsWith('/rules/')) {
        response = errorResponse('Not found', 404);
      } else {
        response = new Response(null, { status: 404 });
      }
    } catch (e) {
      response = toErrorResponse(e, requestId);
      if (response.status >= 500) {
        logEvent('error', { operation: 'worker.request', requestId, status: 'failed', path, method, errorCode: 'INTERNAL_ERROR' });
      }
    }

    return withRequestId(addSecurityHeaders(response), requestId);
  },
}
