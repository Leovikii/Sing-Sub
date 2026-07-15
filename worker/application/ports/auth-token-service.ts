export interface SessionTokenClaims {
  workspaceId: string;
  authVersion: number;
  expiresAt: number;
}

export interface SubscriptionTokenClaims {
  workspaceId: string;
  tokenVersion: number;
  purpose: 'subscription';
}

export interface AuthTokenService {
  issueSession(claims: SessionTokenClaims): Promise<string>;
  verifySession(token: string, expectedAuthVersion: number): Promise<SessionTokenClaims | null>;
  issueSubscription(claims: SubscriptionTokenClaims): Promise<string>;
  verifySubscription(token: string, expected: SubscriptionTokenClaims): Promise<SubscriptionTokenClaims | null>;
}
