import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { encrypt, safeDecrypt, DECRYPT_FAILED } from './crypto';
import { isPrivateHostname, readHostAllowlist } from './net-guard';

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
  const allowlist = readHostAllowlist(process.env.SMTP_ALLOWED_HOSTS);
  if (allowlist.length > 0 && !allowlist.includes(parsed.hostname.toLowerCase())) {
    return { ok: false, error: `SMTP hostname is not allowed. Allow: ${allowlist.join(', ')}` };
  }
  return { ok: true, url: rawUrl.trim() };
}

/** Same rules as validateSmtpUrl, for the bare host the admin form submits. */
export function validateSmtpHost(host: string): { ok: true } | { ok: false; error: string } {
  const h = host.trim();
  if (!h) return { ok: true }; // clearing the host is allowed
  if (!/^[a-z0-9.-]+$/i.test(h) || h.length > 253) {
    return { ok: false, error: 'SMTP host tidak valid.' };
  }
  const check = validateSmtpUrl(`smtp://${h}`);
  return check.ok ? { ok: true } : { ok: false, error: check.error };
}

export async function getEmailConfig(): Promise<EmailConfig> {
  try {
    const { db } = await import('@/db');
    const { settings } = await import('@/db/schema');
    const { sql } = await import('drizzle-orm');
    const rows = await db.select().from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value] as [string, string]));

    const storedPassword = map.get('smtp_password') || '';
    // An unreadable secret (wrong key / corruption) is reported and treated as
    // unset rather than silently replacing the whole config with defaults.
    const readSecret = (stored: string, name: string) => {
      if (!stored) return undefined;
      const value = safeDecrypt(stored);
      if (value === DECRYPT_FAILED) {
        console.error(`SMTP ${name} could not be decrypted; re-enter it in the email settings.`);
        return undefined;
      }
      return value;
    };
    const password = readSecret(storedPassword, 'password');
    const storedApiKey = map.get('smtp_api_key') || '';
    const apiKey = readSecret(storedApiKey, 'API key');

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
  // An empty secret means "unchanged": the settings form never receives the stored
  // value back, so it submits '' unless the admin typed a new one.
  if (config.password) entries['smtp_password'] = encrypt(String(config.password));
  if (config.apiKey) entries['smtp_api_key'] = encrypt(String(config.apiKey));
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

/**
 * Verifies an HMAC-SHA256 signature over the *raw* request body (re-serialising
 * parsed JSON would not reproduce the signed bytes). Fails closed without a secret.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.EMAIL_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const provided = signatureHeader.trim().replace(/^sha256=/i, '').toLowerCase();
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
