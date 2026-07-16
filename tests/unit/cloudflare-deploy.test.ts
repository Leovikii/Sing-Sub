import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  ADMIN_PASSWORD_BUILD_SECRET,
  createMissingSecrets,
  deployCloudflare,
  parseSecretNames,
} from '../../scripts/deploy-cloudflare.mjs';

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function result(code = 0, stdout = '', stderr = ''): CommandResult {
  return { code, stdout, stderr };
}

function secretList(names: string[]): string {
  return JSON.stringify(names.map(name => ({ name, type: 'secret_text' })));
}

describe('Cloudflare deployment initialization', () => {
  it('parses only structured Wrangler secret lists', () => {
    expect([...parseSecretNames(secretList(['ADMIN_PASSWORD']))]).toEqual(['ADMIN_PASSWORD']);
    expect(() => parseSecretNames('{}')).toThrow('invalid Worker secret list');
    expect(() => parseSecretNames('[{"type":"secret_text"}]')).toThrow('invalid Worker secret list');
  });

  it('requires a strong build secret only when the runtime password is missing', () => {
    expect(() => createMissingSecrets(new Set(), {}, () => 'random-secret'))
      .toThrow(ADMIN_PASSWORD_BUILD_SECRET);
    expect(() => createMissingSecrets(new Set(), {
      [ADMIN_PASSWORD_BUILD_SECRET]: 'short',
    }, () => 'random-secret')).toThrow('at least 12 bytes');

    const generated = ['session-random', 'subscription-random'];
    expect(createMissingSecrets(new Set(['ADMIN_PASSWORD']), {}, () => generated.shift()!))
      .toEqual({
        SESSION_SIGNING_SECRET: 'session-random',
        SUBSCRIPTION_SIGNING_SECRET: 'subscription-random',
      });
  });

  it('reuses an existing bucket and all existing runtime secrets', async () => {
    const calls: string[][] = [];
    const run = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'secret') {
        return result(0, secretList([
          'ADMIN_PASSWORD',
          'SESSION_SIGNING_SECRET',
          'SUBSCRIPTION_SIGNING_SECRET',
        ]));
      }
      return result();
    });

    const deployed = await deployCloudflare({ run, environment: {} });

    expect(deployed).toEqual({ createdSecrets: [], createdBucket: false });
    expect(calls).toEqual([
      ['secret', 'list', '--format', 'json'],
      ['r2', 'bucket', 'info', 'sing-sub-data', '--json'],
      ['deploy'],
    ]);
  });

  it('creates a fresh bucket and uploads three secrets in one deployment', async () => {
    const calls: string[][] = [];
    const uploaded: Record<string, string>[] = [];
    const generated = ['session-random', 'subscription-random'];
    const run = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'secret') {
        return result(1, '', 'Worker "sing-sub" not found.');
      }
      if (args.slice(0, 3).join(' ') === 'r2 bucket info') {
        return result(1, '', 'The specified bucket does not exist. [code: 10006]');
      }
      return result();
    });
    const withSecretFile = vi.fn(async (secrets: Record<string, string>, action: (path: string) => Promise<unknown>) => {
      uploaded.push(secrets);
      return action('temporary-secrets.json');
    });

    const deployed = await deployCloudflare({
      run,
      environment: { [ADMIN_PASSWORD_BUILD_SECRET]: 'strong-admin-password' },
      generateSecret: () => generated.shift()!,
      withSecretFile,
    });

    expect(deployed).toEqual({
      createdSecrets: ['ADMIN_PASSWORD', 'SESSION_SIGNING_SECRET', 'SUBSCRIPTION_SIGNING_SECRET'],
      createdBucket: true,
    });
    expect(uploaded).toEqual([{
      ADMIN_PASSWORD: 'strong-admin-password',
      SESSION_SIGNING_SECRET: 'session-random',
      SUBSCRIPTION_SIGNING_SECRET: 'subscription-random',
    }]);
    expect(calls).toContainEqual(['r2', 'bucket', 'create', 'sing-sub-data']);
    expect(calls.at(-1)).toEqual(['deploy', '--secrets-file', 'temporary-secrets.json']);
  });

  it('does not rotate an existing secret when only one signing secret is missing', async () => {
    const uploaded: Record<string, string>[] = [];
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === 'secret') {
        return result(0, secretList(['ADMIN_PASSWORD', 'SESSION_SIGNING_SECRET']));
      }
      return result();
    });

    await deployCloudflare({
      run,
      environment: { [ADMIN_PASSWORD_BUILD_SECRET]: 'ignored-build-password' },
      generateSecret: () => 'new-subscription-secret',
      withSecretFile: async (secrets: Record<string, string>, action: (path: string) => Promise<unknown>) => {
        uploaded.push(secrets);
        return action('temporary-secrets.json');
      },
    });

    expect(uploaded).toEqual([{ SUBSCRIPTION_SIGNING_SECRET: 'new-subscription-secret' }]);
  });

  it('removes the temporary secret file after deployment', async () => {
    let temporaryPath = '';
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === 'secret') {
        return result(0, secretList(['ADMIN_PASSWORD', 'SESSION_SIGNING_SECRET']));
      }
      if (args[0] === 'deploy') {
        temporaryPath = args[2];
        expect(existsSync(temporaryPath)).toBe(true);
        await expect(readFile(temporaryPath, 'utf8')).resolves.toContain('SUBSCRIPTION_SIGNING_SECRET');
      }
      return result();
    });

    await deployCloudflare({
      run,
      environment: {},
      generateSecret: () => 'new-subscription-secret',
    });

    expect(temporaryPath).not.toBe('');
    expect(existsSync(temporaryPath)).toBe(false);
  });

  it('stops on ambiguous inspection failures before mutating resources', async () => {
    const run = vi.fn(async () => result(1, '', 'Network unavailable'));

    await expect(deployCloudflare({ run, environment: {} }))
      .rejects.toThrow('deployment stopped without changing secrets');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('stops on ambiguous R2 failures instead of attempting creation', async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === 'secret') {
        return result(0, secretList([
          'ADMIN_PASSWORD',
          'SESSION_SIGNING_SECRET',
          'SUBSCRIPTION_SIGNING_SECRET',
        ]));
      }
      return result(1, '', 'Authentication failed');
    });

    await expect(deployCloudflare({ run, environment: {} }))
      .rejects.toThrow('deployment stopped without creating resources');
    expect(run).not.toHaveBeenCalledWith(['r2', 'bucket', 'create', 'sing-sub-data'], expect.anything());
  });
});
