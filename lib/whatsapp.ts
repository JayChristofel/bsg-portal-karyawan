import crypto from 'node:crypto';
import { gatewayFetch, gatewayTlsMode } from './gowa-tls';
import { isPrivateHostname, readHostAllowlist } from './net-guard';

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
        'Gateway hostname points to an internal/loopback network and was rejected. ' +
        'Set GOWA_ALLOWED_HOSTS if you intentionally use a private gateway.',
    };
  }

  const allowlist = readHostAllowlist(process.env.GOWA_ALLOWED_HOSTS);

  if (allowlist.length > 0 && !allowlist.includes(parsed.hostname.toLowerCase())) {
    return { ok: false, error: `Gateway hostname is not allowed. Allow: ${allowlist.join(', ')}` };
  }

  if (parsed.protocol === 'http:' && process.env.GOWA_ALLOW_INSECURE_HTTP !== '1') {
    return {
      ok: false,
      error: 'Gateway URL must use HTTPS. Set GOWA_ALLOW_INSECURE_HTTP=1 for local development only.',
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

const GATEWAY_TIMEOUT_MS = 15_000;
const MAX_GATEWAY_RESPONSE_BYTES = 1_000_000;
let warnedOpenAllowlist = false;

/**
 * Checked on every call, not only when the URL is saved: the credentials are
 * attached to whatever host is stored, so a hijacked session that swapped the URL
 * must not get the gateway password sent to its server.
 */
function assertGatewayHostAllowed(baseUrl: string): void {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    throw new Error('Gateway URL is invalid.');
  }
  const allowlist = readHostAllowlist(process.env.GOWA_ALLOWED_HOSTS);
  if (allowlist.length > 0) {
    if (!allowlist.includes(host)) {
      throw new Error('Gateway hostname is not in GOWA_ALLOWED_HOSTS; request blocked.');
    }
  } else if (process.env.NODE_ENV === 'production' && !warnedOpenAllowlist) {
    warnedOpenAllowlist = true;
    console.warn(
      '[gowa] GOWA_ALLOWED_HOSTS is not set: gateway credentials are sent to whichever ' +
        'host is saved in the settings. Set it to the gateway hostname.',
    );
  }
}

async function gowaFetch(config: GowaConfig, path: string, options: RequestInit = {}) {
  assertGatewayHostAllowed(config.baseUrl);
  const url = `${config.baseUrl}${path}`;
  let res: Response;
  try {
    // Routed through the scoped dispatcher so the self-signed gateway
    // certificate can be pinned without weakening TLS for other hosts.
    res = await gatewayFetch(url, {
      ...options,
      headers: buildHeaders(config, options.headers as Record<string, string> | undefined),
      cache: 'no-store',
      // Never follow a redirect with the Basic Auth header attached, and never hang.
      redirect: 'manual',
      signal: options.signal ?? AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
  } catch (err: any) {
    console.error('GOWA FETCH ERROR:', err?.message, '| cause:', err?.cause?.code, err?.cause?.message);
    throw err;
  }

  if (Number(res.headers.get('content-length') ?? 0) > MAX_GATEWAY_RESPONSE_BYTES) {
    throw new Error('Gateway response is too large.');
  }
  const text = await res.text();
  try {
    // Preserve the HTTP status so callers can distinguish an expected
    // rejection (e.g. ALREADY_LOGGED_IN) from a transport failure.
    return { ...JSON.parse(text), status: res.status };
  } catch {
    // The gateway always answers JSON. Anything else -- an nginx error page, a
    // login form -- is a failure even when the HTTP status is 200, otherwise every
    // send would be reported as delivered.
    return { code: 'ERROR', message: text.slice(0, 300), status: res.status };
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

/**
 * Normalises an Indonesian number to digits only (leading 0 -> 62). Returns null
 * for anything that is not a plausible phone number, so letters, JIDs such as
 * "123@g.us" and other junk never reach the gateway.
 */
export function normalizeWaPhone(phone: string): string | null {
  let normalized = phone.replace(/[\s\-\+\(\)]/g, '');
  if (normalized.startsWith('0')) {
    normalized = '62' + normalized.slice(1);
  } else if (normalized.startsWith('8') && normalized.length >= 9) {
    normalized = '62' + normalized;
  }
  return /^\d{8,15}$/.test(normalized) ? normalized : null;
}

export async function sendMessage(phone: string, message: string, config?: GowaConfig) {
  const normalized = normalizeWaPhone(phone);
  if (!normalized) throw new Error('Invalid phone number.');
  const cfg = config || (await getGowaConfig());

  return gowaFetch(cfg, '/send/message', {
    method: 'POST',
    body: JSON.stringify({ phone: normalized, message }),
  });
}

/**
 * Warm-up gate for outbound sends.
 *
 * Every broadcast path (admin single-send, campaign loop, and the auto-resume
 * listener) funnels through here, so the daily quota cannot be side-stepped by
 * simply using a different entry point. Quota is claimed *before* the message
 * goes out: claiming late would let concurrent senders overshoot, and the cost
 * of an occasional unused claim is far lower than overshooting the cap.
 */
export async function sendMessageGuarded(
  phone: string,
  message: string,
  numberId: string,
  config?: GowaConfig,
): Promise<{ ok: true; result: unknown } | { ok: false; reason: 'quota'; state: WarmUpState }> {
  // Reject a bad number before it costs a unit of today's quota.
  if (!normalizeWaPhone(phone)) throw new Error('Invalid phone number.');

  const state = await getWarmUpState(numberId);

  if (state.remainingToday <= 0) {
    return { ok: false, reason: 'quota', state };
  }

  const day = utcDay();
  const claimed = await claimQuota(numberId, state.dailyLimit);
  if (!claimed) {
    return { ok: false, reason: 'quota', state: await getWarmUpState(numberId) };
  }

  try {
    const result = await sendMessage(phone, message, config);
    return { ok: true, result };
  } catch (err) {
    // Nothing left the device, so the claimed unit must not count against today.
    await releaseQuota(numberId, day);
    throw err;
  }
}

/**
 * Warm-up ladder for a sending number.
 *
 * A number that starts sending in bulk gets flagged quickly, so the daily quota
 * ramps with the number's age rather than jumping straight to full volume.
 * The ladder is a guardrail against *accidentally* hammering a fresh number --
 * it is not a way to defeat detection, and it is not a substitute for the
 * official Business API when volume is genuinely large.
 */
const WARMUP_LADDER: Array<{ upToDay: number; dailyLimit: number }> = [
  { upToDay: 2, dailyLimit: 15 },
  { upToDay: 5, dailyLimit: 40 },
  { upToDay: 14, dailyLimit: 100 },
  { upToDay: Number.POSITIVE_INFINITY, dailyLimit: 250 },
];

export const WARMUP_LADDER_TABLE = WARMUP_LADDER.map((r) =>
  r.upToDay === Number.POSITIVE_INFINITY ? '14+ hari' : `0-${r.upToDay} hari`,
);

export interface WarmUpState {
  numberId: string;
  label: string | null;
  pairedAt: Date;
  ageDays: number;
  dailyLimit: number;
  sentToday: number;
  remainingToday: number;
  nextLimitIn: number | null;
}

function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function limitForAge(ageDays: number): number {
  for (const rung of WARMUP_LADDER) {
    if (ageDays <= rung.upToDay) return rung.dailyLimit;
  }
  return WARMUP_LADDER[WARMUP_LADDER.length - 1].dailyLimit;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

async function loadWarmUpRows(numberId: string) {
  const { db } = await import('@/db');
  const { warmupNumbers, sendCounters } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  let [row] = await db
    .select()
    .from(warmupNumbers)
    .where(eq(warmupNumbers.numberId, numberId))
    .limit(1);

  if (!row) {
    [row] = await db
      .insert(warmupNumbers)
      .values({ numberId })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      [row] = await db
        .select()
        .from(warmupNumbers)
        .where(eq(warmupNumbers.numberId, numberId))
        .limit(1);
    }
  }

  const [counter] = await db
    .select()
    .from(sendCounters)
    .where(and(eq(sendCounters.numberId, numberId), eq(sendCounters.day, utcDay())))
    .limit(1);

  return { row, sentToday: counter?.sent ?? 0 };
}

export async function getWarmUpState(numberId: string): Promise<WarmUpState> {
  try {
    const { row, sentToday } = await loadWarmUpRows(numberId);
    const ageDays = daysBetween(new Date(row.pairedAt), new Date());
    const dailyLimit = row.dailyLimitOverride ?? limitForAge(ageDays);

    // Only rungs above the current one are candidates; the final rung has an
    // infinite `upToDay`, which would otherwise yield `Infinity - ageDays`.
    const nextRung = WARMUP_LADDER.find(
      (r) => Number.isFinite(r.upToDay) && ageDays + 1 <= r.upToDay,
    );

    return {
      numberId,
      label: row.label,
      pairedAt: new Date(row.pairedAt),
      ageDays,
      dailyLimit,
      sentToday,
      remainingToday: Math.max(0, dailyLimit - sentToday),
      nextLimitIn: nextRung ? nextRung.upToDay - ageDays : null,
    };
  } catch (err) {
    console.error('getWarmUpState failed:', (err as Error).message);
    return {
      numberId,
      label: null,
      pairedAt: new Date(),
      ageDays: 0,
      // Fail closed: if the counters can't be read, don't pretend there is headroom.
      dailyLimit: 15,
      sentToday: 15,
      remainingToday: 0,
      nextLimitIn: null,
    };
  }
}

/**
 * Atomically claims one unit of today's quota for a number.
 *
 * The guard lives in the UPDATE's WHERE clause rather than in a prior SELECT, so
 * two concurrent broadcasts cannot both read the same headroom and overrun it.
 */
async function claimQuota(numberId: string, dailyLimit: number): Promise<boolean> {
  const { db } = await import('@/db');
  const { sendCounters } = await import('@/db/schema');
  const { sql } = await import('drizzle-orm');

  // Computed once: a call straddling 00:00 UTC must insert and update the same row.
  const day = utcDay();

  // send_counters has a (number_id, day) primary key, so concurrent first
  // claims of the day collapse into one row instead of inserting duplicates.
  await db
    .insert(sendCounters)
    .values({ numberId, day, sent: 0 })
    .onConflictDoNothing();

  const result = (await db.execute(sql`
    UPDATE send_counters
       SET sent = sent + 1, updated_at = NOW()
     WHERE number_id = ${numberId}
       AND day = ${day}
       AND sent < ${dailyLimit}
  `)) as { rowCount?: number; rows?: unknown[] };

  return (result.rowCount ?? result.rows?.length ?? 0) > 0;
}

/** Gives back a claimed unit when the message never left (gateway threw). */
async function releaseQuota(numberId: string, day: string): Promise<void> {
  try {
    const { db } = await import('@/db');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      UPDATE send_counters
         SET sent = sent - 1, updated_at = NOW()
       WHERE number_id = ${numberId} AND day = ${day} AND sent > 0
    `);
  } catch (err) {
    console.error('releaseQuota failed:', (err as Error).message);
  }
}

export class DailyQuotaExceededError extends Error {
  readonly code = 'DAILY_QUOTA_EXCEEDED';
  constructor(readonly state: WarmUpState) {
    super(
      `Daily warm-up limit reached (${state.sentToday}/${state.dailyLimit}). ` +
        'Resumes tomorrow, or sooner if the number ages into a higher rung.',
    );
    this.name = 'DailyQuotaExceededError';
  }
}

export async function checkDailyLimit(
  numberId: string,
): Promise<{ allowed: boolean; limit: number; sentToday: number; remaining: number }> {
  const state = await getWarmUpState(numberId);
  return {
    allowed: state.remainingToday > 0,
    limit: state.dailyLimit,
    sentToday: state.sentToday,
    remaining: state.remainingToday,
  };
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

