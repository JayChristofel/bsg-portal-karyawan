import crypto from 'node:crypto';
import { asNetError } from '@/lib/utils';
import { gatewayFetch, gatewayTlsMode } from './gateway-tls';
import { isPrivateHostname, readHostAllowlist } from './net-guard';
import { rowsOf } from './db-util';

export interface GatewayConfig {
  baseUrl: string;
  /** Human-readable OpenWA session name, e.g. "portal-pegawai". */
  sessionId: string;
  apiKey?: string;
}

/**
 * Outbound URL guard for the WhatsApp gateway.
 *
 * The gateway URL is admin-configurable and persisted in the settings table,
 * which makes it an SSRF sink: without this check an attacker (or a hijacked
 * admin session) could point it at 127.0.0.1, the cloud metadata endpoint, or
 * any internal service.
 *
 * Set WHATSAPP_GATEWAY_ALLOWED_HOSTS (comma-separated) to lock this down further.
 * Loopback/private ranges are only permitted when WHATSAPP_GATEWAY_ALLOW_PRIVATE_HOSTS=1,
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

  if (process.env.WHATSAPP_GATEWAY_ALLOW_PRIVATE_HOSTS !== '1' && isPrivateHostname(parsed.hostname)) {
    return {
      ok: false,
      error:
        'Gateway hostname points to an internal/loopback network and was rejected. ' +
        'Set WHATSAPP_GATEWAY_ALLOWED_HOSTS if you intentionally use a private gateway.',
    };
  }

  const allowlist = readHostAllowlist(process.env.WHATSAPP_GATEWAY_ALLOWED_HOSTS);

  if (allowlist.length > 0 && !allowlist.includes(parsed.hostname.toLowerCase())) {
    return { ok: false, error: `Gateway hostname is not allowed. Allow: ${allowlist.join(', ')}` };
  }

  if (parsed.protocol === 'http:' && process.env.WHATSAPP_GATEWAY_ALLOW_INSECURE_HTTP !== '1') {
    return {
      ok: false,
      error: 'Gateway URL must use HTTPS. Set WHATSAPP_GATEWAY_ALLOW_INSECURE_HTTP=1 for local development only.',
    };
  }

  return { ok: true, url: rawUrl.trim().replace(/\/+$/, '') };
}

/**
 * HMAC-SHA256 signature verification for inbound OpenWA webhooks.
 * Set WHATSAPP_WEBHOOK_SECRET on both this app and the gateway (same value
 * passed as the webhook `secret` when it is registered).
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

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  baseUrl: (process.env.WHATSAPP_API_URL || '').replace(/\/+$/, ''),
  sessionId: process.env.WHATSAPP_DEVICE_ID || 'portal-pegawai',
  apiKey: process.env.WHATSAPP_API_KEY || undefined,
};

export const GATEWAY_CONFIG_KEYS = {
  url: 'gateway_url',
  sessionId: 'gateway_session_id',
  apiKey: 'gateway_api_key',
} as const;

export async function getGatewayConfig(): Promise<GatewayConfig> {
  try {
    const { db } = await import('@/db');
    const { settings } = await import('@/db/schema');
    const { decrypt } = await import('@/lib/crypto');
    const rows = await db.select().from(settings);
    const overrides = new Map<string, string>(rows.map((r) => [r.key, r.value] as [string, string]));

    const storedApiKey = overrides.get(GATEWAY_CONFIG_KEYS.apiKey) || '';
    const apiKey = storedApiKey ? decrypt(storedApiKey) : undefined;

    return {
      baseUrl: (overrides.get(GATEWAY_CONFIG_KEYS.url) || DEFAULT_GATEWAY_CONFIG.baseUrl).replace(/\/+$/, ''),
      sessionId: overrides.get(GATEWAY_CONFIG_KEYS.sessionId) || DEFAULT_GATEWAY_CONFIG.sessionId,
      apiKey: apiKey || DEFAULT_GATEWAY_CONFIG.apiKey,
    };
  } catch {
    return DEFAULT_GATEWAY_CONFIG;
  }
}

export async function saveGatewayConfig(config: Partial<GatewayConfig>) {
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
  if (config.baseUrl !== undefined) entries[GATEWAY_CONFIG_KEYS.url] = config.baseUrl.trim();
  if (config.sessionId !== undefined) entries[GATEWAY_CONFIG_KEYS.sessionId] = config.sessionId.trim();
  if (config.apiKey !== undefined) entries[GATEWAY_CONFIG_KEYS.apiKey] = config.apiKey;

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

function buildHeaders(config: GatewayConfig, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
  if (config.apiKey) headers['X-API-Key'] = config.apiKey;
  return headers;
}

const GATEWAY_TIMEOUT_MS = 15_000;
const MAX_GATEWAY_RESPONSE_BYTES = 1_000_000;
let warnedOpenAllowlist = false;

/**
 * Checked on every call, not only when the URL is saved: the API key is
 * attached to whatever host is stored, so a hijacked session that swapped the URL
 * must not get the gateway key sent to its server.
 */
function assertGatewayHostAllowed(baseUrl: string): void {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    throw new Error('Gateway URL is invalid.');
  }
  const allowlist = readHostAllowlist(process.env.WHATSAPP_GATEWAY_ALLOWED_HOSTS);
  if (allowlist.length > 0) {
    if (!allowlist.includes(host)) {
      throw new Error('Gateway hostname is not in WHATSAPP_GATEWAY_ALLOWED_HOSTS; request blocked.');
    }
  } else if (process.env.NODE_ENV === 'production' && !warnedOpenAllowlist) {
    warnedOpenAllowlist = true;
    console.warn(
      '[gateway] WHATSAPP_GATEWAY_ALLOWED_HOSTS is not set: the gateway API key is sent to ' +
        'whichever host is saved in the settings. Set it to the gateway hostname.',
    );
  }
}

/**
 * Low-level JSON call to the gateway's REST API (paths are relative to `/api`).
 * Returns the parsed body as-is (object, array, or a `{message}` fallback for
 * a non-JSON response) alongside the HTTP status, so callers can distinguish
 * "the gateway answered with an error" from "the request never reached it".
 */
async function gatewayFetchJson(
  config: GatewayConfig,
  path: string,
  options: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  assertGatewayHostAllowed(config.baseUrl);
  const url = `${config.baseUrl}/api${path}`;
  let res: Response;
  try {
    // Routed through the scoped dispatcher so a self-signed gateway
    // certificate can be pinned without weakening TLS for other hosts.
    res = await gatewayFetch(url, {
      ...options,
      headers: buildHeaders(config, options.headers as Record<string, string> | undefined),
      cache: 'no-store',
      redirect: 'manual',
      signal: options.signal ?? AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    console.error('GATEWAY FETCH ERROR:', asNetError(err).message, '| cause:', asNetError(err).cause?.code, asNetError(err).cause?.message);
    throw err;
  }

  if (Number(res.headers.get('content-length') ?? 0) > MAX_GATEWAY_RESPONSE_BYTES) {
    throw new Error('Gateway response is too large.');
  }
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    // The gateway always answers JSON. Anything else -- an nginx error page, a
    // login form -- is a failure even when the HTTP status is 200, otherwise every
    // send would be reported as delivered.
    return { status: res.status, body: { message: text.slice(0, 300) } };
  }
}

interface OpenWaSession {
  id: string;
  name: string;
  status: 'created' | 'initializing' | 'qr_ready' | 'authenticating' | 'ready' | 'disconnected' | 'action_required' | 'failed';
  phone?: string | null;
  pushName?: string | null;
  connectedAt?: string | null;
  lastActive?: string | null;
  lastError?: string | null;
}

/** All sessions visible to this API key. */
export async function listSessions(config?: GatewayConfig): Promise<OpenWaSession[]> {
  const cfg = config || (await getGatewayConfig());
  const { body } = await gatewayFetchJson(cfg, '/sessions');
  return Array.isArray(body) ? (body as OpenWaSession[]) : [];
}

async function findSessionByName(cfg: GatewayConfig, name: string): Promise<OpenWaSession | null> {
  const { body } = await gatewayFetchJson(cfg, `/sessions?name=${encodeURIComponent(name)}`);
  return Array.isArray(body) && body.length > 0 ? (body[0] as OpenWaSession) : null;
}

async function createSession(cfg: GatewayConfig, name: string): Promise<OpenWaSession> {
  const { status, body } = await gatewayFetchJson(cfg, '/sessions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  const session = body as Partial<OpenWaSession> & { message?: string };
  if (status >= 400 || !session.id) {
    throw new Error(session.message || `Gateway refused to create session '${name}' (HTTP ${status}).`);
  }
  return session as OpenWaSession;
}

const sessionUuidCache = new Map<string, string>();

/**
 * OpenWA addresses a session by UUID, but the admin configures a human-readable
 * name (kept in GATEWAY_CONFIG_KEYS.sessionId, same role `deviceId` played for
 * the previous gateway). Resolve the name to its UUID once per (baseUrl, name)
 * and cache it for this instance's lifetime; a 404 from a session-scoped call
 * means the gateway-side session is gone, so the cache is dropped and the name
 * is re-resolved (creating it if needed) on the retry.
 */
async function resolveSessionUuid(cfg: GatewayConfig, opts: { invalidate?: boolean } = {}): Promise<string> {
  const cacheKey = `${cfg.baseUrl}|${cfg.sessionId}`;
  if (opts.invalidate) sessionUuidCache.delete(cacheKey);

  const cached = sessionUuidCache.get(cacheKey);
  if (cached) return cached;

  const existing = await findSessionByName(cfg, cfg.sessionId);
  const uuid = existing?.id ?? (await createSession(cfg, cfg.sessionId)).id;
  sessionUuidCache.set(cacheKey, uuid);
  return uuid;
}

/** Session-scoped call: resolves the configured name to a UUID and retries once if it's stale. */
async function sessionFetch(
  cfg: GatewayConfig,
  pathAfterId: string,
  options: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  let uuid = await resolveSessionUuid(cfg);
  let res = await gatewayFetchJson(cfg, `/sessions/${encodeURIComponent(uuid)}${pathAfterId}`, options);
  if (res.status === 404) {
    uuid = await resolveSessionUuid(cfg, { invalidate: true });
    res = await gatewayFetchJson(cfg, `/sessions/${encodeURIComponent(uuid)}${pathAfterId}`, options);
  }
  return res;
}

export async function getSessionStatus(config?: GatewayConfig): Promise<OpenWaSession> {
  const cfg = config || (await getGatewayConfig());
  const { body } = await sessionFetch(cfg, '');
  return body as OpenWaSession;
}

export async function startSession(config?: GatewayConfig) {
  const cfg = config || (await getGatewayConfig());
  const { body } = await sessionFetch(cfg, '/start', { method: 'POST' });
  return body as OpenWaSession;
}

export async function logoutSession(config?: GatewayConfig) {
  const cfg = config || (await getGatewayConfig());
  const { body } = await sessionFetch(cfg, '/logout', { method: 'POST' });
  return body;
}

/** Connectivity + API key check for the admin "Test Connection" button. */
export async function testGatewayConnection(
  config?: GatewayConfig,
): Promise<{ authOk: boolean; status: number; body: unknown }> {
  const cfg = config || (await getGatewayConfig());
  const { status, body } = await gatewayFetchJson(cfg, '/sessions');
  return { authOk: status === 200, status, body };
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
 * Ensures the session exists and is starting, then requests a pairing QR.
 *
 * A session that is already `ready` is healthy and paired, so that must not be
 * reported as a connection failure — it previously surfaced as "make sure the
 * gateway is running", which sent admins down the wrong path.
 */
export async function requestQr(config?: GatewayConfig): Promise<QrResult> {
  const cfg = config || (await getGatewayConfig());

  try {
    const status = await getSessionStatus(cfg);

    if (status.status === 'ready') {
      return {
        ok: false,
        reason: 'already-logged-in',
        message: 'Device is already paired. Disconnect it first if you want to re-pair.',
      };
    }

    if (status.status === 'created' || status.status === 'disconnected' || status.status === 'failed') {
      await startSession(cfg);
    }

    const { status: httpStatus, body } = await sessionFetch(cfg, '/qr');
    const qr = body as { qrCode?: string; status?: string; message?: string };

    if (httpStatus >= 400 || !qr.qrCode) {
      return {
        ok: false,
        reason: 'gateway-error',
        status: httpStatus,
        message: qr.message || 'Gateway did not return a QR code.',
      };
    }

    // The data URI is rendered straight into an <img src>; no separate image
    // fetch/proxy is needed (unlike a gateway that answers with a link).
    return { ok: true, qrLink: qr.qrCode, qrDuration: 30 };
  } catch (err: unknown) {
    const cause = asNetError(err).cause?.code || '';
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
            ? 'Set WHATSAPP_GATEWAY_CA_CERT to the gateway CA certificate.'
            : 'The configured CA did not match the certificate the gateway presented — it may have been rotated.')
        : `Could not reach the gateway: ${asNetError(err).message ?? 'unknown network error'} (trust mode: ${mode})`,
    };
  }
}

/**
 * Normalises an Indonesian number to digits only (leading 0 -> 62). Returns null
 * for anything that is not a plausible phone number, so letters, JIDs such as
 * "123@g.us" and other junk never reach the gateway.
 */
export function normalizeWaPhone(phone: string): string | null {
  let normalized = phone.replace(/[\s\-+()]/g, '');
  if (normalized.startsWith('0')) {
    normalized = '62' + normalized.slice(1);
  } else if (normalized.startsWith('8') && normalized.length >= 9) {
    normalized = '62' + normalized;
  }
  return /^\d{8,15}$/.test(normalized) ? normalized : null;
}

/** OpenWA addresses individual chats as `<digits>@c.us`. */
export function toChatId(phone: string): string | null {
  const normalized = normalizeWaPhone(phone);
  return normalized ? `${normalized}@c.us` : null;
}

export async function sendMessage(phone: string, message: string, config?: GatewayConfig) {
  const chatId = toChatId(phone);
  if (!chatId) throw new Error('Invalid phone number.');
  const cfg = config || (await getGatewayConfig());

  const { status, body } = await sessionFetch(cfg, '/messages/send-text', {
    method: 'POST',
    body: JSON.stringify({ chatId, text: message }),
  });
  const result = body as { messageId?: string; timestamp?: number; message?: string };
  if (status >= 400 || !result.messageId) {
    throw new Error(result.message || `Gateway refused the message (HTTP ${status}).`);
  }
  return result;
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
  config?: GatewayConfig,
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

  const result = await db.execute(sql`
    UPDATE send_counters
       SET sent = sent + 1, updated_at = NOW()
     WHERE number_id = ${numberId}
       AND day = ${day}
       AND sent < ${dailyLimit}
    RETURNING sent
  `);

  return rowsOf(result).length > 0;
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

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function listSessionWebhooks(config?: GatewayConfig): Promise<WebhookSubscription[]> {
  const cfg = config || (await getGatewayConfig());
  const { body } = await sessionFetch(cfg, '/webhooks');
  return Array.isArray(body) ? (body as WebhookSubscription[]) : [];
}

/**
 * The admin UI manages a single webhook endpoint per session; OpenWA itself
 * supports several per session, so the first one registered is treated as
 * "the" managed webhook.
 */
export async function getManagedWebhook(config?: GatewayConfig): Promise<WebhookSubscription | null> {
  const list = await listSessionWebhooks(config);
  return list[0] ?? null;
}

export async function setManagedWebhook(
  webhookUrl: string,
  webhookSecret: string | undefined,
  webhookEvents: string[],
  config?: GatewayConfig,
): Promise<WebhookSubscription> {
  const cfg = config || (await getGatewayConfig());
  const existing = await getManagedWebhook(cfg);

  const payload: Record<string, unknown> = {
    url: webhookUrl,
    events: webhookEvents.length ? webhookEvents : ['message.ack'],
  };
  // An empty secret means "leave as is": sending '' would clear a secret already
  // set on the gateway, and every later event would then fail signature verification.
  if (webhookSecret) payload.secret = webhookSecret;

  const { status, body } = existing
    ? await sessionFetch(cfg, `/webhooks/${encodeURIComponent(existing.id)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    : await sessionFetch(cfg, '/webhooks', { method: 'POST', body: JSON.stringify(payload) });

  if (status >= 400) {
    throw new Error((body as { message?: string })?.message || `Could not save the webhook (HTTP ${status}).`);
  }
  return body as WebhookSubscription;
}

/**
 * Registers the app's webhook on a session other than the default one — e.g. a
 * warmer pair's session, which the single-session webhook admin UI never touches.
 * Best-effort: callers should not fail their own operation if this throws (APP_URL
 * or WHATSAPP_WEBHOOK_SECRET may not be set, or the session may not exist yet).
 */
export async function ensureSessionWebhook(sessionId: string): Promise<void> {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error('APP_URL is not set; cannot register a webhook URL.');

  const defaultConfig = await getGatewayConfig();
  const config: GatewayConfig = { ...defaultConfig, sessionId };

  await setManagedWebhook(
    `${appUrl.replace(/\/$/, '')}/api/webhook/whatsapp`,
    process.env.WHATSAPP_WEBHOOK_SECRET,
    ['message.ack'],
    config,
  );
}
