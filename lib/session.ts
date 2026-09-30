import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'session';
export const SESSION_TTL_SECONDS = 8 * 3600; // 8 hours

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'fallback-jwt-secret-portal-pegawai-change-in-env';
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
