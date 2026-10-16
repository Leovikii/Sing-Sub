import type { MetadataCommand, WorkspaceSnapshot } from '../../../shared';
import { executeWorkspaceCommand } from './execute-workspace-command';
import type { WorkspaceStore } from '../ports/workspace-store';
import { markSyncLocalChange } from '../../domain/sync/sync-state';
import { normalizeWorkspace, profilePath } from '../../lib/workspace-metadata';

export function saveMetadata(store: WorkspaceStore<WorkspaceSnapshot>, command: MetadataCommand & {
  workspaceId: string; revisionId: string; createdAt: string;
}) {
  return executeWorkspaceCommand(store, {
    workspaceId: command.workspaceId, expectedRevision: command.expectedRevision,
    update: source => {
      const snapshot = normalizeWorkspace(source);
      const entities = snapshot.metadata!.entities;
      if (command.operation === 'order') {
        const paths = Object.keys(entities).filter(path => path.startsWith(`sing-sub/${command.kind}/`));
        if (new Set(command.paths).size !== command.paths.length || paths.length !== command.paths.length || command.paths.some(path => !paths.includes(path))) throw new RangeError('Order must contain every entity of one kind exactly once');
        command.paths.forEach((path, index) => { entities[path].order = index; });
        if (command.kind === 'configs') snapshot.profiles.forEach(profile => { profile.order = entities[profilePath(profile.name)].order!; });
      } else {
        const asset = Object.values(snapshot.assets.templates).find(item => item.path === command.path);
        if (!asset || !entities[command.path] || new Set(command.outboundOrder).size !== command.outboundOrder.length) throw new RangeError('Invalid template display order');
        const content = asset.content as { outbounds?: Array<{ tag?: string; type?: string }> };
        const tags = (content.outbounds ?? []).filter(item => ['selector', 'urltest'].includes(item.type ?? '')).map(item => item.tag).filter((tag): tag is string => Boolean(tag));
        if (command.outboundOrder.some(tag => !tags.includes(tag))) throw new RangeError('Unknown outbound tag');
        entities[command.path].display = { outboundOrder: command.outboundOrder };
      }
      return { ...snapshot, revisionId: command.revisionId, previousRevisionId: command.expectedRevision,
        createdAt: command.createdAt, sync: markSyncLocalChange(snapshot.sync, command.createdAt) };
    },
  });
}
