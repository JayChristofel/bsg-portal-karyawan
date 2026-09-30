import crypto from 'node:crypto';

export * from './session';

const PBKDF2_ITERATIONS = 600_000;

/**
 * Hash password with PBKDF2-SHA256 (600k iterations).
 * Format: salt$digest (hex)
 */
export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const digest = crypto
    .pbkdf2Sync(password, Buffer.from(salt, 'hex'), PBKDF2_ITERATIONS, 32, 'sha256')
    .toString('hex');
  return `${salt}$${digest}`;
}

/**
 * Verify a plaintext password against a stored PBKDF2-SHA256 hash.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hexDigest] = storedHash.split('$');
  if (!salt || !hexDigest) return false;

  const testDigest = crypto
    .pbkdf2Sync(password, Buffer.from(salt, 'hex'), PBKDF2_ITERATIONS, 32, 'sha256')
    .toString('hex');

  return crypto.timingSafeEqual(Buffer.from(testDigest), Buffer.from(hexDigest));
}
