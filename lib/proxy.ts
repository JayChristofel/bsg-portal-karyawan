import { NextRequest } from 'next/server';

/**
 * Helper to resolve the real client IP address behind Vercel, proxies, and load balancers.
 */
export function getClientIp(req: NextRequest | Request): string {
  const headers = req.headers;

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // x-forwarded-for can be a comma-separated list of IPs; first is the real client
    const ip = xForwardedFor.split(',')[0].trim();
    if (ip) return ip;
  }

  const xRealIp = headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();

  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();

  const vercelProxiedFor = headers.get('x-vercel-proxied-for');
  if (vercelProxiedFor) return vercelProxiedFor.trim();

  return '127.0.0.1';
}

/**
 * Helper to safely extract user agent.
 */
export function getUserAgent(req: NextRequest | Request): string {
  return req.headers.get('user-agent') || '-';
}

/**
 * Sliding window in-memory rate limiter for serverless routes.
 */
interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  key: string,
  windowSeconds: number,
  maxRequests: number
): { limited: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const record = rateLimitStore.get(key) || { timestamps: [] };

  // Filter timestamps within current window
  const activeTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (activeTimestamps.length >= maxRequests) {
    rateLimitStore.set(key, { timestamps: activeTimestamps });
    return { limited: true, remaining: 0 };
  }

  activeTimestamps.push(now);
  rateLimitStore.set(key, { timestamps: activeTimestamps });

  return { limited: false, remaining: maxRequests - activeTimestamps.length };
}
