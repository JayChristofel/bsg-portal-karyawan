import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'session';
export const SESSION_TTL_SECONDS = 8 * 3600; // 8 hours

const MIN_SECRET_LENGTH = 32;

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  // Fail closed: a hardcoded fallback secret means anyone who read the repo
  // can forge an admin session cookie. Refuse to sign/verify without a real key.
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} chars. ` +
        'Generate one with: openssl rand -base64 48'
    );
  }

  return new TextEncoder().encode(secret);
}

/**
 * Create a signed JWT session token for the authenticated admin.
 * Edge-compatible (uses jose only).
 */
export async function createSessionToken(username: string): Promise<string> {
  return await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

/**
 * Verify session token. Returns decoded payload if valid, null otherwise.
 * Edge-compatible (uses jose only).
 */
export async function verifySessionToken(token: string): Promise<{ username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as { username: string };
  } catch {
    return null;
  }
}
