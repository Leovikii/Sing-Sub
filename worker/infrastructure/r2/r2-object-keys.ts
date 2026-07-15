const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function segment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`Invalid R2 ${label}`);
  return encodeURIComponent(value);
}

function workspacePrefix(workspaceId: string): string {
  return `workspaces/${segment(workspaceId, 'workspace ID')}`;
}

export const r2ObjectKeys = {
  workspacePrefix,
  head: (workspaceId: string) => `${workspacePrefix(workspaceId)}/head.json`,
  revisionPrefix: (workspaceId: string) => `${workspacePrefix(workspaceId)}/revisions/`,
  revision: (workspaceId: string, revisionId: string) =>
    `${workspacePrefix(workspaceId)}/revisions/${segment(revisionId, 'revision ID')}.json`,
  privateCredentials: (workspaceId: string) => `${workspacePrefix(workspaceId)}/private/credentials.json`,
  jobPrefix: (workspaceId: string) => `${workspacePrefix(workspaceId)}/jobs/`,
  job: (workspaceId: string, jobId: string) =>
    `${workspacePrefix(workspaceId)}/jobs/${segment(jobId, 'job ID')}.json`,
  artifactPrefix: (workspaceId: string, rulesetId?: string) => rulesetId
    ? `${workspacePrefix(workspaceId)}/artifacts/srs/${segment(rulesetId, 'ruleset ID')}/`
    : `${workspacePrefix(workspaceId)}/artifacts/srs/`,
  srsArtifact: (workspaceId: string, rulesetId: string, sourceHash: string) =>
    `${workspacePrefix(workspaceId)}/artifacts/srs/${segment(rulesetId, 'ruleset ID')}/${segment(sourceHash, 'source hash')}.srs`,
};
