import crypto from 'node:crypto';

export * from './session';

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEYLEN = 32;

/**
 * Hash password with PBKDF2-SHA256 (600k iterations).
 * Format: salt$digest (hex)
 */
export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const digest = crypto
    .pbkdf2Sync(password, Buffer.from(salt, 'hex'), PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256')
    .toString('hex');
  return `${salt}$${digest}`;
}

/**
 * Verify a plaintext password against a stored PBKDF2-SHA256 hash.
 * Returns false (never throws) on any malformed input.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hexDigest] = (storedHash || '').split('$');
  if (!salt || !hexDigest) return false;

  const expected = Buffer.from(hexDigest, 'hex');
  // timingSafeEqual throws when buffer lengths differ, so guard the format first.
  if (expected.length !== PBKDF2_KEYLEN) return false;

  const testDigest = crypto.pbkdf2Sync(
    password,
    Buffer.from(salt, 'hex'),
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    'sha256'
  );

  return crypto.timingSafeEqual(testDigest, expected);
}

/**
 * Burn the same CPU as a real verification so response timing does not reveal
 * whether a username exists. Use when no user was found.
 */
export function equalizeVerifyTiming(): void {
  crypto.pbkdf2Sync('dummy-password-for-timing', crypto.randomBytes(16), PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
}
