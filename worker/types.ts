import type { KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  SESSIONS: KVNamespace;
}

export interface UserSettings {
  pat: string;
  owner: string;
  repo: string;
  subToken: string;
  userLogin: string;
  userAvatar: string;
  defaultBranch?: string;
}

export interface SessionData {
  owner: string;
  repo: string;
}

export interface Profile {
  name: string;
  note?: string;
  templateUrl: string;
  patchUrl?: string;
  nodesPath: string;
  rules: { group: string; filters: { action: 'include' | 'exclude'; keyword: string }[] }[];
  inboundRules: { tag: string; filters: { action: 'include' | 'exclude'; keyword: string }[] }[];
  overrides?: Record<string, unknown>;
  created_at?: number;
  updated_at?: number;
  order: number;
}

export interface StateData {
  profiles: Profile[];
}
