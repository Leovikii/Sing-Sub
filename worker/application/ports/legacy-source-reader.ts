export interface LegacySourceFile {
  path: string;
  blobSha: string;
  content: string;
  size: number;
}

export interface LegacyGithubSource {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  files: LegacySourceFile[];
}

export interface LegacySourceReader {
  read(): Promise<LegacyGithubSource>;
}
