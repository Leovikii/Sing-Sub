import type { Env } from './types';
import {
  handleLogin, handleLogout, handleGetSettings, handlePutSettings, handleDeleteSettings,
} from './routes/auth';
import {
  handleGetState, handlePutState, handleRebuild, handlePreview,
} from './routes/profiles';
import { handleGetAssets, handleGetFile, handleGetTemplate } from './routes/assets';
import { handlePutFile, handleDeleteFile } from './routes/rulesets';
import { handleSubscription, handleRuleset } from './routes/sub';
import { addSecurityHeaders, errorResponse } from './lib/security';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    let response: Response;

    try {
      if (path === '/api/login' && method === 'POST') {
        response = await handleLogin(request, env);
      } else if (path === '/api/logout' && method === 'POST') {
        response = await handleLogout(request, env);
      } else if (path === '/api/settings' && method === 'GET') {
        response = await handleGetSettings(request, env);
      } else if (path === '/api/settings' && method === 'PUT') {
        response = await handlePutSettings(request, env);
      } else if (path === '/api/settings' && method === 'DELETE') {
        response = await handleDeleteSettings(request, env);
      } else if (path === '/api/state' && method === 'GET') {
        response = await handleGetState(request, env);
      } else if (path === '/api/state' && method === 'PUT') {
        response = await handlePutState(request, env);
      } else if (path === '/api/rebuild' && method === 'POST') {
        response = await handleRebuild(request, env);
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
        response = await handlePutFile(request, env);
      } else if (path === '/api/file' && method === 'DELETE') {
        response = await handleDeleteFile(request, env);

      } else if (path.startsWith('/sub/') && path.endsWith('.json') && method === 'GET') {
        const parts = path.slice(5, -5).split('/');
        if (parts.length === 2) {
          response = await handleSubscription(request, env, parts[0], parts[1]);
        } else {
          response = errorResponse('Invalid subscription URL', 400);
        }
      } else if (path.startsWith('/rules/') && path.endsWith('.srs') && method === 'GET') {
        const parts = path.slice(7, -4).split('/');
        if (parts.length === 2) {
          response = await handleRuleset(request, env, parts[0], parts[1]);
        } else {
          response = errorResponse('Invalid ruleset URL', 400);
        }
      } else if (path.startsWith('/api/') || path.startsWith('/sub/') || path.startsWith('/rules/')) {
        response = errorResponse('Not found', 404);
      } else {
        return new Response(null, { status: 404 });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Internal server error';
      response = errorResponse(message, 500);
    }

    return addSecurityHeaders(response);
  },
}
