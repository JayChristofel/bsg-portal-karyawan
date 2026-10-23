import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import { readFileSync } from 'node:fs';

/**
 * TLS trust for the WhatsApp gateway (OpenWA, or whatever is configured).
 *
 * A self-hosted gateway behind a reverse proxy often presents a self-signed
 * certificate, which Node's default verification rejects with
 * DEPTH_ZERO_SELF_SIGNED_CERT before any HTTP status or API key is evaluated.
 * Every gateway call then looks like a connectivity failure even though the
 * gateway is healthy.
 *
 * Trust is resolved per-deployment, in priority order:
 *   1. WHATSAPP_GATEWAY_CA_CERT — PEM text in an env var. Preferred, because
 *      it needs no file on disk and survives a serverless bundle.
 *   2. WHATSAPP_GATEWAY_CA_FILE — path to a PEM file, for self-hosted deployments.
 *   3. WHATSAPP_GATEWAY_TLS_INSECURE=1 — last resort: disables verification
 *      for gateway calls only. Never the default.
 *   4. Neither set — system default trust store (plain TLS, publicly trusted cert).
 *
 * Verification stays ON in cases 1-2; the certificate is pinned to a specific
 * CA rather than blindly trusted. Nothing here affects outbound calls to any
 * other host (database, webhooks), which keeps their verification intact.
 */

const CA_ENV_VAR = 'WHATSAPP_GATEWAY_CA_CERT';
const CA_FILE_ENV_VAR = 'WHATSAPP_GATEWAY_CA_FILE';
const INSECURE_ENV_VAR = 'WHATSAPP_GATEWAY_TLS_INSECURE';

export type TlsTrustMode = 'pinned-env' | 'pinned-file' | 'insecure' | 'system';

let cachedDispatcher: Dispatcher | null | undefined;
let cachedDispatcherKey = '';

function normalisePem(raw: string): string {
  // Env vars frequently carry escaped newlines from copy/paste and shell export.
  return raw.replace(/\\n/g, '\n').trim();
}

/** Rejects a PEM that lost its structure (e.g. newlines stripped in the UI). */
function isUsablePem(pem: string): boolean {
  return pem.includes('-----BEGIN CERTIFICATE-----') && pem.includes('-----END CERTIFICATE-----');
}

function readCaPem(): { pem: string; mode: TlsTrustMode } | null {
  const fromEnv = process.env[CA_ENV_VAR];
  if (fromEnv?.trim()) {
    const pem = normalisePem(fromEnv);
    if (isUsablePem(pem)) return { pem, mode: 'pinned-env' };
    console.error(
      `[gateway-tls] ${CA_ENV_VAR} is set but is not a valid PEM ` +
        '(missing BEGIN/END CERTIFICATE markers). Check that line breaks survived the paste.',
    );
  }

  const filePath = process.env[CA_FILE_ENV_VAR];
  if (filePath?.trim()) {
    try {
      const pem = readFileSync(filePath.trim(), 'utf8');
      if (isUsablePem(pem)) return { pem, mode: 'pinned-file' };
      console.error(`[gateway-tls] ${CA_FILE_ENV_VAR} does not contain a valid PEM certificate.`);
    } catch (err) {
      console.error(
        `[gateway-tls] ${CA_FILE_ENV_VAR} could not be read (${(err as Error).message}).`,
      );
    }
  }

  return null;
}

/** Describes how gateway TLS is trusted. Surfaced in the admin UI for diagnosis. */
export function gatewayTlsMode(): TlsTrustMode {
  if (process.env[CA_ENV_VAR]?.trim() && isUsablePem(normalisePem(process.env[CA_ENV_VAR]!))) {
    return 'pinned-env';
  }
  if (process.env[CA_FILE_ENV_VAR]?.trim() && hasReadablePem(process.env[CA_FILE_ENV_VAR]!)) {
    return 'pinned-file';
  }
  return process.env[INSECURE_ENV_VAR] === '1' ? 'insecure' : 'system';
}

function hasReadablePem(filePath: string): boolean {
  try {
    return isUsablePem(readFileSync(filePath.trim(), 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Scoped dispatcher for gateway traffic. Cached per configuration so warm
 * invocations reuse connections instead of re-handshaking TLS each time.
 */
export function gatewayDispatcher(): Dispatcher | null {
  const key = [
    process.env[CA_ENV_VAR]?.slice(0, 64) ?? '',
    process.env[CA_FILE_ENV_VAR] ?? '',
    process.env[INSECURE_ENV_VAR] ?? '',
  ].join('|');

  if (cachedDispatcher !== undefined && cachedDispatcherKey === key) {
    return cachedDispatcher;
  }

  const ca = readCaPem();
  if (ca) {
    cachedDispatcher = new Agent({
      connect: { ca: ca.pem },
      // Fail fast instead of hanging when the gateway is unreachable.
      headersTimeout: 15_000,
      bodyTimeout: 15_000,
      connectTimeout: 10_000,
    });
  } else if (process.env[INSECURE_ENV_VAR] === '1') {
    console.warn(
      `[gateway-tls] No usable gateway CA found; falling back to unverified TLS for ` +
        `gateway calls only. Set ${CA_ENV_VAR} to restore verification.`,
    );
    cachedDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  } else {
    cachedDispatcher = null;
  }

  cachedDispatcherKey = key;
  return cachedDispatcher;
}

/**
 * undici fetch instead of the global one, so the scoped dispatcher is honoured.
 * Next.js patches global fetch for caching, which is not wanted here anyway —
 * gateway responses must never be cached.
 */
export async function gatewayFetch(
  url: string,
  options: RequestInit = {},
): Promise<globalThis.Response> {
  const dispatcher = gatewayDispatcher();
  if (!dispatcher) {
    return fetch(url, { ...options, cache: 'no-store' });
  }
  return undiciFetch(url, {
    ...options,
    dispatcher,
  } as Parameters<typeof undiciFetch>[1]) as unknown as globalThis.Response;
}
