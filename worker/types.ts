import type { R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  WORKSPACE_BUCKET: R2Bucket;
  ADMIN_PASSWORD: string;
  SESSION_SIGNING_SECRET: string;
  SUBSCRIPTION_SIGNING_SECRET: string;
}
