import type { WorkspaceSnapshot } from '../../shared';

export function legacySnapshot(): WorkspaceSnapshot {
  return { schemaVersion: 3, workspaceId: 'primary', revisionId: 'r1', previousRevisionId: null,
    createdAt: '2026-10-16T00:00:00.000Z', settings: { userLogin: 'admin', userAvatar: '', authVersion: 1, tokenVersion: 1 },
    profiles: [{ name: 'home', templateUrl: '', nodesPath: '', rules: [], inboundRules: [], note: 'private-profile', order: 2, created_at: 1234567890123, updated_at: 1234567890124 }],
    assets: { nodes: {}, templates: { base: { path: 'sing-sub/templates/base.json', note: 'private-root', updatedAt: '2026-10-15T00:00:00.000Z',
      content: { note: 'private-root', outbounds: [{ tag: 'proxy', note: 'private-child', type: 'direct', transport: { headers: { note: 'business', _sing_sub: 'business' } } }] } } }, rulesets: {} },
    builds: {}, sync: { status: 'never' } };
}
