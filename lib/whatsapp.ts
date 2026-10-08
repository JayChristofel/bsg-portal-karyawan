import crypto from 'node:crypto';
import { gatewayFetch, gatewayTlsMode } from './gowa-tls';

export interface GowaConfig {
  baseUrl: string;
  deviceId: string;
  username?: string;
  password?: string;
}

/**
 * Outbound URL guard for the GOWA gateway.
 *
 * The gateway URL is admin-configurable and persisted in the settings table,
 * which makes it an SSRF sink: without this check an attacker (or a hijacked
 * admin session) could point it at 127.0.0.1, the cloud metadata endpoint, or
 * any internal service.
 *
 * Set GOWA_ALLOWED_HOSTS (comma-separated) to lock this down further.
 * Loopback/private ranges are only permitted when GOWA_ALLOW_PRIVATE_HOSTS=1,
 * which is needed when the gateway runs on the same machine during development.
 */
function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return true; // unique-local
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function validateGatewayUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'Invalid gateway URL.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Gateway URL must use http or https.' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Gateway URL must not contain credentials.' };
  }

  if (process.env.GOWA_ALLOW_PRIVATE_HOSTS !== '1' && isPrivateHostname(parsed.hostname)) {
    return {
      ok: false,
      error:
        'Hostname gateway menunjuk ke jaringan internal/loopback dan ditolak. ' +
        'Set GOWA_ALLOWED_HOSTS bila Anda memang memakai gateway privat.',
    };
  }

  const allowlist = (process.env.GOWA_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length > 0 && !allowlist.includes(parsed.hostname.toLowerCase())) {
    return { ok: false, error: `Hostname gateway tidak diizinkan. Izinkan: ${allowlist.join(', ')}` };
  }

  if (parsed.protocol === 'http:' && process.env.GOWA_ALLOW_INSECURE_HTTP !== '1') {
    return {
      ok: false,
      error: 'URL gateway wajib HTTPS. Set GOWA_ALLOW_INSECURE_HTTP=1 hanya untuk pengembangan lokal.',
    };
  }

  return { ok: true, url: rawUrl.trim().replace(/\/+$/, '') };
}

/**
 * Path segment for user-supplied device IDs. Without encoding, a value like
 * "../../api/x" would traverse the gateway's URL space.
 */
function deviceSegment(deviceId: string): string {
  return encodeURIComponent(deviceId);
}

/**
 * HMAC-SHA256 signature verification for inbound GOWA webhooks.
 * Set WHATSAPP_WEBHOOK_SECRET on both this app and the gateway.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) return false; // fail closed

  if (!signatureHeader) return false;

  const provided = signatureHeader.trim().replace(/^sha256=/i, '');
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

export const DEFAULT_GOWA_CONFIG: GowaConfig = {
  baseUrl: (process.env.WHATSAPP_API_URL || 'https://107.23.128.93').replace(/\/+$/, ''),
  deviceId: process.env.WHATSAPP_DEVICE_ID || 'portal-pegawai',
  username: process.env.WHATSAPP_API_USERNAME || undefined,
  password: process.env.WHATSAPP_API_PASSWORD || undefined,
};

export const GOWA_CONFIG_KEYS = {
  url: 'gowa_url',
  deviceId: 'gowa_device_id',
  username: 'gowa_username',
  password: 'gowa_password',
} as const;

export async function getGowaConfig(): Promise<GowaConfig> {
  try {
    const { db } = await import('@/db');
    const { settings } = await import('@/db/schema');
    const { decrypt } = await import('@/lib/crypto');
    const rows = await db.select().from(settings);
    const overrides = new Map<string, string>(rows.map((r) => [r.key, r.value] as [string, string]));

    const storedPassword = overrides.get(GOWA_CONFIG_KEYS.password) || '';
    const password = storedPassword ? decrypt(storedPassword) : undefined;

    return {
      baseUrl: (overrides.get(GOWA_CONFIG_KEYS.url) || DEFAULT_GOWA_CONFIG.baseUrl).replace(/\/+$/, ''),
      deviceId: overrides.get(GOWA_CONFIG_KEYS.deviceId) || DEFAULT_GOWA_CONFIG.deviceId,
      username: overrides.get(GOWA_CONFIG_KEYS.username) || DEFAULT_GOWA_CONFIG.username,
      password: password || DEFAULT_GOWA_CONFIG.password,
    };
  } catch {
    return DEFAULT_GOWA_CONFIG;
  }
}

export async function saveGowaConfig(config: Partial<GowaConfig>) {
  const { db } = await import('@/db');
  const { settings } = await import('@/db/schema');
  const { sql } = await import('drizzle-orm');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const entries: Record<string, string> = {};
  if (config.baseUrl !== undefined) entries[GOWA_CONFIG_KEYS.url] = config.baseUrl.trim();
  if (config.deviceId !== undefined) entries[GOWA_CONFIG_KEYS.deviceId] = config.deviceId.trim();
  if (config.username !== undefined) entries[GOWA_CONFIG_KEYS.username] = config.username.trim();
  if (config.password !== undefined) entries[GOWA_CONFIG_KEYS.password] = config.password;

  for (const [key, value] of Object.entries(entries)) {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date() },
      });
  }
}

function buildHeaders(config: GowaConfig, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': config.deviceId,
    ...(extra || {}),
  };
  if (config.username || config.password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${config.username || ''}:${config.password || ''}`).toString('base64');
  }
  return headers;
}

async function gowaFetch(config: GowaConfig, path: string, options: RequestInit = {}) {
  const url = `${config.baseUrl}${path}`;
  let res: Response;
  try {
    // Routed through the scoped dispatcher so the self-signed gateway
    // certificate can be pinned without weakening TLS for other hosts.
    res = await gatewayFetch(url, {
      ...options,
      headers: buildHeaders(config, options.headers as Record<string, string> | undefined),
      cache: 'no-store',
    });
  } catch (err: any) {
    console.error('GOWA FETCH ERROR:', err?.message, '| cause:', err?.cause?.code, err?.cause?.message);
    throw err;
  }
  const text = await res.text();
  try {
    // Preserve the HTTP status so callers can distinguish an expected
    // rejection (e.g. ALREADY_LOGGED_IN) from a transport failure.
    return { ...JSON.parse(text), status: res.status };
  } catch {
    return { code: res.status === 200 ? 'OK' : 'ERROR', message: text, status: res.status };
  }
}

export async function getDeviceStatus(config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${deviceSegment(cfg.deviceId)}/status`);
}

export async function listDevices(config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, '/devices', { headers: {} });
}

export async function getQRCode(config?: GowaConfig): Promise<{ code: string; results?: { qr_url?: string; qr_link?: string; code?: string; qr_duration?: number }; status?: number }> {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${deviceSegment(cfg.deviceId)}/login`);
}

export type QrResult =
  | { ok: true; qrLink: string; qrDuration: number }
  | {
      ok: false;
      reason: 'already-logged-in' | 'transport-error' | 'gateway-error';
      status?: number;
      code?: string;
      message: string;
    };

/**
 * Requests a pairing QR and classifies the outcome.
 *
 * A paired device answers 400 ALREADY_LOGGED_IN. That is a healthy gateway, so
 * it must not be reported as a connection failure — previously this surfaced as
 * "make sure the GOWA server is running", which sent admins down the wrong path.
 */
export async function requestQr(config?: GowaConfig): Promise<QrResult> {
  const cfg = config || (await getGowaConfig());

  let raw: { code?: string; message?: string; status?: number; results?: { qr_link?: string; qr_url?: string; qr_duration?: number } };
  try {
    raw = await getQRCode(cfg);
  } catch (err: any) {
    const cause = err?.cause?.code || '';
    const tls = cause.includes('CERT') || cause.includes('SELF_SIGNED') || cause.includes('UNABLE_TO_VERIFY');
    const mode = gatewayTlsMode();
    return {
      ok: false,
      reason: 'transport-error',
      code: tls ? 'TLS_ERROR' : 'NETWORK_ERROR',
      message: tls
        ? `TLS verification failed for the gateway certificate (${cause || 'certificate rejected'}). ` +
          `Current trust mode: ${mode}. ` +
          (mode === 'system'
            ? 'Set GOWA_CA_CERT to the gateway CA certificate.'
            : 'The configured CA did not match the certificate the gateway presented — it may have been rotated.')
        : `Could not reach the gateway: ${err?.message ?? 'unknown network error'} (trust mode: ${mode})`,
    };
  }

  if (raw?.code === 'ALREADY_LOGGED_IN') {
    return {
      ok: false,
      reason: 'already-logged-in',
      status: raw.status,
      code: raw.code,
      message: 'Device is already paired. Disconnect it first if you want to re-pair.',
    };
  }

  const link = raw?.results?.qr_link || raw?.results?.qr_url;
  if (!link) {
    return {
      ok: false,
      reason: 'gateway-error',
      status: raw?.status,
      code: raw?.code,
      message: raw?.message || 'Gateway did not return a QR code.',
    };
  }

  return {
    ok: true,
    qrLink: link,
    qrDuration: raw?.results?.qr_duration || 30,
  };
}

export async function reconnectDevice(config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${deviceSegment(cfg.deviceId)}/reconnect`, { method: 'POST' });
}

export async function logoutDevice(config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${deviceSegment(cfg.deviceId)}/logout`, { method: 'POST' });
}

export interface SendMessagePayload {
  phone: string;
  message: string;
}

export async function sendMessage(phone: string, message: string, config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  // Normalize phone: remove +, spaces, dashes; convert leading 0 to 62
  let normalized = phone.replace(/[\s\-\+\(\)]/g, '');
  if (normalized.startsWith('0')) {
    normalized = '62' + normalized.slice(1);
  } else if (normalized.startsWith('8') && normalized.length >= 9) {
    normalized = '62' + normalized;
  }

  return gowaFetch(cfg, '/send/message', {
    method: 'POST',
    body: JSON.stringify({ phone: normalized, message }),
  });
}

export async function getDeviceWebhook(config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${deviceSegment(cfg.deviceId)}/webhook`);
}

export async function setDeviceWebhook(webhook_url: string, webhook_secret?: string, webhook_events?: string, config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${deviceSegment(cfg.deviceId)}/webhook`, {
    method: 'PATCH',
    body: JSON.stringify({
      webhook_url,
      ...(webhook_secret !== undefined ? { webhook_secret } : {}),
      ...(webhook_events !== undefined ? { webhook_events } : {}),
    }),
  });
}

