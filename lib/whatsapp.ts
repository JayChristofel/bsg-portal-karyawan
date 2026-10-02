import { Agent } from 'undici';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const gowaDispatcher = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

export interface GowaConfig {
  baseUrl: string;
  deviceId: string;
  username?: string;
  password?: string;
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
    res = await fetch(url, {
      ...options,
      headers: buildHeaders(config, options.headers as Record<string, string> | undefined),
      dispatcher: gowaDispatcher,
      cache: 'no-store',
    } as RequestInit);
  } catch (err: any) {
    console.error('GOWA FETCH ERROR:', err?.message, '| cause:', err?.cause?.code, err?.cause?.message);
    throw err;
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { code: res.status === 200 ? 'OK' : 'ERROR', message: text, status: res.status };
  }
}

export async function getDeviceStatus(config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${cfg.deviceId}/status`);
}

export async function listDevices(config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, '/devices', { headers: {} });
}

export async function getQRCode(config?: GowaConfig): Promise<{ code: string; results?: { qr_url?: string; qr_link?: string; code?: string; qr_duration?: number } }> {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${cfg.deviceId}/login`);
}

export async function reconnectDevice(config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${cfg.deviceId}/reconnect`, { method: 'POST' });
}

export async function logoutDevice(config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${cfg.deviceId}/logout`, { method: 'POST' });
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
  }

  return gowaFetch(cfg, '/send/message', {
    method: 'POST',
    body: JSON.stringify({ phone: normalized, message }),
  });
}

export async function getDeviceWebhook(config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${cfg.deviceId}/webhook`);
}

export async function setDeviceWebhook(webhook_url: string, webhook_secret?: string, webhook_events?: string, config?: GowaConfig) {
  const cfg = config || (await getGowaConfig());
  return gowaFetch(cfg, `/devices/${cfg.deviceId}/webhook`, {
    method: 'PATCH',
    body: JSON.stringify({
      webhook_url,
      ...(webhook_secret !== undefined ? { webhook_secret } : {}),
      ...(webhook_events !== undefined ? { webhook_events } : {}),
    }),
  });
}

