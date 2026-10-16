import { stateDataSchema, type StateData, type WorkspaceSnapshot } from '../../../../shared';
import { executeWorkspaceCommand } from '../execute-workspace-command';
import type { WorkspaceStore } from '../../ports/workspace-store';
import { markSyncLocalChange } from '../../../domain/sync/sync-state';
import { normalizeWorkspace, profilePath, projectProfile, pureProfile } from '../../../lib/workspace-metadata';

export interface SaveProfilesCommand {
  workspaceId: string; expectedRevision: string; revisionId: string; createdAt: string;
  state: StateData; oldProfileName?: string; profileName?: string;
}
export async function saveProfiles(store: WorkspaceStore<WorkspaceSnapshot>, command: SaveProfilesCommand) {
  const state = stateDataSchema.parse(command.state);
  let canonical: StateData = { profiles: [] };
  const result = await executeWorkspaceCommand(store, {
    workspaceId: command.workspaceId, expectedRevision: command.expectedRevision,
    update: source => {
      const snapshot = normalizeWorkspace(source);
      const metadata = snapshot.metadata!;
      const kept = new Set(state.profiles.map(profile => profilePath(profile.name)));
      const profiles = state.profiles.map(profile => {
        const path = profilePath(profile.name);
        const oldName = command.profileName === profile.name && command.oldProfileName ? command.oldProfileName : profile.name;
        const old = snapshot.profiles.find(candidate => candidate.name === oldName);
        const previous = metadata.entities[profilePath(oldName)];
        const changed = !old || JSON.stringify(pureProfile(old)) !== JSON.stringify(pureProfile(profile)) || (old.note ?? '') !== (profile.note ?? '');
        const next = { ...previous, note: profile.note ?? '', order: profile.order,
          ...(!old ? { createdAt: command.createdAt } : {}),
          ...(changed ? { updatedAt: command.createdAt } : {}),
        };
        metadata.entities[path] = next;
        return projectProfile(pureProfile(profile), next);
      });
      for (const path of Object.keys(metadata.entities)) if (path.startsWith('sing-sub/configs/') && !kept.has(path)) delete metadata.entities[path];
      canonical = { profiles };
      return { ...snapshot, revisionId: command.revisionId, previousRevisionId: command.expectedRevision,
        createdAt: command.createdAt, profiles, sync: markSyncLocalChange(snapshot.sync, command.createdAt) };
    },
  });
  return { ...result, state: canonical };
}
