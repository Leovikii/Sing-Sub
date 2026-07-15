import type { AdminAuthenticator } from '../../application/ports/admin-authenticator';

const MINIMUM_ADMIN_PASSWORD_BYTES = 12;
const encoder = new TextEncoder();

export class WebCryptoAdminAuthenticator implements AdminAuthenticator {
  private readonly expectedDigest: Promise<ArrayBuffer>;

  constructor(expectedPassword: string) {
    if (encoder.encode(expectedPassword).byteLength < MINIMUM_ADMIN_PASSWORD_BYTES) {
      throw new Error('Administrator password must contain at least 12 bytes');
    }
    this.expectedDigest = crypto.subtle.digest('SHA-256', encoder.encode(expectedPassword));
  }

  async verify(password: string): Promise<boolean> {
    const [expected, actual] = await Promise.all([
      this.expectedDigest,
      crypto.subtle.digest('SHA-256', encoder.encode(password)),
    ]);
    const expectedBytes = new Uint8Array(expected);
    const actualBytes = new Uint8Array(actual);
    let difference = expectedBytes.byteLength ^ actualBytes.byteLength;
    for (let index = 0; index < expectedBytes.byteLength; index += 1) {
      difference |= expectedBytes[index] ^ (actualBytes[index] || 0);
    }
    return difference === 0;
  }
}
