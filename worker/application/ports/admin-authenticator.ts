export interface AdminAuthenticator {
  verify(password: string): Promise<boolean>;
}
