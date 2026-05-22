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
}

export interface SessionData {
  owner: string;
  repo: string;
}

export interface Profile {
  name: string;
  note?: string;
  templateUrl: string;
  nodesPath: string;
  rules: { group: string; include: string; exclude: string }[];
  inboundRules: { include: string; exclude: string }[];
}

export interface StateData {
  profiles: Profile[];
}
