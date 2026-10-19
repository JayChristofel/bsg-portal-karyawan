/**
 * Shared outbound-host guard (SSRF). Used for the WhatsApp gateway URL and the
 * SMTP host, both of which an admin can configure.
 *
 * It judges the hostname *text*; it does not resolve DNS, so a public name that
 * later resolves to a private address (rebinding) is not caught here. For that,
 * set the *_ALLOWED_HOSTS allowlist.
 */

// Public wildcard-DNS services: `127.0.0.1.nip.io` resolves to 127.0.0.1, so a
// "public" looking name can still point anywhere. Nothing legitimate needs them.
const WILDCARD_DNS = /(^|\.)(nip\.io|sslip\.io|xip\.io|traefik\.me|localtest\.me|lvh\.me|localhost\.direct)$/;

function ipv4Private(a: number, b: number): boolean {
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 100 && b >= 64 && b <= 127) // CGNAT
  );
}

/** `::ffff:7f00:1` or `::ffff:127.0.0.1` -> the embedded IPv4 octets, else null. */
function mappedIpv4(h: string): [number, number] | null {
  const dotted = h.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (dotted) return [Number(dotted[1]), Number(dotted[2])];
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    return [hi >> 8, hi & 0xff];
  }
  return null;
}

export function isPrivateHostname(hostname: string): boolean {
  // Strip brackets and any trailing dot ("localhost." is still localhost).
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');

  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (WILDCARD_DNS.test(h)) return true;

  if (h.includes(':')) {
    if (h === '::' || h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '0:0:0:0:0:0:0:0') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true; // unique-local / link-local
    const mapped = mappedIpv4(h);
    return mapped ? ipv4Private(mapped[0], mapped[1]) : false;
  }

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return v4 ? ipv4Private(Number(v4[1]), Number(v4[2])) : false;
}

/** Comma-separated env allowlist, lower-cased; empty array when unset. */
export function readHostAllowlist(envValue: string | undefined): string[] {
  return (envValue || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
