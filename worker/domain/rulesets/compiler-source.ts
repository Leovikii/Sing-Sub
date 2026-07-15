import { canonicalJson, sha256Hex } from '../revisions/canonical-json';

export const SRS_COMPILER_VERSION = '1.13.14';

export interface CompilerSource {
  body: string;
  sourceHash: string;
}

export async function createCompilerSource(content: unknown): Promise<CompilerSource> {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('Rule-set source must be an object');
  }
  const source = content as Record<string, unknown>;
  if (source.version !== 2 || !Array.isArray(source.rules)) {
    throw new Error('Rule-set source must contain version 2 and a rules array');
  }
  const body = canonicalJson({ version: 2, rules: source.rules });
  return { body, sourceHash: await sha256Hex(body) };
}

export async function createSrsJobId(input: {
  workspaceId: string;
  rulesetId: string;
  sourceRevision: string;
  sourceHash: string;
  compilerVersion: string;
}): Promise<string> {
  return `srs-${await sha256Hex(canonicalJson(input))}`;
}
