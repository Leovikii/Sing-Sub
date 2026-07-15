export interface UserSettings {
  owner?: string;
  repo?: string;
  pat?: string;
  subToken: string;
  userLogin: string;
  userAvatar: string;
  defaultBranch?: string;
}

export type PublicUserSettings = Omit<UserSettings, 'pat'>;

export interface BootstrapResult {
  settings: PublicUserSettings | null;
  state?: import('./profiles').StateData;
  revision?: string;
  setupRequired: boolean;
}

export type LoginResult = PublicUserSettings & { revision: string; warning?: string };

export interface GithubUser {
  login: string;
  avatar_url: string;
}

export type { LoginRequest as SetupData, UpdateSettingsRequest } from '../schemas/auth.schema';
