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
 * Helper to resolve the real client IP address behind Vercel, Cloudflare, proxies, and load balancers.
 *
 * SECURITY: forwarded headers are attacker-controlled unless the origin is
 * firewalled to the proxy. A client connecting directly can send any
 * X-Forwarded-For / CF-Connecting-IP it likes, which would otherwise let them
 * rotate identities to defeat rate limiting.
 *
 * So forwarded headers are only honoured when TRUST_PROXY_HEADERS=1, which you
 * should set ONLY once the origin is unreachable except through Cloudflare /
 * Vercel (security group, firewall, or bind to a private interface).
 * With it disabled we return a single sentinel, which makes rate limiting
 * conservative rather than bypassable.
 */
export function getClientIp(req: NextRequest | Request): string {
  if (process.env.TRUST_PROXY_HEADERS !== '1') {
    return UNKNOWN_IP;
  }

  const headers = req.headers;

  const cfConnectingIp = normalizeIp(headers.get('cf-connecting-ip'));
  if (cfConnectingIp) return cfConnectingIp;

  const vercelProxiedFor = normalizeIp(headers.get('x-vercel-proxied-for'));
  if (vercelProxiedFor) return vercelProxiedFor;

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const entries = xForwardedFor.split(',').map((e) => normalizeIp(e));
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i]) return entries[i] as string;
    }
  }

  const xRealIp = normalizeIp(headers.get('x-real-ip'));
  if (xRealIp) return xRealIp;

  return UNKNOWN_IP;
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
  const country = headers.get('cf-ipcountry') || headers.get('x-vercel-ip-country') || 'ID';

  const parts = [city, region, country].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(', ');
  }
  return 'Sulawesi Utara, ID';
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
  return 'Jaringan Seluler / ISP Lokal';
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
 * Sliding window in-memory rate limiter for serverless routes.
 *
 * NOTE: state is per-process, so on serverless/multi-instance deployments this
 * only throttls each instance separately. Move to a shared store (Redis /
 * Upstash) if you need a global limit.
 */
interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Bound the store so a spoofed-IP flood cannot grow memory without limit.
const MAX_RATE_LIMIT_KEYS = 10_000;
const RATE_LIMIT_SWEEP_INTERVAL_MS = 60_000;
let lastSweep = Date.now();

function sweepRateLimitStore(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < RATE_LIMIT_SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  for (const [key, record] of rateLimitStore) {
    const active = record.timestamps.filter((ts) => now - ts < windowMs);
    if (active.length === 0) rateLimitStore.delete(key);
    else rateLimitStore.set(key, { timestamps: active });
  }

  // Hard cap: drop the oldest keys if we are still over budget.
  while (rateLimitStore.size > MAX_RATE_LIMIT_KEYS) {
    const oldest = rateLimitStore.keys().next();
    if (oldest.done) break;
    rateLimitStore.delete(oldest.value);
  }
}

export function checkRateLimit(
  key: string,
  windowSeconds: number,
  maxRequests: number
): { limited: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  sweepRateLimitStore(windowMs);

  const record = rateLimitStore.get(key) || { timestamps: [] };
  const activeTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (activeTimestamps.length >= maxRequests) {
    rateLimitStore.set(key, { timestamps: activeTimestamps });
    return { limited: true, remaining: 0 };
  }

  activeTimestamps.push(now);
  rateLimitStore.set(key, { timestamps: activeTimestamps });

  return { limited: false, remaining: maxRequests - activeTimestamps.length };
}

/**
 * Clear all rate-limit buckets. Call on successful login so a legitimate user
 * is not penalised for earlier failed attempts.
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Progressive backoff for a targeted account.
 *
 * A hard account lockout would let any anonymous caller lock the real admin
 * out with a handful of failed requests, so instead we lengthen the wait
 * between guesses: 5 free, then doubling up to MAX_AUTH_BACKOFF_MS. Brute force
 * stays infeasible (6th guess already costs 1s, the 12th costs 15s) while the
 * legitimate owner is never locked out.
 */
const AUTH_BACKOFF_FREE_ATTEMPTS = 5;
const AUTH_BACKOFF_BASE_MS = 1_000;
const MAX_AUTH_BACKOFF_MS = 15_000;

export function recordAuthFailure(accountKey: string): number {
  const now = Date.now();
  const record = rateLimitStore.get(accountKey) || { timestamps: [] };
  const failures = record.timestamps.filter((ts) => now - ts < 60 * 60 * 1000).length + 1;

  rateLimitStore.set(accountKey, { timestamps: [...record.timestamps, now] });

  if (failures <= AUTH_BACKOFF_FREE_ATTEMPTS) return 0;

  const over = failures - AUTH_BACKOFF_FREE_ATTEMPTS;
  return Math.min(MAX_AUTH_BACKOFF_MS, AUTH_BACKOFF_BASE_MS * 2 ** (over - 1));
}

export function getAuthFailureCount(accountKey: string): number {
  const now = Date.now();
  const record = rateLimitStore.get(accountKey);
  if (!record) return 0;
  return record.timestamps.filter((ts) => now - ts < 60 * 60 * 1000).length;
}
