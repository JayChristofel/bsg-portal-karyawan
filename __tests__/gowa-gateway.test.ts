import { describe, expect, it, afterEach } from 'vitest';

import { isAllowedQrHost } from '@/app/api/whatsapp/qr/image/route';
import { validateGatewayUrl } from '@/lib/whatsapp';

/**
 * Guards for the QR image proxy. That endpoint accepts a caller-supplied URL
 * and fetches it server-side with the gateway's credentials, so an unconstrained
 * implementation would be an SSRF / open-proxy hole for any authenticated admin.
 */

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('QR image proxy — host allowlist', () => {
  it('accepts the configured gateway host', () => {
    process.env.GOWA_QR_ALLOWED_HOSTS = '';
    expect(isAllowedQrHost('107.23.128.93', '107.23.128.93')).toBe(true);
  });

  it('matches case-insensitively', () => {
    process.env.GOWA_QR_ALLOWED_HOSTS = '';
    expect(isAllowedQrHost('Gateway.Example.COM', 'gateway.example.com')).toBe(true);
  });

  it('rejects an arbitrary external host', () => {
    process.env.GOWA_QR_ALLOWED_HOSTS = '';
    expect(isAllowedQrHost('evil.example.com', '107.23.128.93')).toBe(false);
  });

  it('does not match a lookalike suffix', () => {
    process.env.GOWA_QR_ALLOWED_HOSTS = '';
    expect(isAllowedQrHost('107.23.128.93.evil.com', '107.23.128.93')).toBe(false);
  });

  it('honours an explicit allowlist for external QR hosts', () => {
    process.env.GOWA_QR_ALLOWED_HOSTS = 'cdn.example.com, charts.example.org';
    expect(isAllowedQrHost('cdn.example.com', '107.23.128.93')).toBe(true);
    expect(isAllowedQrHost('charts.example.org', '107.23.128.93')).toBe(true);
    expect(isAllowedQrHost('other.example.net', '107.23.128.93')).toBe(false);
  });

  it('ignores empty and whitespace allowlist entries', () => {
    process.env.GOWA_QR_ALLOWED_HOSTS = ' , , ';
    expect(isAllowedQrHost('cdn.example.com', '107.23.128.93')).toBe(false);
  });
});

describe('QR image proxy — SSRF guard reuse', () => {
  it('rejects loopback unless private hosts are allowed', () => {
    delete process.env.GOWA_ALLOW_PRIVATE_HOSTS;
    const result = validateGatewayUrl('http://127.0.0.1:3000/qr');
    expect(result.ok).toBe(false);
  });

  it('rejects the cloud metadata address', () => {
    delete process.env.GOWA_ALLOW_PRIVATE_HOSTS;
    expect(validateGatewayUrl('http://169.254.169.254/latest/meta-data/').ok).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(validateGatewayUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateGatewayUrl('gopher://example.com').ok).toBe(false);
  });

  it('rejects credentials embedded in the URL', () => {
    expect(validateGatewayUrl('https://user:pass@107.23.128.93/qr').ok).toBe(false);
  });

  it('accepts the public gateway host', () => {
    delete process.env.GOWA_ALLOW_PRIVATE_HOSTS;
    delete process.env.GOWA_QR_ALLOWED_HOSTS;
    process.env.GOWA_ALLOW_INSECURE_HTTP = '1';
    expect(validateGatewayUrl('http://107.23.128.93/device/qr/x').ok).toBe(true);
  });
});