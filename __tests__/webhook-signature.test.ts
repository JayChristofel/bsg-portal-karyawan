import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { verifyWebhookSignature as verifyEmail } from '@/lib/email';
import { verifyWebhookSignature as verifyWa } from '@/lib/whatsapp';

const sign = (secret: string, body: string) =>
  crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe.each([
  ['email', verifyEmail, 'EMAIL_WEBHOOK_SECRET'],
  ['whatsapp', verifyWa, 'WHATSAPP_WEBHOOK_SECRET'],
] as const)('%s webhook signature', (_name, verify, envVar) => {
  const body = '{"event":"delivered","recipientId":7}';

  beforeEach(() => {
    delete process.env.WEBHOOK_SECRET;
    process.env[envVar] = 's3cret-s3cret-s3cret';
  });

  it('accepts a correct signature, with or without the sha256= prefix', () => {
    const sig = sign('s3cret-s3cret-s3cret', body);
    expect(verify(body, sig)).toBe(true);
    expect(verify(body, `sha256=${sig}`)).toBe(true);
  });

  it('rejects a wrong secret, a tampered body and a missing header', () => {
    expect(verify(body, sign('other-secret-other-secret-xx', body))).toBe(false);
    expect(verify(body + ' ', sign('s3cret-s3cret-s3cret', body))).toBe(false);
    expect(verify(body, null)).toBe(false);
    expect(verify(body, '')).toBe(false);
    expect(verify(body, 'deadbeef')).toBe(false);
  });

  it('fails closed when no secret is configured', () => {
    delete process.env[envVar];
    expect(verify(body, sign('s3cret-s3cret-s3cret', body))).toBe(false);
  });
});
