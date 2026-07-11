import type { Env } from '../types';

export async function listAllKvKeys(env: Env, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await env.SESSIONS.list({ prefix, cursor });
    keys.push(...page.keys.map(key => key.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return keys;
}
