import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const MIN_KEY_LENGTH = 32;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < MIN_KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY is missing or shorter than ${MIN_KEY_LENGTH} chars. ` +
        'Generate one with: openssl rand -base64 32'
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
}

const ENCRYPTED_PREFIX = 'gcm1';

export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return (
    parts.length === 4 &&
    parts[0] === ENCRYPTED_PREFIX &&
    parts.slice(1).every((p) => /^[0-9a-f]*$/i.test(p))
  );
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [ENCRYPTED_PREFIX, iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  let parts: string[];
  if (isEncrypted(ciphertext)) {
    parts = ciphertext.split(':').slice(1);
  } else {
    return ciphertext;
  }
  const [ivHex, tagHex, dataHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encryptedText = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
}

export interface EmailConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string; // encrypted
  apiKey?: string; // for SendGrid/Resend, encrypted
  fromEmail: string;
  fromName: string;
}

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function validateSmtpUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'Invalid SMTP URL.' };
  }
  if (parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') {
    return { ok: false, error: 'SMTP URL must use smtp or smtps.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'SMTP URL must not contain credentials.' };
  }
  if (process.env.SMTP_ALLOW_PRIVATE_HOSTS !== '1' && isPrivateHostname(parsed.hostname)) {
    return { ok: false, error: 'SMTP hostname points to an internal/loopback network and was rejected.' };
  }
  const allowlist = (process.env.SMTP_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.includes(parsed.hostname.toLowerCase())) {
    return { ok: false, error: `SMTP hostname is not allowed. Allow: ${allowlist.join(', ')}` };
  }
  return { ok: true, url: rawUrl.trim() };
}

export async function getEmailConfig(): Promise<EmailConfig> {
  try {
    const { db } = await import('@/db');
    const { settings } = await import('@/db/schema');
    const { sql } = await import('drizzle-orm');
    const rows = await db.select().from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value] as [string, string]));

    const storedPassword = map.get('smtp_password') || '';
    const password = storedPassword ? decrypt(storedPassword) : undefined;
    const storedApiKey = map.get('smtp_api_key') || '';
    const apiKey = storedApiKey ? decrypt(storedApiKey) : undefined;

    return {
      host: map.get('smtp_host') || undefined,
      port: map.get('smtp_port') ? Number(map.get('smtp_port')) : undefined,
      secure: map.get('smtp_secure') !== 'false', // default true if not set
      username: map.get('smtp_username') || undefined,
      password: password || undefined,
      apiKey: apiKey || undefined,
      fromEmail: map.get('smtp_from_email') || 'no-reply@portal-pegawai.id',
      fromName: map.get('smtp_from_name') || 'Portal Pegawai',
    };
  } catch {
    return {
      host: undefined,
      port: undefined,
      secure: true,
      username: undefined,
      password: undefined,
      apiKey: undefined,
      fromEmail: 'no-reply@portal-pegawai.id',
      fromName: 'Portal Pegawai',
    };
  }
}

export async function saveEmailConfig(config: Partial<EmailConfig>) {
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
  if (config.host !== undefined) entries['smtp_host'] = config.host;
  if (config.port !== undefined) entries['smtp_port'] = String(config.port);
  if (config.secure !== undefined) entries['smtp_secure'] = String(config.secure).toLowerCase();
  if (config.username !== undefined) entries['smtp_username'] = config.username;
  if (config.password !== undefined) entries['smtp_password'] = config.password ? encrypt(String(config.password)) : '';
  if (config.apiKey !== undefined) entries['smtp_api_key'] = config.apiKey ? encrypt(String(config.apiKey)) : '';
  if (config.fromEmail !== undefined) entries['smtp_from_email'] = config.fromEmail;
  if (config.fromName !== undefined) entries['smtp_from_name'] = config.fromName;

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

export async function createSmtpTransport(config: EmailConfig) {
  const { host, port, secure, username, password } = config;
  const auth = username && password ? { user: username, pass: password } : undefined;
  return nodemailer.createTransport({
    host,
    port: port || 587,
    secure: secure === true ? true : false, // false means STARTTLS on port 587
    auth,
  });
}

/** Structured address: a name containing `<`, `>` or `,` cannot rewrite the From header. */
function fromAddress(config: EmailConfig) {
  return { name: (config.fromName || '').replace(/[\r\n]+/g, ' '), address: config.fromEmail };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replaces every `{{name}}` / `{{cabang}}` / `{{email}}` (any case, optional
 * inner spaces). Function replacers keep `$&`-style sequences literal; HTML
 * output escapes the values so a name cannot inject markup.
 */
export function renderEmailTemplate(
  template: string,
  vars: { name?: string; cabang?: string; email: string },
  { html }: { html: boolean },
): string {
  const val = (v: string | undefined) => (html ? escapeHtml(v ?? '') : (v ?? ''));
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, () => val(vars.name))
    .replace(/\{\{\s*cabang\s*\}\}/gi, () => val(vars.cabang))
    .replace(/\{\{\s*email\s*\}\}/gi, () => val(vars.email));
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  config,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  config: EmailConfig;
}) {
  const transport = await createSmtpTransport(config);
  try {
    return await transport.sendMail({ from: fromAddress(config), to, subject, text, html });
  } finally {
    transport.close();
  }
}

export interface BulkEmailResult {
  email: string;
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends one personalised message per recipient over a single SMTP transport.
 *
 * One failing recipient never aborts the others, and `onResult` fires as each
 * finishes so the caller can persist progress immediately (a crash mid-run then
 * loses at most the messages in flight, not the whole batch).
 */
export async function sendBulkEmails({
  recipients,
  subject,
  html,
  text,
  config,
  concurrency = 5,
  onResult,
}: {
  recipients: Array<{ id?: number; email: string; name?: string; cabang?: string }>;
  subject: string;
  html: string;
  text: string;
  config: EmailConfig;
  concurrency?: number;
  onResult?: (
    result: BulkEmailResult,
    recipient: { id?: number; email: string; name?: string; cabang?: string },
  ) => void | Promise<void>;
}): Promise<BulkEmailResult[]> {
  const transport = await createSmtpTransport(config);
  const results: BulkEmailResult[] = new Array(recipients.length);
  let next = 0;

  const worker = async () => {
    while (next < recipients.length) {
      const i = next++;
      const rec = recipients[i];
      let result: BulkEmailResult;
      try {
        const info = await transport.sendMail({
          from: fromAddress(config),
          to: rec.email,
          subject,
          text: renderEmailTemplate(text, rec, { html: false }),
          html: renderEmailTemplate(html, rec, { html: true }),
        });
        result = { email: rec.email, ok: true, messageId: info.messageId };
      } catch (err) {
        result = { email: rec.email, ok: false, error: (err as Error).message };
      }
      results[i] = result;
      if (onResult) await onResult(result, rec);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  } finally {
    transport.close();
  }
  return results;
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader) return false;
  const provided = signatureHeader.trim().replace(/^sha256=/i, '');
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}