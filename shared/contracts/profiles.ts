export type {
  FilterAction,
  InboundRule,
  OutboundRule,
  Profile,
  PutStateRequest,
  StateData,
} from '../schemas/profile.schema';

import type { StateData } from '../schemas/profile.schema';

export interface StateResult {
  state: StateData;
  revision: string;
  warning?: string;
}

export interface SaveResult {
  revision: string;
  warning?: string;
}

export interface PreviewResult {
  content: string;
}
