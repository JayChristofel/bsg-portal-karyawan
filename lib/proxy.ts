import { NextRequest } from 'next/server';

const UNKNOWN_IP = '0.0.0.0';

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const ip = value.trim().replace(/^\[|\]$/g, ''); // strip [] from IPv6
  if (!ip) return null;
  // Reject malformed payloads / header-injection attempts.
  if (IPV4_RE.test(ip)) return ip;
  if (ip.includes(':') && /^[0-9a-f:.]+$/i.test(ip) && ip.length <= 45) return ip;
  return null;
}

/**
 * Resolves the real client IP behind Vercel / Cloudflare / a proxy.
 *
 * SECURITY: forwarded headers are attacker-controlled unless something in front
 * of the app overwrites them. Two situations are trusted:
 *  - Vercel (VERCEL=1 is set by the platform): its edge overwrites
 *    x-vercel-forwarded-for / x-real-ip / x-forwarded-for with the true client
 *    address, so a client cannot choose its own. cf-connecting-ip is NOT used
 *    here: Vercel does not strip it, so a client could forge it.
 *  - TRUST_PROXY_HEADERS=1 elsewhere, only once the origin is unreachable except
 *    through the proxy (then cf-connecting-ip is honoured first).
 * Otherwise a sentinel is returned and callers apply a conservative bucket.
 */
export function getClientIp(req: NextRequest | Request): string {
  const onVercel = process.env.VERCEL === '1';
  if (!onVercel && process.env.TRUST_PROXY_HEADERS !== '1') {
    return UNKNOWN_IP;
  }

  const headers = req.headers;

  if (!onVercel) {
    const cfConnectingIp = normalizeIp(headers.get('cf-connecting-ip'));
    if (cfConnectingIp) return cfConnectingIp;
  }

  const vercelForwardedFor = normalizeIp(headers.get('x-vercel-forwarded-for'));
  if (vercelForwardedFor) return vercelForwardedFor;

  const xRealIp = normalizeIp(headers.get('x-real-ip'));
  if (xRealIp) return xRealIp;

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // Rightmost entry is the one appended by the nearest trusted proxy.
    const entries = xForwardedFor.split(',').map((e) => normalizeIp(e));
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i]) return entries[i] as string;
    }
  }

  return UNKNOWN_IP;
}

export function isUnknownIp(ip: string): boolean {
  return ip === UNKNOWN_IP;
}

/**
 * Helper to safely extract user agent.
 */
export function getUserAgent(req: NextRequest | Request): string {
  return req.headers.get('user-agent') || '-';
}

/**
 * Extract approximate location from reverse-proxy / CDN headers.
 */
export function getApproxLocation(req: NextRequest | Request): string {
  const headers = req.headers;
  const city = headers.get('cf-ipcity') || headers.get('x-vercel-ip-city');
  const region = headers.get('cf-region') || headers.get('x-vercel-ip-country-region');
  const country = headers.get('cf-ipcountry') || headers.get('x-vercel-ip-country');

  // Vercel sends the city percent-encoded.
  const decode = (v: string | null) => {
    if (!v) return v;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const parts = [decode(city), region, country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Tidak diketahui';
}

/**
 * Extract ASN / ISP info from CDN headers.
 */
export function getAsnIsp(req: NextRequest | Request): string {
  const headers = req.headers;
  const asn = headers.get('cf-as-number') || headers.get('x-vercel-ip-as-number');
  const org = headers.get('cf-as-org') || headers.get('x-vercel-ip-as-org');

  if (asn && org) return `AS${asn} (${org})`;
  if (asn) return `AS${asn}`;
  if (org) return org;
  return 'Tidak diketahui';
}

/**
 * Parse User-Agent string to extract OS, Browser, and Device Type.
 */
export function parseUserAgent(ua: string): { os: string; browser: string; deviceType: string } {
  const lower = ua.toLowerCase();

  // 1. Device Type
  let deviceType = 'Desktop';
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
    deviceType = 'Tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) {
    deviceType = 'Mobile';
  }

  // 2. OS
  let os = 'Unknown OS';
  if (/windows nt 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/windows nt 6.3/i.test(ua)) os = 'Windows 8.1';
  else if (/windows nt 6.2/i.test(ua)) os = 'Windows 8';
  else if (/windows nt 6.1/i.test(ua)) os = 'Windows 7';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) {
    const match = ua.match(/android\s([0-9.]+)/i);
    os = match ? `Android ${match[1]}` : 'Android';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    const match = ua.match(/os\s([0-9_]+)/i);
    os = match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS';
  } else if (/mac os x/i.test(ua)) {
    os = 'macOS';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  // 3. Browser
  let browser = 'Unknown Browser';
  if (/edg\//i.test(ua)) {
    const match = ua.match(/edg\/([0-9.]+)/i);
    browser = match ? `Edge ${match[1].split('.')[0]}` : 'Edge';
  } else if (/opr\/|opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/chrome|crios/i.test(ua)) {
    const match = ua.match(/(?:chrome|crios)\/([0-9.]+)/i);
    browser = match ? `Chrome ${match[1].split('.')[0]}` : 'Chrome';
  } else if (/firefox|fxios/i.test(ua)) {
    const match = ua.match(/(?:firefox|fxios)\/([0-9.]+)/i);
    browser = match ? `Firefox ${match[1].split('.')[0]}` : 'Firefox';
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    const match = ua.match(/version\/([0-9.]+)/i);
    browser = match ? `Safari ${match[1].split('.')[0]}` : 'Safari';
  }

  return { os, browser, deviceType };
}

/**
 * Fixed-window rate limiter backed by the `rate_limits` table.
 *
 * State must be shared across instances (Vercel runs many), so it lives in the
 * database; one INSERT ... ON CONFLICT per call keeps the check atomic. If the
 * database is unreachable the limiter fails open: the route would fail anyway
 * for anything that needs the DB, and a limiter outage must not lock everyone out.
 */
async function hit(key: string, windowSeconds: number): Promise<number> {
  const { db } = await import('@/db');
  const { sql } = await import('drizzle-orm');
  const result = (await db.execute(sql`
    INSERT INTO rate_limits AS r (key, window_start, count)
    VALUES (${key}, NOW(), 1)
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE WHEN r.window_start < NOW() - make_interval(secs => ${windowSeconds})
                          THEN NOW() ELSE r.window_start END,
      count = CASE WHEN r.window_start < NOW() - make_interval(secs => ${windowSeconds})
                   THEN 1 ELSE r.count + 1 END
    RETURNING count
  `)) as unknown as Array<{ count: number }> | { rows?: Array<{ count: number }> };
  const rows = Array.isArray(result) ? result : (result.rows ?? []);

  // Opportunistic cleanup so abandoned keys do not accumulate.
  if (Math.random() < 0.01) {
    void db
      .execute(sql`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '2 hours'`)
      .catch(() => {});
  }
  return Number(rows[0]?.count ?? 1);
}

export async function checkRateLimit(
  key: string,
  windowSeconds: number,
  maxRequests: number,
): Promise<{ limited: boolean; remaining: number }> {
  try {
    const count = await hit(key, windowSeconds);
    return { limited: count > maxRequests, remaining: Math.max(0, maxRequests - count) };
  } catch (err) {
    console.error('rate limit check failed (allowing):', (err as Error).message);
    return { limited: false, remaining: maxRequests };
  }
}

/**
 * Per-IP limit. When the IP could not be determined every caller would share one
 * bucket and could lock each other out, so that bucket gets a far higher ceiling:
 * it still caps a flood but is not a trivial denial of service.
 */
export function checkIpRateLimit(
  prefix: string,
  ip: string,
  windowSeconds: number,
  maxRequests: number,
) {
  const max = isUnknownIp(ip) ? maxRequests * 20 : maxRequests;
  return checkRateLimit(`${prefix}:${ip}`, windowSeconds, max);
}

/** Clear a bucket, e.g. after a successful login. */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    const { db } = await import('@/db');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`DELETE FROM rate_limits WHERE key = ${key}`);
  } catch (err) {
    console.error('rate limit reset failed:', (err as Error).message);
  }
}

/**
 * Progressive backoff for a targeted account.
 *
 * A hard lockout would let any anonymous caller lock the real admin out, so the
 * wait between guesses lengthens instead: 5 free, then doubling up to the cap.
 * Failures are counted per hour in their own bucket, independent of any other
 * limiter, so another route's window can never erase them.
 */
const AUTH_BACKOFF_FREE_ATTEMPTS = 5;
const AUTH_BACKOFF_BASE_MS = 1_000;
const MAX_AUTH_BACKOFF_MS = 15_000;
const AUTH_FAILURE_WINDOW_SECONDS = 3600;

export async function recordAuthFailure(accountKey: string): Promise<number> {
  let failures = 1;
  try {
    failures = await hit(accountKey, AUTH_FAILURE_WINDOW_SECONDS);
  } catch (err) {
    console.error('auth failure record failed:', (err as Error).message);
  }

  if (failures <= AUTH_BACKOFF_FREE_ATTEMPTS) return 0;
  const over = failures - AUTH_BACKOFF_FREE_ATTEMPTS;
  return Math.min(MAX_AUTH_BACKOFF_MS, AUTH_BACKOFF_BASE_MS * 2 ** (over - 1));
}
