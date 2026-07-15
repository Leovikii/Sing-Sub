import type {
  CompilerDispatchCommand,
  CompilerDispatcher,
} from '../../application/ports/compiler-dispatcher';

const REPOSITORY = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

function validRepository(value: string): boolean {
  if (!REPOSITORY.test(value)) return false;
  return value.split('/').every(segment => segment !== '.' && segment !== '..');
}

export interface GitHubActionsCompilerConfig {
  repository: string;
  token: string;
  ref?: string;
}

export class GitHubActionsCompilerDispatcher implements CompilerDispatcher {
  private readonly endpoint: string;
  private readonly ref: string;

  constructor(private readonly config: GitHubActionsCompilerConfig) {
    if (!validRepository(config.repository)) throw new Error('Invalid SRS compiler repository');
    if (!config.token) throw new Error('SRS compiler GitHub token is required');
    const [owner, repository] = config.repository.split('/');
    this.endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}` +
      '/actions/workflows/compile-srs.yml/dispatches';
    this.ref = config.ref || 'main';
  }

  async dispatch(command: CompilerDispatchCommand): Promise<void> {
    const workerUrl = new URL(command.workerUrl);
    if (workerUrl.protocol !== 'https:' || workerUrl.username || workerUrl.password ||
        workerUrl.pathname !== '/' || workerUrl.search || workerUrl.hash || !command.jobTicket) {
      throw new Error('Invalid SRS compiler dispatch target');
    }
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'sing-sub-worker',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: this.ref,
        inputs: {
          job_id: command.jobId,
          worker_url: workerUrl.origin,
          job_ticket: command.jobTicket,
        },
      }),
    });
    if (response.status !== 204) {
      await response.body?.cancel();
      console.warn(JSON.stringify({ operation: 'github.srs.dispatch.failed', status: response.status }));
      throw new Error(`GitHub workflow dispatch failed with status ${response.status}`);
    }
  }
}
