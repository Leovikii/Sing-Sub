export interface UserSettings {
  owner: string;
  repo: string;
  subToken: string;
  userLogin: string;
  userAvatar: string;
}

export interface SetupData {
  owner: string;
  repo: string;
  pat: string;
}

export interface FilterAction {
  action: 'include' | 'exclude';
  keyword: string;
}

export interface Rule {
  group: string;
  filters: FilterAction[];
}

export interface InboundRule {
  tag: string;
  filters: FilterAction[];
}



export interface Profile {
  name: string;
  note?: string;
  templateUrl: string;
  patchUrl?: string;
  nodesPath: string;
  rules: Rule[];
  inboundRules: InboundRule[];
  overrides?: Record<string, unknown>;
  created_at?: number;
  updated_at?: number;
}

export interface StateData {
  profiles: Profile[];
}

export interface GithubUser {
  login: string;
  avatar_url: string;
}
