import { NextRequest } from 'next/server';

/**
 * Helper to resolve the real client IP address behind Vercel, Cloudflare, proxies, and load balancers.
 */
export function getClientIp(req: NextRequest | Request): string {
  const headers = req.headers;

  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();

  const xRealIp = headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ip = xForwardedFor.split(',')[0].trim();
    if (ip) return ip;
  }

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

  const activeTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (activeTimestamps.length >= maxRequests) {
    rateLimitStore.set(key, { timestamps: activeTimestamps });
    return { limited: true, remaining: 0 };
  }

  activeTimestamps.push(now);
  rateLimitStore.set(key, { timestamps: activeTimestamps });

  return { limited: false, remaining: maxRequests - activeTimestamps.length };
}
