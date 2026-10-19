import crypto from 'node:crypto';

export * from './session';

import { promisify } from 'node:util';

const pbkdf2 = promisify(crypto.pbkdf2);

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEYLEN = 32;

/** Longest password accepted anywhere; keeps PBKDF2 input bounded. */
export const MAX_PASSWORD_LENGTH = 256;

// Async on purpose: the sync variant blocks the event loop for 0.2-0.5 s per call,
// so a handful of concurrent logins would stall every other request on the instance.

/**
 * Hash password with PBKDF2-SHA256 (600k iterations).
 * Format: salt$digest (hex)
 */
export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const digest = (
    await pbkdf2(password, Buffer.from(salt, 'hex'), PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256')
  ).toString('hex');
  return `${salt}$${digest}`;
}

/**
 * Verify a plaintext password against a stored PBKDF2-SHA256 hash.
 * Returns false (never throws) on any malformed input.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hexDigest] = (storedHash || '').split('$');
  if (!salt || !hexDigest) return false;

  const expected = Buffer.from(hexDigest, 'hex');
  // timingSafeEqual throws when buffer lengths differ, so guard the format first.
  if (expected.length !== PBKDF2_KEYLEN) return false;

  const testDigest = await pbkdf2(
    password,
    Buffer.from(salt, 'hex'),
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    'sha256',
  );

  return crypto.timingSafeEqual(testDigest, expected);
}

/**
 * Burn the same CPU as a real verification so response timing does not reveal
 * whether a username exists. Use when no user was found.
 */
export async function equalizeVerifyTiming(): Promise<void> {
  await pbkdf2('dummy-password-for-timing', crypto.randomBytes(16), PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
}
