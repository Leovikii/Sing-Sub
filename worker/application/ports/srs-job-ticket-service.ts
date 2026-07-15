export const SRS_JOB_OPERATIONS = ['source', 'complete', 'failed'] as const;

export type SrsJobOperation = typeof SRS_JOB_OPERATIONS[number];

export interface SrsJobTicketClaims {
  purpose: 'srs-build';
  workspaceId: string;
  jobId: string;
  operations: SrsJobOperation[];
  issuedAt: number;
  expiresAt: number;
}

export interface SrsJobTicketService {
  issue(claims: SrsJobTicketClaims): Promise<string>;
  verify(
    token: string,
    expected: { workspaceId: string; jobId: string; operation: SrsJobOperation },
  ): Promise<SrsJobTicketClaims | null>;
}
