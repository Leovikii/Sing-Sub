import type { CacheApiPort } from '../../worker/infrastructure/cache/cache-api-response-cache';

export class InMemoryCacheApi implements CacheApiPort {
  private readonly entries = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    return this.entries.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.entries.set(request.url, response.clone());
  }

  evictAll(): void {
    this.entries.clear();
  }
}
